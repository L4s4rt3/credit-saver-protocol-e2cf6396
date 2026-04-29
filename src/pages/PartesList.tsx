import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthProvider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { StatusBadge } from "@/components/StatusBadge";
import { useI18n } from "@/lib/i18n";
import { formatDate, today } from "@/lib/format";
import { toast } from "@/hooks/use-toast";
import { Plus, Trash2 } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { ExportPartesDialog } from "@/components/ExportPartesDialog";

interface ParteRow {
  id: string;
  date: string;
  estado: string;
  created_at: string;
}

export default function PartesList() {
  const { user } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [partes, setPartes] = useState<ParteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [newDate, setNewDate] = useState(today());
  const [creating, setCreating] = useState(false);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("partes_diarios")
      .select("id,date,estado,created_at")
      .order("date", { ascending: false });
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    setPartes((data ?? []) as ParteRow[]);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function createParte() {
    if (!user) return;
    setCreating(true);
    const { data, error } = await supabase
      .from("partes_diarios")
      .insert({ date: newDate, user_id: user.id, estado: "Borrador" })
      .select("id")
      .single();
    setCreating(false);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    navigate(`/partes/${data.id}`);
  }

  async function deleteParte(id: string) {
    const { error } = await supabase.from("partes_diarios").delete().eq("id", id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Eliminado" });
    load();
  }

  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto space-y-6">
      <header className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl">{t("partes")}</h1>
          <p className="text-sm text-muted-foreground">Reconciliación diaria de masa</p>
        </div>
        <ExportPartesDialog />
      </header>

      <Card>
        <CardHeader><CardTitle className="text-lg">{t("new_parte")}</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="newdate">{t("date")}</Label>
            <Input
              id="newdate"
              type="date"
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
              className="w-48"
            />
          </div>
          <Button onClick={createParte} disabled={creating}>
            <Plus className="h-4 w-4" /> {t("new_parte")}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10" />)}
            </div>
          ) : partes.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">{t("no_data")}</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("date")}</TableHead>
                  <TableHead>{t("state")}</TableHead>
                  <TableHead className="text-right">{t("actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {partes.map((p) => (
                  <TableRow key={p.id} className="cursor-pointer" onClick={() => navigate(`/partes/${p.id}`)}>
                    <TableCell className="font-medium">{formatDate(p.date)}</TableCell>
                    <TableCell><StatusBadge estado={p.estado} /></TableCell>
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon"><Trash2 className="h-4 w-4" /></Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>¿Eliminar parte?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Se eliminará el parte del {formatDate(p.date)}. Esta acción no se puede deshacer.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
                            <AlertDialogAction onClick={() => deleteParte(p.id)}>{t("delete")}</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
