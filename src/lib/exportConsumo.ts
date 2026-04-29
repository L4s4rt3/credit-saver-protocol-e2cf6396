import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { formatDate } from "./format";

export interface ConsumoRow {
  id: string;
  date: string;
  zona_id: string | null;
  tipo: string | null;
  cantidad: number;
  unidad: string | null;
  coste_unitario: number;
}

export function exportConsumoToExcel(rows: ConsumoRow[], from: string, to: string) {
  const data = rows.map((r) => ({
    Fecha: r.date,
    Zona: r.zona_id ?? "",
    Tipo: r.tipo ?? "",
    Cantidad: Number(r.cantidad) || 0,
    Unidad: r.unidad ?? "",
    "€ por ud": Number(r.coste_unitario) || 0,
    "Total €": (Number(r.cantidad) || 0) * (Number(r.coste_unitario) || 0),
  }));
  const total = data.reduce((a, r) => a + (r["Total €"] as number), 0);
  data.push({
    Fecha: "", Zona: "", Tipo: "TOTAL", Cantidad: 0, Unidad: "",
    "€ por ud": 0, "Total €": total,
  } as any);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), "Consumos");
  XLSX.writeFile(wb, `consumos_${from}_${to}.xlsx`);
}

export function exportConsumoToPDF(rows: ConsumoRow[], from: string, to: string) {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  doc.setFontSize(14);
  doc.text(`Consumos · ${from} a ${to}`, 40, 40);

  const body = rows.map((r) => [
    formatDate(r.date),
    r.zona_id ?? "",
    r.tipo ?? "",
    String(Number(r.cantidad) || 0),
    r.unidad ?? "",
    (Number(r.coste_unitario) || 0).toFixed(3),
    ((Number(r.cantidad) || 0) * (Number(r.coste_unitario) || 0)).toFixed(2) + " €",
  ]);
  const total = rows.reduce((a, r) => a + (Number(r.cantidad) || 0) * (Number(r.coste_unitario) || 0), 0);
  body.push(["", "", "TOTAL", "", "", "", total.toFixed(2) + " €"]);

  autoTable(doc, {
    startY: 60,
    head: [["Fecha", "Zona", "Tipo", "Cantidad", "Ud.", "€/ud", "Total"]],
    body,
    styles: { fontSize: 9, cellPadding: 4 },
    headStyles: { fillColor: [26, 76, 60] },
  });

  doc.save(`consumos_${from}_${to}.pdf`);
}
