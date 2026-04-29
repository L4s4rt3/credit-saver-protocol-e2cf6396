// Edge function: analizar-parte
// Implementa el spec §11: extracción determinista server-side de XLSX +
// llamada directa a Gemini para imágenes/contexto, escritura idempotente en
// production_runs / gstock_entries / lotes_dia, y auto-fill del inventario anterior.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";
import * as XLSX from "https://esm.sh/xlsx@0.18.5";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface ArchivoRow {
  id: string;
  file_name: string | null;
  file_path: string | null;
  file_type: string | null;
  mime_type: string | null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "No autorizado" }, 401);

    const { part_id } = await req.json();
    if (!part_id || typeof part_id !== "string") {
      return json({ error: "part_id requerido" }, 400);
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY =
      Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY");
    if (!OPENROUTER_API_KEY) return json({ error: "OPENROUTER_API_KEY no configurada" }, 500);

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) return json({ error: "No autenticado" }, 401);
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // 2. Ownership
    const { data: parte, error: pErr } = await userClient
      .from("partes_diarios")
      .select("*")
      .eq("id", part_id)
      .maybeSingle();
    if (pErr || !parte) return json({ error: "Parte no encontrado" }, 404);

    // 3. Auto-fill inventario anterior si está vacío
    if (!Number(parte.kg_inventario_anterior_sin_alta)) {
      const { data: prev } = await userClient
        .from("partes_diarios")
        .select("kg_inventario_sin_alta, date")
        .eq("user_id", parte.user_id)
        .lt("date", parte.date)
        .order("date", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (prev && Number(prev.kg_inventario_sin_alta) > 0) {
        await userClient
          .from("partes_diarios")
          .update({ kg_inventario_anterior_sin_alta: Number(prev.kg_inventario_sin_alta) })
          .eq("id", part_id);
        parte.kg_inventario_anterior_sin_alta = Number(prev.kg_inventario_sin_alta);
      }
    }

    // 4. Archivos
    const { data: archivos, error: aErr } = await userClient
      .from("partes_archivos")
      .select("id,file_name,file_path,file_type,mime_type")
      .eq("part_id", part_id);
    if (aErr) return json({ error: aErr.message }, 500);
    const files = (archivos ?? []) as ArchivoRow[];
    if (files.length === 0) return json({ error: "No hay archivos adjuntos" }, 400);

    // 5. Detección por nombre
    const classify = (f: ArchivoRow) => {
      const name = (f.file_name ?? "").toLowerCase();
      const ft = (f.file_type ?? "").toLowerCase();
      if (ft === "gstock" || /g[\s_-]?stock/i.test(name)) return "gstock";
      if (/producción|produccion/i.test(name) && !/producto/i.test(name)) return "produccion";
      if (/tamaño|tamano|clase|calidad|producto/i.test(name)) return "tamanos";
      if (/palet/i.test(name)) return "palets";
      return "otro";
    };

    // 7. Extracción determinista server-side
    const server: Record<string, number> = {};
    const fileContexts: { f: ArchivoRow; kind: string; csv?: string; bytes?: Uint8Array; mime: string }[] = [];

    for (const f of files) {
      if (!f.file_path) continue;
      const { data: blob, error: dlErr } = await admin.storage
        .from("partes-archivos")
        .download(f.file_path);
      if (dlErr || !blob) {
        console.warn("dl fail", f.file_path, dlErr?.message);
        continue;
      }
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const mime = f.mime_type ?? blob.type ?? "application/octet-stream";
      const kind = classify(f);
      const isXlsx =
        /\.xlsx?$/i.test(f.file_name ?? "") ||
        mime.includes("spreadsheet") ||
        mime === "application/vnd.ms-excel";

      if (isXlsx) {
        try {
          const repaired = repairXlsx(bytes);
          const wb = XLSX.read(repaired, { type: "array" });
          const rowsAll: any[][] = [];
          for (const sn of wb.SheetNames) {
            const ws = wb.Sheets[sn];
            const r = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, blankrows: false, defval: null });
            rowsAll.push(...r);
          }

          if (kind === "gstock" || kind === "palets") {
            const v = extractNetos(rowsAll);
            if (v > 0) {
              // GSTOCK tiene prioridad sobre palets legacy
              if (kind === "gstock" || !server.kg_palets_brutos) {
                server.kg_palets_brutos = v;
              }
            }
          } else if (kind === "tamanos") {
            const { mujeres, podrido } = extractTamanos(rowsAll);
            if (mujeres > 0) server.kg_mujeres_calibrador = mujeres;
            if (podrido > 0) server.kg_podrido_calibrador_auto = podrido;
          } else if (kind === "produccion") {
            const v = extractProduccionTotal(rowsAll);
            if (v > 0) server.kg_produccion_calibrador = v;
          }

          // CSV truncado para contexto a IA
          const csv = rowsAll
            .map((r) => r.map((c) => (c == null ? "" : String(c))).join(","))
            .join("\n")
            .slice(0, 120_000);
          fileContexts.push({ f, kind, csv, mime });
        } catch (e) {
          console.warn("xlsx parse fail", f.file_name, e);
          fileContexts.push({ f, kind, bytes, mime });
        }
      } else {
        fileContexts.push({ f, kind, bytes, mime });
      }
    }

    // 8-9. Construir prompt Gemini
    const hint = `Eres analista de una empresa citrícola. Extrae datos del parte diario en kg.
Archivos clasificados:
${fileContexts.map((c) => `- [${c.kind}] ${c.f.file_name}`).join("\n")}

Devuelve JSON estricto con esta forma exacta:
{
  "kg_produccion_total": number,
  "kg_mujeres_l": number,
  "kg_podrido_calibrador": number,
  "kg_palets_alta": number,
  "produccion": [{"product":"string","size_range":"string","kg_produced":number}],
  "gstock": [{"product":"string","size_range":"string","kg_expected":number}],
  "lotes": [{"producto":"string","lote_codigo":"string","notas":"string"}],
  "notas": "string"
}
Omite los campos que no encuentres (no inventes). Los totales ya se recalculan server-side desde XLSX si están presentes.`;

    const parts: any[] = [{ text: hint }];
    for (const c of fileContexts) {
      if (c.csv) {
        parts.push({ text: `\n--- [${c.kind}] ${c.f.file_name} ---\n${c.csv}` });
      } else if (c.bytes && c.mime.startsWith("image/")) {
        parts.push({ inline_data: { mime_type: c.mime, data: base64Encode(c.bytes) } });
      } else if (c.bytes && c.mime === "application/pdf") {
        parts.push({ inline_data: { mime_type: c.mime, data: base64Encode(c.bytes) } });
      }
    }

    const hasBinaryAiInputs = fileContexts.some((c) => c.bytes && (c.mime.startsWith("image/") || c.mime === "application/pdf"));
    const perAttemptTimeoutMs = hasBinaryAiInputs ? 25_000 : 12_000;
    const body = JSON.stringify({
      contents: [{ role: "user", parts }],
      generationConfig: { response_mime_type: "application/json", temperature: 0.1 },
    });
    let aiData: any = {};
    let aiWarning: string | null = null;

    // Modelos a probar en orden. Si el primero da 503/overload, caemos al lite.
    const modelChain = ["meta-llama/llama-3.3-70b-instruct:free", "mistralai/mistral-7b-instruct:free"];
    const RETRYABLE = new Set([429, 500, 502, 503, 504]);
    let lastStatus = 0;
    let lastBody = "";
    let succeeded = false;

    outer: for (const model of modelChain) {
      // Hasta 3 intentos por modelo con backoff exponencial + jitter
      for (let attempt = 0; attempt < 3; attempt++) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), perAttemptTimeoutMs);
        try {
          const aiResp = await fetch(
            `https://openrouter.ai/api/v1/chat/completions,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
              },

              signal: controller.signal,
              body: JSON.stringify({
                model,
                messages: [{ role: "user", content: parts.map((p: any) => p.text ?? "").join("\n") }],
                response_format: { type: "json_object" },
              }),
            },
          );
          clearTimeout(timeout);

          if (aiResp.ok) {
            const aiJson = await aiResp.json();
            const text = aiJson?.choices?.[0]?.message?.content ?? "{}";
            try {
              aiData = JSON.parse(text);
              succeeded = true;
            } catch {
              aiWarning = "La IA devolvió un JSON no válido";
              aiData = {};
              succeeded = true; // no reintentar: el modelo respondió, solo mal formateado
            }
            break outer;
          }

          lastStatus = aiResp.status;
          lastBody = await aiResp.text();
          console.warn(`Gemini ${model} intento ${attempt + 1} → ${aiResp.status}`);

          if (aiResp.status === 403) {
            aiWarning = "Gemini rechazó la clave configurada";
            break outer; // no tiene sentido reintentar
          }
          if (!RETRYABLE.has(aiResp.status)) {
            aiWarning = `Gemini devolvió ${aiResp.status}`;
            break; // probar siguiente modelo
          }
          // Retryable → backoff
          const delay = 500 * Math.pow(2, attempt) + Math.floor(Math.random() * 300);
          await new Promise((r) => setTimeout(r, delay));
        } catch (e) {
          clearTimeout(timeout);
          const isAbort = e instanceof Error && e.name === "AbortError";
          console.warn(`Gemini ${model} intento ${attempt + 1} falló:`, e);
          lastStatus = 0;
          lastBody = isAbort ? "timeout" : (e instanceof Error ? e.message : "error desconocido");
          // backoff antes de siguiente intento
          const delay = 500 * Math.pow(2, attempt) + Math.floor(Math.random() * 300);
          await new Promise((r) => setTimeout(r, delay));
        }
      }
    }

    if (!succeeded && !aiWarning) {
      if (lastStatus === 429) aiWarning = "Límite IA superado";
      else if (lastStatus === 503) aiWarning = "IA saturada temporalmente, reintenta en unos minutos";
      else if (lastStatus === 0) aiWarning = "Tiempo de espera agotado al consultar IA";
      else aiWarning = `Gemini devolvió ${lastStatus}`;
      console.error("Gemini exhausted retries", lastStatus, lastBody.slice(0, 500));
    }


    // 10. Merge — server-side override. Mapeo spec → BD.
    const mapping: Record<string, string> = {
      kg_produccion_total: "kg_produccion_calibrador",
      kg_mujeres_l: "kg_mujeres_calibrador",
      kg_podrido_calibrador: "kg_podrido_calibrador_auto",
      kg_palets_alta: "kg_palets_brutos",
    };
    const update: Record<string, any> = {};
    for (const [specKey, dbKey] of Object.entries(mapping)) {
      const sv = server[dbKey];
      const av = Number(aiData?.[specKey]);
      if (typeof sv === "number" && sv > 0) update[dbKey] = sv;
      else if (isFinite(av) && av > 0) update[dbKey] = av;
    }
    update.resumen_ia = { ...aiData, _server_side: server, _ai_warning: aiWarning };
    update.estado = "Analizado";

    const { error: upErr } = await userClient
      .from("partes_diarios")
      .update(update)
      .eq("id", part_id);
    if (upErr) {
      console.error("partes_diarios update failed", upErr);
      return json({ error: `No se pudo actualizar el parte: ${upErr.message}` }, 500);
    }

    // 11. Idempotencia: borrar y reinsertar
    const { error: prDeleteErr } = await userClient.from("production_runs").delete().eq("part_id", part_id);
    if (prDeleteErr) console.error("production_runs delete failed", prDeleteErr);
    const { error: gsDeleteErr } = await userClient.from("gstock_entries").delete().eq("part_id", part_id);
    if (gsDeleteErr) console.error("gstock_entries delete failed", gsDeleteErr);
    const { error: lotesDeleteErr } = await userClient.from("lotes_dia").delete().eq("part_id", part_id).eq("source", "ia");
    if (lotesDeleteErr) console.error("lotes_dia delete failed", lotesDeleteErr);

    const uid = userData.user.id;
    if (Array.isArray(aiData.produccion) && aiData.produccion.length > 0) {
      const rows = aiData.produccion
        .filter((r: any) => Number(r?.kg_produced) > 0)
        .map((r: any) => ({
          part_id, user_id: uid, date: parte.date, source: "ia",
          product: r.product ?? null, size_range: r.size_range ?? null,
          kg_produced: Number(r.kg_produced) || 0,
        }));
      if (rows.length) {
        const { error } = await userClient.from("production_runs").insert(rows);
        if (error) console.error("production_runs insert failed", error, rows.slice(0, 3));
      }
    }
    if (Array.isArray(aiData.gstock) && aiData.gstock.length > 0) {
      const rows = aiData.gstock
        .filter((r: any) => Number(r?.kg_expected) > 0)
        .map((r: any) => ({
          part_id, user_id: uid, date: parte.date, source: "ia",
          product: r.product ?? null, size_range: r.size_range ?? null,
          kg_expected: Number(r.kg_expected) || 0,
        }));
      if (rows.length) {
        const { error } = await userClient.from("gstock_entries").insert(rows);
        if (error) console.error("gstock_entries insert failed", error, rows.slice(0, 3));
      }
    }
    if (Array.isArray(aiData.lotes) && aiData.lotes.length > 0) {
      const rows = aiData.lotes.map((r: any) => ({
        part_id, user_id: uid, source: "ia",
        producto: r.producto ?? null, lote_codigo: r.lote_codigo ?? null, notas: r.notas ?? null,
      }));
      if (rows.length) {
        const { error } = await userClient.from("lotes_dia").insert(rows);
        if (error) console.error("lotes_dia insert failed", error, rows.slice(0, 3));
      }
    }

    return json({
      message: aiWarning
        ? `Análisis completado con extracción server-side; IA no disponible (${aiWarning}).`
        : `Análisis completado: ${files.length} archivo(s).`,
      server_side: server,
      ai: aiData,
      ai_warning: aiWarning,
    });
  } catch (e) {
    console.error("analizar-parte error", e);
    return json({ error: e instanceof Error ? e.message : "Error desconocido" }, 500);
  }
});

// ---------- helpers ----------

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Reparación de XLSX con prefijo basura antes de "PK\x03\x04"
function repairXlsx(bytes: Uint8Array): Uint8Array {
  for (let i = 0; i < Math.min(bytes.length - 4, 4096); i++) {
    if (bytes[i] === 0x50 && bytes[i + 1] === 0x4b && bytes[i + 2] === 0x03 && bytes[i + 3] === 0x04) {
      return i === 0 ? bytes : bytes.slice(i);
    }
  }
  return bytes;
}

function base64Encode(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk) as unknown as number[]);
  }
  return btoa(binary);
}

// Formato español: "1.234,56" → 1234.56
function toNum(v: any): number {
  if (v == null) return 0;
  if (typeof v === "number") return isFinite(v) ? v : 0;
  let s = String(v).trim();
  if (!s) return 0;
  s = s.replace(/\s/g, "");
  const hasComma = s.includes(",");
  const hasDot = s.includes(".");
  if (hasComma && hasDot) s = s.replace(/\./g, "").replace(",", ".");
  else if (hasComma) s = s.replace(",", ".");
  const n = parseFloat(s);
  return isFinite(n) ? n : 0;
}

const norm = (s: any) =>
  String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

const isTotal = (row: any[]) =>
  row.some((c) => /\b(sub)?total(es)?\b/i.test(String(c ?? "")));

// Detecta header row buscando label. Devuelve { headerIdx, colIdx }.
function findCol(rows: any[][], predicates: ((s: string) => boolean)[]): { headerIdx: number; colIdx: number } | null {
  for (let i = 0; i < Math.min(rows.length, 50); i++) {
    const r = rows[i] ?? [];
    for (let j = 0; j < r.length; j++) {
      const s = norm(r[j]);
      if (predicates.some((p) => p(s))) return { headerIdx: i, colIdx: j };
    }
  }
  return null;
}

function extractNetos(rows: any[][]): number {
  const hit = findCol(rows, [
    (s) => s === "netos" || s === "neto" || s === "kg netos" || s === "peso neto",
  ]);
  if (!hit) return 0;
  let sum = 0;
  for (let i = hit.headerIdx + 1; i < rows.length; i++) {
    const r = rows[i] ?? [];
    if (isTotal(r)) continue;
    const v = toNum(r[hit.colIdx]);
    if (v > 0) sum += v;
  }
  return sum;
}

function extractTamanos(rows: any[][]): { mujeres: number; podrido: number } {
  const peso = findCol(rows, [(s) => s === "peso(kg)" || s === "peso (kg)" || s === "peso kg"]);
  const clase = findCol(rows, [(s) => s === "clase" || s === "categoria" || s === "calidad"]);
  const prod = findCol(rows, [(s) => s === "producto" || s === "variedad"]);
  if (!peso) return { mujeres: 0, podrido: 0 };
  const headerIdx = Math.max(peso.headerIdx, clase?.headerIdx ?? 0, prod?.headerIdx ?? 0);
  let mujeres = 0, podrido = 0;
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i] ?? [];
    if (isTotal(r)) continue;
    const kg = toNum(r[peso.colIdx]);
    if (kg <= 0) continue;
    const claseVal = clase ? norm(r[clase.colIdx]) : "";
    const prodVal = prod ? norm(r[prod.colIdx]) : "";
    if (claseVal === "l") mujeres += kg;
    if (prodVal === "podrido") podrido += kg;
  }
  return { mujeres, podrido };
}

function extractProduccionTotal(rows: any[][]): number {
  const peso = findCol(rows, [(s) => s === "peso(kg)" || s === "peso (kg)" || s === "peso kg"]);
  if (!peso) return 0;
  // Buscar fila TOTALES
  for (let i = peso.headerIdx + 1; i < rows.length; i++) {
    const r = rows[i] ?? [];
    if (isTotal(r)) {
      const v = toNum(r[peso.colIdx]);
      if (v > 0) return v;
    }
  }
  // Fallback: último numérico
  let last = 0;
  for (let i = peso.headerIdx + 1; i < rows.length; i++) {
    const v = toNum(rows[i]?.[peso.colIdx]);
    if (v > 0) last = v;
  }
  return last;
}
