import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthProvider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/hooks/use-toast";
import { Plus, Trash2 } from "lucide-react";
import { today } from "@/lib/format";
import { cn } from "@/lib/utils";

const ZONAS = ["Línea de tratamiento", "Mallas", "Graneles", "Mesas", "Industria", "Drencher"];

interface Row {
  id: string;
  date: string;
  zona_id: string | null;
  plantilla_total: number;
  presentes: number;
  ausentes: number;
}

export default function Asistencia() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const since = new Date();
    since.setDate(since.getDate() - 30);
    const { data, error } = await supabase
      .from("asistencia_diaria")
      .select("id,date,zona_id,plantilla_total,presentes,ausentes")
      .gte("date", since.toISOString().slice(0, 10))
      .order("date", { ascending: false });
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    setRows((data ?? []) as Row[]);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function addRow() {
    if (!user) return;
    const { error } = await supabase.from("asistencia_diaria").insert({
      user_id: user.id,
      date: today(),
      zona_id: ZONAS[0],
      plantilla_total: 0,
      presentes: 0,
      ausentes: 0,
    });
    if (error) return toast({ title: "Error", description: error.message, variant: "destructive" });
    load();
  }

  async function patch(id: string, patch: Partial<Row>) {
    setRows((r) => r.map((x) => (x.id === id ? { ...x, ...patch } : x)));
    const { error } = await supabase.from("asistencia_diaria").update(patch).eq("id", id);
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
  }

  async function del(id: string) {
    setRows((r) => r.filter((x) => x.id !== id));
    const { error } = await supabase.from("asistencia_diaria").delete().eq("id", id);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); load(); }
  }

  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto space-y-6">
      <header className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl">Asistencia</h1>
          <p className="text-sm text-muted-foreground">Plantilla y presentes por zona — últimos 30 días</p>
        </div>
        <Button onClick={addRow}><Plus className="h-4 w-4" /> Añadir fila</Button>
      </header>

      <Card>
        <CardHeader><CardTitle className="text-lg">Registros</CardTitle></CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-3">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10" />)}
            </div>
          ) : rows.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              Sin registros. Pulsa "Añadir fila".
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Zona</TableHead>
                  <TableHead className="text-right">Plantilla</TableHead>
                  <TableHead className="text-right">Presentes</TableHead>
                  <TableHead className="text-right">Ausentes</TableHead>
                  <TableHead className="text-right">% Asist.</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => {
                  const pct = r.plantilla_total > 0 ? (r.presentes / r.plantilla_total) * 100 : 0;
                  return (
                    <TableRow key={r.id}>
                      <TableCell>
                        <Input
                          type="date"
                          value={r.date}
                          onChange={(e) => patch(r.id, { date: e.target.value })}
                          className="w-36 h-8"
                        />
                      </TableCell>
                      <TableCell>
                        <select
                          value={r.zona_id ?? ""}
                          onChange={(e) => patch(r.id, { zona_id: e.target.value })}
                          className="h-8 rounded-md border bg-background px-2 text-sm"
                        >
                          {ZONAS.map((z) => <option key={z} value={z}>{z}</option>)}
                        </select>
                      </TableCell>
                      <TableCell className="text-right">
                        <Input type="number" min="0" className="h-8 w-20 ml-auto tabular-nums text-right"
                          value={r.plantilla_total}
                          onChange={(e) => patch(r.id, { plantilla_total: Number(e.target.value) || 0 })} />
                      </TableCell>
                      <TableCell className="text-right">
                        <Input type="number" min="0" className="h-8 w-20 ml-auto tabular-nums text-right"
                          value={r.presentes}
                          onChange={(e) => patch(r.id, { presentes: Number(e.target.value) || 0 })} />
                      </TableCell>
                      <TableCell className="text-right">
                        <Input type="number" min="0" className="h-8 w-20 ml-auto tabular-nums text-right"
                          value={r.ausentes}
                          onChange={(e) => patch(r.id, { ausentes: Number(e.target.value) || 0 })} />
                      </TableCell>
                      <TableCell className={cn("text-right tabular-nums", pct < 90 && "text-destructive font-medium")}>
                        {pct.toFixed(1)}%
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" onClick={() => del(r.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
