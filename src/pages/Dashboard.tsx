import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { KPICard } from "@/components/KPICard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, ReferenceLine, ResponsiveContainer,
} from "recharts";
import { Button } from "@/components/ui/button";
import { computeCascade } from "@/lib/cascade";
import { formatKg, formatPct, formatDate } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { Truck, Package, Recycle, TrendingDown, FileText, Plus } from "lucide-react";
import { StatusBadge } from "@/components/StatusBadge";
import { Skeleton } from "@/components/ui/skeleton";

interface ParteRow {
  id: string;
  date: string;
  estado: string;
  kg_industria_manual: number;
  kg_reciclado_malla_z1: number;
  kg_reciclado_malla_z2: number;
  kg_inventario_sin_alta: number;
  kg_inventario_anterior_sin_alta: number;
  kg_podrido_bolsa_basura: number;
  kg_produccion_calibrador: number;
  kg_mujeres_calibrador: number;
  kg_palets_brutos: number;
  kg_podrido_calibrador_auto: number;
}

export default function Dashboard() {
  const { t } = useI18n();
  const [partes, setPartes] = useState<ParteRow[]>([]);
  const [entradasByPart, setEntradasByPart] = useState<Record<string, number>>({});
  const [packedByPart, setPackedByPart] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const since = new Date();
      since.setDate(since.getDate() - 30);
      const sinceStr = since.toISOString().slice(0, 10);

      const { data: p } = await supabase
        .from("partes_diarios")
        .select("*")
        .gte("date", sinceStr)
        .order("date", { ascending: false });

      setPartes((p ?? []) as ParteRow[]);
      setLoading(false);
    })();
  }, []);

  const totals = useMemo(() => {
    let produccion_real = 0,
      palets = 0,
      mermas = 0,
      dsj = 0;
    partes.forEach((p) => {
      const r = computeCascade({
        kg_produccion_calibrador: Number(p.kg_produccion_calibrador),
        kg_mujeres_calibrador: Number(p.kg_mujeres_calibrador),
        kg_palets_brutos: Number(p.kg_palets_brutos),
        kg_podrido_calibrador: Number(p.kg_podrido_calibrador_auto),
        kg_industria_manual: Number(p.kg_industria_manual),
        kg_reciclado_malla_z1: Number(p.kg_reciclado_malla_z1),
        kg_reciclado_malla_z2: Number(p.kg_reciclado_malla_z2),
        kg_inventario_sin_alta: Number(p.kg_inventario_sin_alta),
        kg_podrido_bolsa_basura: Number(p.kg_podrido_bolsa_basura),
        kg_inventario_anterior_sin_alta: Number(p.kg_inventario_anterior_sin_alta),
      });
      produccion_real += r.produccion_real;
      palets += r.palets_ajustados;
      mermas += r.mermas_totales;
      dsj += r.dsj;
    });
    const dsj_pct = produccion_real ? (dsj / produccion_real) * 100 : 0;
    return { produccion_real, palets, mermas, dsj, dsj_pct };
  }, [partes]);

  const dsjChart = useMemo(() => {
    return [...partes]
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-30)
      .map((p) => {
        const r = computeCascade({
          kg_produccion_calibrador: Number(p.kg_produccion_calibrador),
          kg_mujeres_calibrador: Number(p.kg_mujeres_calibrador),
          kg_palets_brutos: Number(p.kg_palets_brutos),
          kg_podrido_calibrador: Number(p.kg_podrido_calibrador_auto),
          kg_industria_manual: Number(p.kg_industria_manual),
          kg_reciclado_malla_z1: Number(p.kg_reciclado_malla_z1),
          kg_reciclado_malla_z2: Number(p.kg_reciclado_malla_z2),
          kg_inventario_sin_alta: Number(p.kg_inventario_sin_alta),
          kg_podrido_bolsa_basura: Number(p.kg_podrido_bolsa_basura),
          kg_inventario_anterior_sin_alta: Number(p.kg_inventario_anterior_sin_alta),
        });
        return { date: p.date, label: p.date.slice(5), dsj_pct: Number(r.dsj_pct.toFixed(2)) };
      });
  }, [partes]);

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
      <header className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl">{t("dashboard")}</h1>
          <p className="text-sm text-muted-foreground">{t("last_30_days")}</p>
        </div>
        <Button asChild>
          <Link to="/partes"><FileText className="h-4 w-4" /> {t("partes")}</Link>
        </Button>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28" />)
        ) : (
          <>
            <KPICard label="Producción real" value={formatKg(totals.produccion_real)} icon={Truck} />
            <KPICard
              label="Palets alta ajustados"
              value={formatKg(totals.palets)}
              icon={Package}
              trend="up"
            />
            <KPICard label="Mermas" value={formatKg(totals.mermas)} icon={Recycle} />
            <KPICard
              label="DJPMN acumulado"
              value={formatKg(totals.dsj)}
              hint={`${formatPct(totals.dsj_pct)}`}
              icon={TrendingDown}
              trend="down"
            />
          </>
        )}
      </section>

      <Card>
        <CardHeader><CardTitle className="text-lg">% DJPMN · últimos 30 partes</CardTitle></CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-64" />
          ) : dsjChart.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">{t("no_data")}</div>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={dsjChart} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="label" fontSize={11} />
                <YAxis fontSize={11} tickFormatter={(v) => `${v}%`} />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "var(--radius)",
                    fontSize: 12,
                  }}
                  labelFormatter={(_, p) => (p?.[0]?.payload?.date ? formatDate(p[0].payload.date) : "")}
                  formatter={(v: number) => [`${v}%`, "DJPMN"]}
                />
                <ReferenceLine y={3} stroke="hsl(var(--destructive))" strokeDasharray="4 4" />
                <ReferenceLine y={-3} stroke="hsl(var(--destructive))" strokeDasharray="4 4" />
                <ReferenceLine y={1} stroke="hsl(var(--warning))" strokeDasharray="4 4" />
                <ReferenceLine y={-1} stroke="hsl(var(--warning))" strokeDasharray="4 4" />
                <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" />
                <Line type="monotone" dataKey="dsj_pct" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">{t("partes")}</CardTitle>
          <Button size="sm" asChild>
            <Link to="/partes"><Plus className="h-4 w-4" />{t("new_parte")}</Link>
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-3">
              {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12" />)}
            </div>
          ) : partes.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">{t("no_data")}</div>
          ) : (
            <ul className="divide-y">
              {partes.slice(0, 10).map((p) => (
                <li key={p.id}>
                  <Link to={`/partes/${p.id}`} className="flex items-center justify-between px-6 py-3 hover:bg-muted/40 transition-colors">
                    <div className="flex items-center gap-4">
                      <span className="font-medium">{formatDate(p.date)}</span>
                      <StatusBadge estado={p.estado} />
                    </div>
                    <div className="text-sm text-muted-foreground flex gap-4">
                      <span>{formatKg(Number(p.kg_produccion_calibrador))} calib.</span>
                      <span>{formatKg(Number(p.kg_palets_brutos))} palets</span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
