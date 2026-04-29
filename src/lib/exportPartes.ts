import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { computeCascade, CascadeInput, CascadeResult } from "./cascade";
import { formatDate, formatKg, formatPct } from "./format";

export interface ParteRow {
  id: string;
  date: string;
  estado: string;
  kg_produccion_calibrador?: number | null;
  kg_mujeres_calibrador?: number | null;
  kg_palets_brutos?: number | null;
  kg_podrido_calibrador_auto?: number | null;
  kg_industria_manual?: number | null;
  kg_reciclado_malla_z1?: number | null;
  kg_reciclado_malla_z2?: number | null;
  kg_inventario_sin_alta?: number | null;
  kg_podrido_bolsa_basura?: number | null;
  kg_inventario_anterior_sin_alta?: number | null;
  notas_generales?: string | null;
  notas_inventario?: string | null;
  resumen_ia?: any;
}

function buildCascade(p: ParteRow): CascadeResult {
  const input: CascadeInput = {
    kg_produccion_calibrador: Number(p.kg_produccion_calibrador) || 0,
    kg_mujeres_calibrador: Number(p.kg_mujeres_calibrador) || 0,
    kg_palets_brutos: Number(p.kg_palets_brutos) || 0,
    kg_podrido_calibrador: Number(p.kg_podrido_calibrador_auto) || 0,
    kg_industria_manual: Number(p.kg_industria_manual) || 0,
    kg_reciclado_malla_z1: Number(p.kg_reciclado_malla_z1) || 0,
    kg_reciclado_malla_z2: Number(p.kg_reciclado_malla_z2) || 0,
    kg_inventario_sin_alta: Number(p.kg_inventario_sin_alta) || 0,
    kg_podrido_bolsa_basura: Number(p.kg_podrido_bolsa_basura) || 0,
    kg_inventario_anterior_sin_alta: Number(p.kg_inventario_anterior_sin_alta) || 0,
  };
  return computeCascade(input);
}

