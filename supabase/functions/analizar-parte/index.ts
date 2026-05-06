import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";
import * as XLSX from "https://esm.sh/xlsx@0.18.5";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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
    const NVIDIA_API_KEY = Deno.env.get("NVIDIA_API_KEY");
    if (!NVIDIA_API_KEY) return json({ error: "NVIDIA_API_KEY no configurada" }, 500);

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) return json({ error: "No autenticado" }, 401);
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const { data: parte, error: pErr } = await userClient
      .from("partes_diarios")
      .select("*")
      .eq("id", part_id)
      .maybeSingle();
    if (pErr || !parte) return json({ error: "Parte no encontrado" }, 404);

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

    const { data: archivos, error: aErr } = await userClient
      .from("partes_archivos")
      .select("id,file_name,file_path,file_type,mime_type")
      .eq("part_id", part_id);
    if (aErr) return json({ error: aErr.message }, 500);
    const files = (archivos ?? []) as ArchivoRow[];
    if (files.length === 0) return json({ error: "No hay archivos adjuntos" }, 400);

    const classify = (f: ArchivoRow) => {
      const name = (f.file_name ?? "").toLowerCase();
      const ft = (f.file_type ?? "").toLowerCase();
      if (ft === "gstock" || /g[\s_-]?stock/i.test(name)) return "gstock";
      if (/producci[oó]n/i.test(name) && !/producto/i.test(name)) return "produccion";
      if (/tama[ñn]o|clase|calidad|producto/i.test(name)) return "tamanos";
      if (/palet/i.test(name)) return "palets";
      return "otro";
    };

    const server: Record<string, number> = {};
    const csvContexts: { name: string; kind: string; csv: string }[] = [];

    // Solo procesar archivos XLSX — ignorar imágenes completamente
    for (const f of files) {
      if (!f.file_path) continue;
      const mime = f.mime_type ?? "";
      const isXlsx =
        /\.xlsx?$/i.test(f.file_name ?? "") ||
        mime.includes("spreadsheet") ||
        mime === "application/vnd.ms-excel";

      // Ignorar imágenes y PDFs — no descargar ni procesar
      if (!isXlsx) {
        console.log("Ignorando archivo no-XLSX:", f.file_name);
        continue;
      }

      const { data: blob, error: dlErr } = await admin.storage
        .from("partes-archivos")
        .download(f.file_path);
      if (dlErr || !blob) { console.warn("dl fail", f.file_path, dlErr?.message); continue; }
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const kind = classify(f);

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
          if (v > 0 && (kind === "gstock" || !server.kg_palets_brutos)) server.kg_palets_brutos = v;
        } else if (kind === "tamanos") {
          const { mujeres, podrido } = extractTamanos(rowsAll);
          if (mujeres > 0) server.kg_mujeres_calibrador = mujeres;
          if (podrido > 0) server.kg_podrido_calibrador_auto = podrido;
        } else if (kind === "produccion") {
          const v = extractProduccionTotal(rowsAll);
          if (v > 0) server.kg_produccion_calibrador = v;
        }

        const csv = rowsAll
          .map((r) => r.map((c) => (c == null ? "" : String(c))).join(","))
          .join("\n")
          .slice(0, 6000);
        csvContexts.push({ name: f.file_name ?? "", kind, csv });
      } catch (e) {
        console.warn("xlsx parse fail", f.file_name, e);
      }
    }

    // ── Prompt de sistema: prompt fusionado completo ──────────────────────
    const sysPrompt = `Eres un analista experto de la planta de cítricos Lasarte SAT.

Tu tarea es analizar los archivos adjuntos de un parte diario, extraer los datos exactos, aplicar la cascada de cálculo y devolver únicamente un JSON válido.
No inventes, no estimes, no redondees antes del final y no mezcles columnas.
Si un dato no existe, devuelve 0 o null según corresponda.

REGLAS GENERALES
- Identifica los archivos por su NOMBRE, no por el tipo.
- Usa solo datos explícitos en los archivos.
- Si existe una fila TOTAL o subtotal, priorízala sobre cualquier suma manual.
- Si no existe fila TOTAL, usa la última fila válida con datos numéricos.
- No uses columnas equivocadas: si una columna se llama Peso kg, Netos, etc., usa solo esa.
- Devuelve únicamente JSON válido. No escribas explicaciones, notas ni markdown fuera del JSON.
- Las cantidades se expresan en kg salvo que se indique otra cosa.

ARCHIVOS Y REGLAS DE EXTRACCIÓN

1) INFORME DE PRODUCCIÓN
Archivo típico: Informe-XXXX-produccion-*.xlsx
Objetivo: Extraer kg_produccion_total.
- Busca la columna exacta de peso, normalmente "Peso (kg)", "Peso kg" o similar.
- Si existe fila TOTAL, usa el valor de esa fila.
- Si no existe fila TOTAL, usa el último valor numérico válido de la columna de peso.
- No sumes filas de detalle manualmente.

2) INFORME DE TAMAÑOS / CLASE / CALIDAD
Archivo típico: Informe-XXXX-tamanos-clase-y-calidad-por-variedad-*.xlsx
Objetivo: Extraer kg_mujeres_l.
- Usa la columna exacta "Peso kg" o "Pesokg".
- Suma solo filas cuya clase sea "L" o contenga "Mujeres" en cualquier campo relevante.
- No uses "Fruta", "Empaques" ni contadores de piezas.
- Excluye subtotales y filas resumen.

3) INFORME DE PRODUCTO
Archivo típico: Informe-XXXX-producto-*.xlsx
Objetivo: Extraer kg_podrido_calibrador.
- Busca la fila cuyo Producto sea exactamente "PODRIDO" sin importar mayúsculas/minúsculas.
- Excluye filas con "MUESTRA" y "PREC".
- Usa la columna de peso correcta, normalmente "Peso kg" o "Pesokg".
- Si no existe, devuelve 0.

4) PALETS
Archivo típico: palets-*.xlsx o GSTOCK-*.xlsx
Objetivo: Extraer kg_palets_alta.
- Usa la columna exacta "Netos" o equivalente de peso neto.
- Suma solo filas con valor positivo.
- Excluye filas de total, subtotales, vacías o filas de resumen.
- No uses cajas, importes ni identificadores.

5) FOTO DE LOTES
Archivo típico: imagen JPG/PNG
Objetivo: Extraer lotes visibles si aparecen claramente.
- Si no se ve con claridad, devuelve lista vacía.
- No inventes códigos de lote.

CASCADA DE CÁLCULO
Tras extraer los datos, calcula:
1. produccion_real = kg_produccion_total - industria_manual - kg_mujeres_l - reciclado_z1 - reciclado_z2
2. palets_ajustados = kg_palets_brutos - inventario_dia_anterior
3. dif_bruta = produccion_real - palets_ajustados - inventario_final
4. mermas_totales = kg_podrido_calibrador + kg_podrido_manual
5. djpmn = dif_bruta - mermas_totales
6. pct_djpmn = (djpmn / produccion_real) * 100

REGLAS DE CÁLCULO
- Si algún dato no existe, usa 0.
- No redondees hasta el final. Redondea pct_djpmn a dos decimales.
- Si produccion_real es 0, pct_djpmn debe ser 0.

FORMATO DE SALIDA OBLIGATORIO
Devuelve exactamente este JSON, sin texto adicional:
{
  "kg_produccion_total": number,
  "kg_mujeres_l": number,
  "kg_podrido_calibrador": number,
  "kg_palets_alta": number,
  "industria_manual": number,
  "reciclado_z1": number,
  "reciclado_z2": number,
  "kg_palets_brutos": number,
  "inventario_dia_anterior": number,
  "inventario_final": number,
  "kg_podrido_manual": number,
  "produccion_real": number,
  "palets_ajustados": number,
  "dif_bruta": number,
  "mermas_totales": number,
  "djpmn": number,
  "pct_djpmn": number,
  "produccion": [
    { "product": string, "sizerange": string | null, "kgproduced": number, "destination": string | null }
  ],
  "gstock": [
    { "product": string, "sizerange": string | null, "kgexpected": number }
  ],
  "lotes": [
    { "lotecodigo": string, "producto": string | null }
  ],
  "analisis": string,
  "fuentes": {
    "kg_produccion_total": string | null,
    "kg_mujeres_l": string | null,
    "kg_podrido_calibrador": string | null,
    "kg_palets_alta": string | null,
    "kg_palets_brutos": string | null,
    "inventario_dia_anterior": string | null,
    "inventario_final": string | null,
    "kg_podrido_manual": string | null,
    "industria_manual": string | null,
    "reciclado_z1": string | null,
    "reciclado_z2": string | null
  }
}`;

    // ── Mensaje de usuario: fecha, lista de archivos y CSVs ───────────────
    const dateStr = parte.date ?? "desconocida";
    const fileList = csvContexts.map((c) => `- ${c.name}`).join("\n");
    let userMsg = `Analiza los archivos adjuntos del parte diario del ${dateStr}.\nArchivos:\n${fileList}\n\nDevuelve el JSON exacto.\n`;
    for (const c of csvContexts) {
      userMsg += `\n--- [${c.kind}] ${c.name} ---\n${c.csv}`;
    }
    const finalUserMsg = userMsg.slice(0, 28000);

    let aiData: any = {};
    let aiWarning: string | null = null;
    const modelChain = ["meta/llama-3.3-70b-instruct"];
    const RETRYABLE = new Set([429, 500, 502, 503, 504]);
    let lastStatus = 0;
    let lastBody = "";
    let succeeded = false;

    outer: for (const model of modelChain) {
      for (let attempt = 0; attempt < 3; attempt++) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 12000);
        try {
          const aiResp = await fetch(
            "https://integrate.api.nvidia.com/v1/chat/completions",
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": "Bearer " + NVIDIA_API_KEY,
              },
              signal: controller.signal,
              body: JSON.stringify({
                model: model,
                messages: [
                  { role: "system", content: sysPrompt },
                  { role: "user", content: finalUserMsg },
                ],
                response_format: { type: "json_object" },
                temperature: 0.1,
              }),
            },
          );
          clearTimeout(timeout);

          if (aiResp.ok) {
            const aiJson = await aiResp.json();
            const text = aiJson && aiJson.choices && aiJson.choices[0] && aiJson.choices[0].message
              ? aiJson.choices[0].message.content
              : "{}";
            try {
              aiData = JSON.parse(text);
              succeeded = true;
            } catch {
              aiWarning = "La IA devolvio un JSON no valido";
              aiData = {};
              succeeded = true;
            }
            break outer;
          }

          lastStatus = aiResp.status;
          lastBody = await aiResp.text();
          console.warn("Nvidia " + model + " intento " + (attempt + 1) + " -> " + aiResp.status);

          if (aiResp.status === 403) { aiWarning = "Nvidia rechazo la clave"; break outer; }
          if (!RETRYABLE.has(aiResp.status)) { aiWarning = "Nvidia devolvio " + aiResp.status; break; }
          const delay = 500 * Math.pow(2, attempt) + Math.floor(Math.random() * 300);
          await new Promise((r) => setTimeout(r, delay));
        } catch (e) {
          clearTimeout(timeout);
          const isAbort = e instanceof Error && e.name === "AbortError";
          lastStatus = 0;
          lastBody = isAbort ? "timeout" : (e instanceof Error ? e.message : "error");
          const delay = 500 * Math.pow(2, attempt) + Math.floor(Math.random() * 300);
          await new Promise((r) => setTimeout(r, delay));
        }
      }
    }

    if (!succeeded && !aiWarning) {
      if (lastStatus === 429) aiWarning = "Limite IA superado";
      else if (lastStatus === 503) aiWarning = "IA saturada, reintenta en unos minutos";
      else if (lastStatus === 0) aiWarning = "Timeout al consultar IA";
      else aiWarning = "Nvidia devolvio " + lastStatus;
      console.error("Nvidia exhausted retries", lastStatus, lastBody.slice(0, 500));
    }

    // ── Mapeo: clave del JSON de la IA → columna en partes_diarios ───────
    // Prioridad: extracción server-side > valor de la IA
    const mapping: Record<string, string> = {
      // Extraídos directamente
      kg_produccion_total:  "kg_produccion_calibrador",
      kg_mujeres_l:         "kg_mujeres_calibrador",
      kg_podrido_calibrador:"kg_podrido_calibrador_auto",
      kg_palets_alta:       "kg_palets_brutos",
      // Nuevos campos del prompt fusionado
      industria_manual:     "kg_industria_manual",
      reciclado_z1:         "kg_reciclado_malla_z1",
      reciclado_z2:         "kg_reciclado_malla_z2",
      inventario_final:     "kg_inventario_sin_alta",
      kg_podrido_manual:    "kg_podrido_bolsa_basura",
      // inventario_dia_anterior ya se gestiona server-side arriba
    };
    const update: Record<string, any> = {};
    for (const [specKey, dbKey] of Object.entries(mapping)) {
      const sv = server[dbKey];
      const av = Number(aiData?.[specKey]);
      if (typeof sv === "number" && sv > 0) update[dbKey] = sv;
      else if (isFinite(av) && av > 0) update[dbKey] = av;
    }
    aiData = aiData ?? {};
    update.resumen_ia = { ...aiData, _server_side: server, _ai_warning: aiWarning };
    update.estado = "Analizado";

    const { error: upErr } = await userClient
      .from("partes_diarios")
      .update(update)
      .eq("id", part_id);
    if (upErr) {
      console.error("partes_diarios update failed", upErr);
      return json({ error: "No se pudo actualizar el parte: " + upErr.message }, 500);
    }

    await userClient.from("production_runs").delete().eq("part_id", part_id);
    await userClient.from("gstock_entries").delete().eq("part_id", part_id);
    await userClient.from("lotes_dia").delete().eq("part_id", part_id).eq("source", "ia");

    const uid = userData.user.id;
    if (Array.isArray(aiData.produccion) && aiData.produccion.length > 0) {
      const rows = aiData.produccion
        .filter((r: any) => Number(r?.kgproduced ?? r?.kg_produced) > 0)
        .map((r: any) => ({
          part_id, user_id: uid, date: parte.date, source: "ia",
          product: r.product ?? null,
          size_range: r.sizerange ?? r.size_range ?? null,
          kg_produced: Number(r.kgproduced ?? r.kg_produced) || 0,
        }));
      if (rows.length) await userClient.from("production_runs").insert(rows);
    }
    if (Array.isArray(aiData.gstock) && aiData.gstock.length > 0) {
      const rows = aiData.gstock
        .filter((r: any) => Number(r?.kgexpected ?? r?.kg_expected) > 0)
        .map((r: any) => ({
          part_id, user_id: uid, date: parte.date, source: "ia",
          product: r.product ?? null,
          size_range: r.sizerange ?? r.size_range ?? null,
          kg_expected: Number(r.kgexpected ?? r.kg_expected) || 0,
        }));
      if (rows.length) await userClient.from("gstock_entries").insert(rows);
    }
    if (Array.isArray(aiData.lotes) && aiData.lotes.length > 0) {
      const rows = aiData.lotes.map((r: any) => ({
        part_id, user_id: uid, source: "ia",
        producto: r.producto ?? null,
        lote_codigo: r.lotecodigo ?? r.lote_codigo ?? null,
        notas: r.notas ?? null,
      }));
      if (rows.length) await userClient.from("lotes_dia").insert(rows);
    }

    return json({
      message: aiWarning
        ? "Analisis completado con extraccion server-side; IA no disponible (" + aiWarning + ")."
        : "Analisis completado: " + files.length + " archivo(s).",
      server_side: server,
      ai: aiData,
      ai_warning: aiWarning,
    });
  } catch (e) {
    console.error("analizar-parte error", e);
    return json({ error: e instanceof Error ? e.message : "Error desconocido" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function repairXlsx(bytes: Uint8Array): Uint8Array {
  for (let i = 0; i < Math.min(bytes.length - 4, 65536); i++) {
    if (bytes[i] === 0x50 && bytes[i+1] === 0x4b && bytes[i+2] === 0x03 && bytes[i+3] === 0x04) {
      return i === 0 ? bytes : bytes.slice(i);
    }
  }
  return bytes;
}

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
  let mujeres = 0;
  let podrido = 0;
  let inMujeresSection = false;
  let pesoCol = -1;
  let sectionValues: number[] = [];

  const finalizeMujeres = () => {
    if (sectionValues.length > 1) {
      const last = sectionValues[sectionValues.length - 1];
      const sumRest = sectionValues.slice(0, -1).reduce((a: number, b: number) => a + b, 0);
      const val = Math.abs(last - sumRest) < 1 ? last : sectionValues.reduce((a: number, b: number) => a + b, 0);
      if (val > mujeres) mujeres = val; // quedarse con el mayor
    }
    sectionValues = [];
    pesoCol = -1;
    inMujeresSection = false;
  };

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i] ?? [];
    const rowVals = r.map((c: any) => norm(String(c ?? "")));

    if (rowVals.some((v: string) => v === "mujeres")) {
      if (inMujeresSection) finalizeMujeres();
      inMujeresSection = true;
      pesoCol = -1;
      sectionValues = [];
      continue;
    }

    if (inMujeresSection && rowVals.some((v: string) =>
      v === "exportacion" || v === "no exportacion" || v === "no comercial"
    )) {
      finalizeMujeres();
    }

    if (inMujeresSection && pesoCol === -1) {
      for (let j = 0; j < r.length; j++) {
        const cell = norm(String(r[j] ?? ""));
        if (cell === "peso (kg)" || cell === "peso(kg)" || cell === "peso kg") {
          pesoCol = j; break;
        }
      }
      continue;
    }

    if (inMujeresSection && pesoCol >= 0) {
      const v = toNum(r[pesoCol]);
      if (v > 0) sectionValues.push(v);
    }

    if (rowVals.some((v: string) => v === "podrido") && pesoCol >= 0) {
      const kg = toNum(r[pesoCol]);
      if (kg > 0) podrido = kg;
    }
  }

  if (inMujeresSection) finalizeMujeres();

  return { mujeres, podrido };
}

function extractProduccionTotal(rows: any[][]): number {
  const peso = findCol(rows, [(s) => s === "peso(kg)" || s === "peso (kg)" || s === "peso kg"]);
  if (!peso) return 0;
  for (let i = peso.headerIdx + 1; i < rows.length; i++) {
    const r = rows[i] ?? [];
    if (isTotal(r)) {
      const v = toNum(r[peso.colIdx]);
      if (v > 0) return v;
    }
  }
  let last = 0;
  for (let i = peso.headerIdx + 1; i < rows.length; i++) {
    const v = toNum(rows[i]?.[peso.colIdx]);
    if (v > 0) last = v;
  }
  return last;
}
