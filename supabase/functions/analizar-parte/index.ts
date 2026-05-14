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
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const OPENCODE_API_KEY = Deno.env.get("OPENCODE_API_KEY");
    const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY");
    const DEEPSEEK_API_KEY = Deno.env.get("DEEPSEEK_API_KEY");
    const NVIDIA_API_KEY = Deno.env.get("NVIDIA_API_KEY");
    if (!OPENCODE_API_KEY && !GROQ_API_KEY && !DEEPSEEK_API_KEY && !NVIDIA_API_KEY) {
      return json({ error: "Ninguna API key configurada (OPENCODE/GROQ/DEEPSEEK/NVIDIA)" }, 500);
    }

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) return json({ error: "No autenticado" }, 401);
    const uid = userData.user.id;
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // ── 1. Obtener el parte actual ────────────────────────────────────────────
    const { data: parte, error: pErr } = await userClient
      .from("partes_diarios").select("*").eq("id", part_id).maybeSingle();
    if (pErr || !parte) return json({ error: "Parte no encontrado" }, 404);

    // ── 2. Auto-fill inventario anterior ─────────────────────────────────────
    if (!Number(parte.kg_inventario_anterior_sin_alta)) {
      const { data: prev } = await userClient
        .from("partes_diarios")
        .select("kg_inventario_sin_alta, date")
        .eq("user_id", uid)
        .lt("date", parte.date)
        .order("date", { ascending: false })
        .limit(1).maybeSingle();
      if (prev && Number(prev.kg_inventario_sin_alta) > 0) {
        await userClient.from("partes_diarios")
          .update({ kg_inventario_anterior_sin_alta: Number(prev.kg_inventario_sin_alta) })
          .eq("id", part_id);
        parte.kg_inventario_anterior_sin_alta = Number(prev.kg_inventario_sin_alta);
      }
    }

    // ── 3. Obtener archivos ──────────────────────────────────────────────────
    const { data: archivos, error: aErr } = await userClient
      .from("partes_archivos").select("id,file_name,file_path,file_type,mime_type").eq("part_id", part_id);
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

    // ── 4. Extracción servidor (sin sobreescribir manuales) ───────────────────
    const server: Record<string, number> = {};
    const csvContexts: { name: string; kind: string; csv: string }[] = [];

    for (const f of files) {
      if (!f.file_path) continue;
      const mime = f.mime_type ?? "";
      const isXlsx = /\.xlsx?$/i.test(f.file_name ?? "") || mime.includes("spreadsheet") || mime === "application/vnd.ms-excel";
      if (!isXlsx) continue;

      const { data: blob, error: dlErr } = await admin.storage.from("partes-archivos").download(f.file_path);
      if (dlErr || !blob) continue;
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const kind = classify(f);

      try {
        const repaired = repairXlsx(bytes);
        const wb = XLSX.read(repaired, { type: "array" });
        const rowsAll: any[][] = [];
        for (const sn of wb.SheetNames) {
          const ws = wb.Sheets[sn];
          rowsAll.push(...XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, blankrows: false, defval: null }));
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

        const csv = rowsAll.map((r) => r.map((c) => (c == null ? "" : String(c))).join(",")).join("\n").slice(0, 1500);
        csvContexts.push({ name: f.file_name ?? "", kind, csv });
      } catch (e) { console.warn("xlsx parse fail", f.file_name, e); }
    }

    // ── PROMPT OPTIMIZADO ─────────────────────────────────────────────────
    const jsonTemplate = '{"kg_produccion_total":0,"kg_mujeres_l":0,"kg_podrido_calibrador":0,"kg_palets_alta":0,"industria_manual":0,"reciclado_z1":0,"reciclado_z2":0,"kg_palets_brutos":0,"inventario_dia_anterior":0,"inventario_final":0,"kg_podrido_manual":0,"produccion_real":0,"palets_ajustados":0,"dif_bruta":0,"mermas_totales":0,"djpmn":0,"pct_djpmn":0,"produccion":[],"gstock":[],"lotes_detalle":[],"palets_detalle":[],"producto_detalle":[],"calibres_detalle":[],"analisis":"","fuentes":{}}';

    const sysPrompt = `Analista planta citrica Lasarte SAT. Extrae datos de Excel adjuntos y devuelve JSON.

REGLAS: Solo datos explicitos. Priorizar fila TOTAL. Si no existe, ultimo valor valido de columna peso. Cantidades en kg. No redondear hasta el final. Dato inexistente=0.

EXTRACCION:
- PRODUCCION (*produccion*.xlsx): kg_produccion_total = "Peso kg" fila TOTAL o ultimo valor.
- TAMANOS (*tamanos*.xlsx): kg_mujeres_l = suma "Peso kg" donde clase="L" o seccion="Mujeres".
- PRODUCTO (*producto*.xlsx): kg_podrido_calibrador = "Peso kg" fila Producto="PODRIDO" (excluir MUESTRA/PREC).
- PALETS (palets*.xlsx/GSTOCK*.xlsx): kg_palets_alta = suma "Netos"/"Peso" >0, excluir totales.

CASCADA:
produccion_real = kg_produccion_total + industria_manual - kg_mujeres_l - reciclado_z1 - reciclado_z2
palets_ajustados = kg_palets_brutos - inventario_dia_anterior
dif_bruta = produccion_real - palets_ajustados - inventario_final
mermas_totales = kg_podrido_calibrador + kg_podrido_manual
djpmn = dif_bruta - mermas_totales
pct_djpmn = djpmn/produccion_real*100 (2 dec, 0 si prod=0)

Responde SOLO con JSON valido usando esta estructura (rellena valores): ${jsonTemplate}

ARRAYS DETALLADOS (extraer TODAS las filas, no solo totales):

- produccion: array de {product, sizerange, kgproduced, destination}
- gstock: array de {product, sizerange, kgexpected}

- lotes_detalle: array de objetos por cada lote del informe produccion:
  {lote_codigo, productor, producto, kg_peso_total, toneladas_hora, duracion_min, peso_fruta_promedio_g, hora_inicio}

- palets_detalle: array de objetos por cada palet del informe palets/gstock:
  {palet_id, producto, cliente, destino, kg_neto, situacion, n_cajas}

- producto_detalle: array de objetos por cada linea del informe producto/tamanos:
  {linea, producto, formato_caja, kg, n_cajas, grupo_destino}

- calibres_detalle: array de objetos por cada calibre del informe tamanos:
  {calibre, clase, kg, piezas, pct, grupo_destino}

- analisis: string con breve resumen
- fuentes: objeto con origen de cada dato (nombre archivo o null)`;

    const dateStr = parte.date ?? "desconocida";
    let userMsg = `Parte ${dateStr}. Archivos:\n${csvContexts.map(c => "- " + c.name).join("\n")}\n`;
    for (const c of csvContexts) userMsg += "\n--- [" + c.kind + "] " + c.name + " ---\n" + c.csv;
    const finalUserMsg = userMsg.slice(0, 8000);

    // ── Llamada IA con fallback DeepSeek -> NVIDIA ────────────────────────────
    let aiData: any = {};
    let aiWarning: string | null = null;
    let lastStatus = 0;
    let lastBody = "";
    let succeeded = false;

    const providers = [
      { name: "DeepSeek", key: DEEPSEEK_API_KEY, url: "https://api.deepseek.com/chat/completions", model: "deepseek-chat" },
      { name: "NVIDIA", key: NVIDIA_API_KEY, url: "https://integrate.api.nvidia.com/v1/chat/completions", model: "meta/llama-3.1-70b-instruct" },
      { name: "Groq", key: GROQ_API_KEY, url: "https://api.groq.com/openai/v1/chat/completions", model: "mixtral-8x7b-32768" },
      { name: "OpenCode", key: OPENCODE_API_KEY, url: "https://api.opencode.cloud/v1/chat/completions", model: "gpt-4-turbo" },
    ].filter((p) => p.key);

    for (const provider of providers) {
      try {
        const resp = await fetch(provider.url, {
          method: "POST",
          headers: { "Authorization": `Bearer ${provider.key}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: provider.model,
            messages: [{ role: "system", content: sysPrompt }, { role: "user", content: finalUserMsg }],
            temperature: 0.3,
            max_tokens: 3000,
          }),
        });
        lastStatus = resp.status;
        lastBody = await resp.text();

        if (resp.ok) {
          const json_resp = JSON.parse(lastBody);
          const content = json_resp.choices?.[0]?.message?.content || "";
          const jsonMatch = content.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            aiData = JSON.parse(jsonMatch[0]);
            succeeded = true;
            break;
          }
        } else if (resp.status !== 429 && resp.status !== 503) {
          aiWarning = `${provider.name}: ${lastStatus}`;
        }
      } catch (e) {
        console.warn(`${provider.name} failed:`, e);
      }
    }

    if (!succeeded) {
      return json({ error: `IA no respondió: ${lastStatus} ${lastBody.slice(0, 200)}` }, 500);
    }

    // ── 5. MERGE: Datos del servidor + IA (sin sobreescribir manuales) ────────
    //    Mantener datos manuales que el usuario ya ingresó
    const updates: Record<string, number> = {};

    // Campos automáticos (solo si IA o servidor tienen datos)
    if (server.kg_produccion_calibrador) updates.kg_produccion_calibrador = server.kg_produccion_calibrador;
    else if (aiData.kg_produccion_total) updates.kg_produccion_calibrador = Number(aiData.kg_produccion_total) || 0;

    if (server.kg_palets_brutos) updates.kg_palets_brutos = server.kg_palets_brutos;
    else if (aiData.kg_palets_brutos) updates.kg_palets_brutos = Number(aiData.kg_palets_brutos) || 0;

    if (server.kg_mujeres_calibrador) updates.kg_mujeres_calibrador = server.kg_mujeres_calibrador;
    else if (aiData.kg_mujeres_l) updates.kg_mujeres_calibrador = Number(aiData.kg_mujeres_l) || 0;

    if (server.kg_podrido_calibrador_auto) updates.kg_podrido_calibrador_auto = server.kg_podrido_calibrador_auto;
    else if (aiData.kg_podrido_calibrador) updates.kg_podrido_calibrador_auto = Number(aiData.kg_podrido_calibrador) || 0;

    // Campos manuales: solo actualizar si el usuario NO los ingresó (son 0)
    if (!parte.kg_industria_manual) {
      if (aiData.industria_manual) updates.kg_industria_manual = Number(aiData.industria_manual) || 0;
    }
    if (!parte.kg_reciclado_malla_z1) {
      if (aiData.reciclado_z1) updates.kg_reciclado_malla_z1 = Number(aiData.reciclado_z1) || 0;
    }
    if (!parte.kg_reciclado_malla_z2) {
      if (aiData.reciclado_z2) updates.kg_reciclado_malla_z2 = Number(aiData.reciclado_z2) || 0;
    }
    if (!parte.kg_inventario_sin_alta) {
      if (aiData.inventario_final) updates.kg_inventario_sin_alta = Number(aiData.inventario_final) || 0;
    }
    if (!parte.kg_podrido_bolsa_basura) {
      if (aiData.kg_podrido_manual) updates.kg_podrido_bolsa_basura = Number(aiData.kg_podrido_manual) || 0;
    }

    // Guardar resumen IA
    updates.resumen_ia = aiData;

    // ── 6. Actualizar parte en BD ────────────────────────────────────────────
    if (Object.keys(updates).length > 0) {
      const { error: upErr } = await userClient.from("partes_diarios")
        .update(updates)
        .eq("id", part_id);
      if (upErr) {
        console.error("Update parte error:", upErr);
        return json({ error: "Error actualizando parte: " + upErr.message }, 500);
      }
    }

    // ── 7. Insertar detalle en tablas relacionadas ────────────────────────────
    // (lotes_dia, palets_dia, producto_dia, calibres_dia)

    if (Array.isArray(aiData.lotes_detalle) && aiData.lotes_detalle.length > 0) {
      const rows = aiData.lotes_detalle.map((r: any) => ({
        part_id, user_id: uid, source: "ia",
        lote_codigo:       r.lote_codigo ?? "—",
        productor:         r.productor ?? "—",
        producto:          r.producto ?? "—",
        kg_peso_total:     Number(r.kg_peso_total) || 0,
        toneladas_hora:    Number(r.toneladas_hora) || null,
        duracion_min:      Number(r.duracion_min) || null,
        peso_fruta_promedio_g: Number(r.peso_fruta_promedio_g) || null,
        hora_inicio:       r.hora_inicio ?? null,
      }));
      const { error: insErr } = await userClient.from("lotes_dia").insert(rows);
      if (insErr) console.warn("lotes_dia insert error:", insErr);
    }

    if (Array.isArray(aiData.palets_detalle) && aiData.palets_detalle.length > 0) {
      const rows = aiData.palets_detalle.map((r: any) => ({
        part_id, user_id: uid, source: "ia",
        palet_id:   r.palet_id ?? "—",
        producto:   r.producto ?? "—",
        cliente:    r.cliente ?? null,
        destino:    r.destino ?? null,
        kg_neto:    Number(r.kg_neto) || 0,
        situacion:  r.situacion ?? null,
        n_cajas:    Number(r.n_cajas) || null,
      }));
      const { error: insErr } = await userClient.from("palets_dia").insert(rows);
      if (insErr) console.warn("palets_dia insert error:", insErr);
    }

    if (Array.isArray(aiData.producto_detalle) && aiData.producto_detalle.length > 0) {
      const rows = aiData.producto_detalle.map((r: any) => ({
        part_id, user_id: uid, source: "ia",
        linea:         r.linea ?? "—",
        producto:      r.producto ?? "—",
        formato_caja:  r.formato_caja ?? null,
        kg:            Number(r.kg) || 0,
        n_cajas:       Number(r.n_cajas) || null,
        grupo_destino: r.grupo_destino ?? null,
      }));
      const { error: insErr } = await userClient.from("producto_dia").insert(rows);
      if (insErr) console.warn("producto_dia insert error:", insErr);
    }

    if (Array.isArray(aiData.calibres_detalle) && aiData.calibres_detalle.length > 0) {
      const rows = aiData.calibres_detalle.map((r: any) => ({
        part_id, user_id: uid, source: "ia",
        calibre:       r.calibre ?? "—",
        clase:         r.clase ?? null,
        kg:            Number(r.kg) || 0,
        piezas:        Number(r.piezas) || 0,
        pct:           Number(r.pct) || 0,
        grupo_destino: r.grupo_destino ?? null,
      }));
      const { error: insErr } = await userClient.from("calibres_dia").insert(rows);
      if (insErr) console.warn("calibres_dia insert error:", insErr);
    }

    return json({
      message: aiWarning ? "OK (IA con aviso: " + aiWarning + ")" : "OK: Parte actualizado",
      parte_actualizado: true,
      datos_guardados: Object.keys(updates).length,
      detalles_insertados: {
        lotes: aiData.lotes_detalle?.length ?? 0,
        palets: aiData.palets_detalle?.length ?? 0,
        productos: aiData.producto_detalle?.length ?? 0,
        calibres: aiData.calibres_detalle?.length ?? 0,
      },
    });
  } catch (e) {
    console.error("analizar-parte", e);
    return json({ error: e instanceof Error ? e.message : "Error desconocido" }, 500);
  }
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function repairXlsx(bytes: Uint8Array): Uint8Array {
  let start = 0;
  for (let i = 0; i < Math.min(bytes.length - 4, 65536); i++) {
    if (bytes[i] === 0x50 && bytes[i + 1] === 0x4b && bytes[i + 2] === 0x03 && bytes[i + 3] === 0x04) {
      start = i;
      break;
    }
  }
  const buf = start === 0 ? new Uint8Array(bytes) : new Uint8Array(bytes.slice(start));
  let offset = 0;
  while (offset + 30 < buf.length) {
    if (buf[offset] !== 0x50 || buf[offset + 1] !== 0x4b || buf[offset + 2] !== 0x03 || buf[offset + 3] !== 0x04) break;
    const method = buf[offset + 8] | (buf[offset + 9] << 8);
    if (method !== 0 && method !== 8) {
      buf[offset + 8] = 8;
      buf[offset + 9] = 0;
    }
    const fnLen = buf[offset + 26] | (buf[offset + 27] << 8);
    const exLen = buf[offset + 28] | (buf[offset + 29] << 8);
    const cSize = buf[offset + 18] | (buf[offset + 19] << 8) | (buf[offset + 20] << 16) | (buf[offset + 21] << 24);
    offset += 30 + fnLen + exLen + cSize;
  }
  while (offset + 46 < buf.length) {
    if (buf[offset] !== 0x50 || buf[offset + 1] !== 0x4b || buf[offset + 2] !== 0x01 || buf[offset + 3] !== 0x02) break;
    const method = buf[offset + 10] | (buf[offset + 11] << 8);
    if (method !== 0 && method !== 8) {
      buf[offset + 10] = 8;
      buf[offset + 11] = 0;
    }
    const fnLen = buf[offset + 28] | (buf[offset + 29] << 8);
    const exLen = buf[offset + 30] | (buf[offset + 31] << 8);
    const cmLen = buf[offset + 32] | (buf[offset + 33] << 8);
    offset += 46 + fnLen + exLen + cmLen;
  }
  return buf;
}

function toNum(v: any): number {
  if (v == null) return 0;
  if (typeof v === "number") return isFinite(v) ? v : 0;
  let s = String(v).trim().replace(/\s/g, "");
  if (!s) return 0;
  const hasComma = s.includes(",");
  const hasDot = s.includes(".");
  if (hasComma && hasDot) s = s.replace(/\./g, "").replace(",", ".");
  else if (hasComma) s = s.replace(",", ".");
  const n = parseFloat(s);
  return isFinite(n) ? n : 0;
}

const norm = (s: any) => String(s ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
const isTotal = (row: any[]) => row.some((c) => /\b(sub)?total(es)?\b/i.test(String(c ?? "")));

function findCol(rows: any[][], predicates: ((s: string) => boolean)[]): { headerIdx: number; colIdx: number } | null {
  for (let i = 0; i < Math.min(rows.length, 50); i++) {
    const r = rows[i] ?? [];
    for (let j = 0; j < r.length; j++) {
      if (predicates.some((p) => p(norm(r[j])))) return { headerIdx: i, colIdx: j };
    }
  }
  return null;
}

function extractNetos(rows: any[][]): number {
  const hit = findCol(rows, [(s) => s === "netos" || s === "neto" || s === "kg netos" || s === "peso neto"]);
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
  let inMuj = false;
  let pesoCol = -1;
  let vals: number[] = [];

  const flush = () => {
    if (vals.length > 1) {
      const last = vals[vals.length - 1];
      const sumRest = vals.slice(0, -1).reduce((a, b) => a + b, 0);
      mujeres = Math.abs(last - sumRest) < 1 ? last : vals.reduce((a, b) => a + b, 0);
    }
    vals = [];
    pesoCol = -1;
    inMuj = false;
  };

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i] ?? [];
    const rv = r.map((c: any) => norm(c));
    if (rv.some((v: string) => v === "mujeres")) {
      if (inMuj) flush();
      inMuj = true; pesoCol = -1; vals = [];
      continue;
    }
    if (inMuj && rv.some((v: string) => v === "exportacion" || v === "no exportacion" || v === "no comercial")) flush();
    if (inMuj && pesoCol === -1) {
      for (let j = 0; j < r.length; j++) {
        const c = norm(r[j]);
        if (c === "peso (kg)" || c === "peso(kg)" || c === "peso kg") { pesoCol = j; break; }
      }
      continue;
    }
    if (inMuj && pesoCol >= 0) { const v = toNum(r[pesoCol]); if (v > 0) vals.push(v); }
    if (rv.some((v: string) => v === "podrido") && pesoCol >= 0) { const kg = toNum(r[pesoCol]); if (kg > 0) podrido = kg; }
  }
  if (inMuj) flush();
  return { mujeres, podrido };
}

function extractProduccionTotal(rows: any[][]): number {
  const peso = findCol(rows, [(s) => s === "peso(kg)" || s === "peso (kg)" || s === "peso kg"]);
  if (!peso) return 0;
  for (let i = peso.headerIdx + 1; i < rows.length; i++) {
    if (isTotal(rows[i] ?? [])) { const v = toNum(rows[i][peso.colIdx]); if (v > 0) return v; }
  }
  let last = 0;
  for (let i = peso.headerIdx + 1; i < rows.length; i++) { const v = toNum(rows[i]?.[peso.colIdx]); if (v > 0) last = v; }
  return last;
}