export function exportPartesToExcel(partes: ParteRow[], from: string, to: string) {
  const wb = XLSX.utils.book_new();

  // Sheet 1: Resumen
  const resumen = partes.map((p) => {
    const c = buildCascade(p);
    return {
      Fecha: p.date,
      Estado: p.estado,
      "Prod. calibrador (kg)": c.produccion_calibrador,
      "Industria (kg)": c.industria_manual,
      "Mujeres L (kg)": c.mujeres,
      "Reciclado Z1 (kg)": c.reciclado_z1,
      "Reciclado Z2 (kg)": c.reciclado_z2,
      "Producción real (kg)": c.produccion_real,
      "Palets brutos (kg)": c.palets_brutos,
      "Inv. anterior (kg)": c.inventario_anterior,
      "Palets ajustados (kg)": c.palets_ajustados,
      "Inv. final (kg)": c.inventario_final,
      "Dif. bruta (kg)": c.diferencia_bruta,
      "Podrido calib. (kg)": c.podrido_calibrador,
      "Podrido manual (kg)": c.podrido_manual,
      "Mermas totales (kg)": c.mermas_totales,
      "DJPMN (kg)": c.dsj,
      "% DJPMN": Number(c.dsj_pct.toFixed(2)),
      Semáforo: c.semaforo,
    };
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumen), "Resumen");

  // Sheet 2: Cascada detallada
  const cascada: any[] = [];
  partes.forEach((p) => {
    const c = buildCascade(p);
    const steps: [string, string, number][] = [
      ["Prod. calibrador", "=", c.produccion_calibrador],
      ["Industria manual", "+", c.industria_manual],
      ["Mujeres (L)", "−", c.mujeres],
      ["Reciclado Z1", "−", c.reciclado_z1],
      ["Reciclado Z2", "−", c.reciclado_z2],
      ["PRODUCCIÓN REAL", "=", c.produccion_real],
      ["Palets brutos", "−", c.palets_brutos],
      ["Inv. día anterior", "−", c.inventario_anterior],
      ["Palets ajustados", "=", c.palets_ajustados],
      ["Inventario final", "−", c.inventario_final],
      ["DIFERENCIA BRUTA", "=", c.diferencia_bruta],
      ["Podrido calibrador", "−", c.podrido_calibrador],
      ["Podrido manual", "−", c.podrido_manual],
      ["MERMAS TOTALES", "=", c.mermas_totales],
      ["DJPMN", "=", c.dsj],
    ];
    steps.forEach(([paso, op, val]) =>
      cascada.push({ Fecha: p.date, Paso: paso, Op: op, "Valor (kg)": val })
    );
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(cascada), "Cascada");

  // Sheet 3: Valores IA
  const ia = partes.map((p) => ({
    Fecha: p.date,
    Estado: p.estado,
    "resumen_ia": p.resumen_ia ? JSON.stringify(p.resumen_ia) : "",
    "Notas generales": p.notas_generales ?? "",
    "Notas inventario": p.notas_inventario ?? "",
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(ia), "Valores IA");

  XLSX.writeFile(wb, `partes_${from}_${to}.xlsx`);
}

export function exportPartesToPDF(partes: ParteRow[], from: string, to: string) {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  doc.setFontSize(14);
  doc.text(`Partes diarios · ${from} a ${to}`, 40, 40);
  doc.setFontSize(9);
  doc.text(`Generado: ${new Date().toLocaleString("es-ES")}`, 40, 56);

  const body = partes.map((p) => {
    const c = buildCascade(p);
    return [
      formatDate(p.date),
      p.estado,
      formatKg(c.produccion_real),
      formatKg(c.palets_ajustados),
      formatKg(c.diferencia_bruta),
      formatKg(c.mermas_totales),
      formatKg(c.dsj),
      formatPct(c.dsj_pct),
    ];
  });

  autoTable(doc, {
    startY: 72,
    head: [["Fecha", "Estado", "Prod. real", "Palets aj.", "Dif. bruta", "Mermas", "DJPMN", "% DJPMN"]],
    body,
    styles: { fontSize: 8, cellPadding: 4 },
    headStyles: { fillColor: [26, 76, 60] },
  });

  // Una página por parte con notas
  partes.forEach((p) => {
    const c = buildCascade(p);
    doc.addPage();
    doc.setFontSize(12);
    doc.text(`Parte del ${formatDate(p.date)} · ${p.estado}`, 40, 40);

    autoTable(doc, {
      startY: 60,
      head: [["Concepto", "Op.", "Valor"]],
      body: [
        ["Prod. calibrador", "=", formatKg(c.produccion_calibrador)],
        ["Industria manual", "+", formatKg(c.industria_manual)],
        ["Mujeres (L)", "−", formatKg(c.mujeres)],
        ["Reciclado Z1", "−", formatKg(c.reciclado_z1)],
        ["Reciclado Z2", "−", formatKg(c.reciclado_z2)],
        ["PRODUCCIÓN REAL", "=", formatKg(c.produccion_real)],
        ["Palets brutos", "−", formatKg(c.palets_brutos)],
        ["Inv. día anterior", "−", formatKg(c.inventario_anterior)],
        ["Palets ajustados", "=", formatKg(c.palets_ajustados)],
        ["Inventario final", "−", formatKg(c.inventario_final)],
        ["DIFERENCIA BRUTA", "=", formatKg(c.diferencia_bruta)],
        ["Podrido calibrador", "−", formatKg(c.podrido_calibrador)],
        ["Podrido manual", "−", formatKg(c.podrido_manual)],
        ["MERMAS TOTALES", "=", formatKg(c.mermas_totales)],
        ["DJPMN", "=", formatKg(c.dsj)],
        ["% DJPMN", "", formatPct(c.dsj_pct)],
      ],
      styles: { fontSize: 9, cellPadding: 4 },
      headStyles: { fillColor: [26, 76, 60] },
    });

    let y = (doc as any).lastAutoTable.finalY + 20;
    if (p.notas_generales) {
      doc.setFontSize(10); doc.text("Notas generales:", 40, y); y += 14;
      doc.setFontSize(9); doc.text(doc.splitTextToSize(p.notas_generales, 720), 40, y);
      y += 50;
    }
    if (p.notas_inventario) {
      doc.setFontSize(10); doc.text("Notas inventario:", 40, y); y += 14;
      doc.setFontSize(9); doc.text(doc.splitTextToSize(p.notas_inventario, 720), 40, y);
      y += 50;
    }
    const analisis = p.resumen_ia?.analisis;
    if (analisis) {
      doc.setFontSize(10); doc.text("Análisis IA:", 40, y); y += 14;
      doc.setFontSize(9); doc.text(doc.splitTextToSize(String(analisis), 720), 40, y);
    }
  });

  doc.save(`partes_${from}_${to}.pdf`);
}
