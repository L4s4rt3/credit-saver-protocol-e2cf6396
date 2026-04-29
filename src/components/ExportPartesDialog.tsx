import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { Download, FileSpreadsheet, FileText } from "lucide-react";
import { exportPartesToExcel, exportPartesToPDF, ParteRow } from "@/lib/exportPartes";

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}
const today = () => new Date().toISOString().slice(0, 10);

interface Props {
  defaultFrom?: string;
  defaultTo?: string;
}

export function ExportPartesDialog({ defaultFrom, defaultTo }: Props) {
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(defaultFrom ?? daysAgo(30));
  const [to, setTo] = useState(defaultTo ?? today());
  const [busy, setBusy] = useState<null | "xlsx" | "pdf">(null);

  async function fetchRows(): Promise<ParteRow[]> {
    const { data, error } = await supabase
      .from("partes_diarios")
      .select("*")
      .gte("date", from)
      .lte("date", to)
      .order("date", { ascending: true });
    if (error) throw error;
    return (data ?? []) as ParteRow[];
  }

  async function doExport(kind: "xlsx" | "pdf") {
    setBusy(kind);
    try {
      const rows = await fetchRows();
      if (rows.length === 0) {
        toast({ title: "Sin datos en el rango", variant: "destructive" });
        return;
      }
      if (kind === "xlsx") exportPartesToExcel(rows, from, to);
      else exportPartesToPDF(rows, from, to);
      setOpen(false);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline"><Download className="h-4 w-4" /> Exportar</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Exportar partes</DialogTitle>
          <DialogDescription>Elige el rango de fechas y el formato.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5"><Label>Desde</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Hasta</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
        </div>

        <div className="flex gap-2 flex-wrap">
          <Button size="sm" variant="ghost" onClick={() => { setFrom(today()); setTo(today()); }}>Hoy</Button>
          <Button size="sm" variant="ghost" onClick={() => { setFrom(daysAgo(6)); setTo(today()); }}>7 días</Button>
          <Button size="sm" variant="ghost" onClick={() => { setFrom(daysAgo(30)); setTo(today()); }}>30 días</Button>
          <Button size="sm" variant="ghost" onClick={() => { setFrom(daysAgo(90)); setTo(today()); }}>90 días</Button>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => doExport("pdf")} disabled={busy !== null}>
            <FileText className="h-4 w-4" /> {busy === "pdf" ? "Generando…" : "PDF"}
          </Button>
          <Button onClick={() => doExport("xlsx")} disabled={busy !== null}>
            <FileSpreadsheet className="h-4 w-4" /> {busy === "xlsx" ? "Generando…" : "Excel"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
