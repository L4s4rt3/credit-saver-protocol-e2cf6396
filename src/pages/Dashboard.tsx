import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { KPICard } from "@/components/KPICard";
import { Button } from "@/components/ui/button";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import { Package, Users, Zap, ChevronLeft, ChevronRight, AlertCircle, UserX } from "lucide-react";
import { useState } from "react";
import { formatKg } from "@/lib/format";
import {
  getProduccionSemanal,
  getProduccionHoy,
  getAusentesHoy,
  getRendimientoPorTrabajador,
  getWeekRange,
} from "@/lib/dashboard-queries";

// ─── Loading skeleton ────────────────────────────────────────────────────────
function KPISkeleton() {
  return <div className="h-28 bg-muted rounded-lg animate-pulse" />;
}

// ─── Tooltip personalizado del gráfico ──────────────────────────────────────
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-background px-3 py-2 shadow-md text-sm">
      <p className="font-medium">{label}</p>
      <p className="text-primary">{formatKg(payload[0]?.value ?? 0)} producción real</p>
    </div>
  );
}

// ─── Dashboard ───────────────────────────────────────────────────────────────
export default function Dashboard() {
  const [weekOffset, setWeekOffset] = useState(0);

  // Etiqueta de la semana actual (sin query)
  const { label: weekLabel } = getWeekRange(weekOffset);

  // ─── Queries ─────────────────────────────────────────────────────────────
  const {
    data: weekData,
    isLoading: loadingWeek,
    error: errorWeek,
  } = useQuery({
    queryKey: ["produccion-semanal", weekOffset],
    queryFn: () => getProduccionSemanal(weekOffset),
    staleTime: 10000,
    refetchInterval: 30000,
  });

  const { data: prodHoy, isLoading: loadingProdHoy } = useQuery({
    queryKey: ["produccion-hoy"],
    queryFn: getProduccionHoy,
    refetchInterval: 30000,
    staleTime: 10000,
  });

  const { data: asistencia, isLoading: loadingAsistencia } = useQuery({
    queryKey: ["ausentes-hoy"],
    queryFn: getAusentesHoy,
    refetchInterval: 30000,
    staleTime: 10000,
  });

  const { data: rendimiento = 0, isLoading: loadingRendimiento } = useQuery({
    queryKey: ["rendimiento"],
    queryFn: getRendimientoPorTrabajador,
    refetchInterval: 30000,
    staleTime: 10000,
  });

  // ─── Valores procesados ───────────────────────────────────────────────────
  const todayKg    = prodHoy?.totalKg        ?? 0;
  const ausentes   = asistencia?.ausentes    ?? 0;
  const presentes  = asistencia?.presentes   ?? 0;
  const plantilla  = asistencia?.plantilla   ?? 0;
  const chartDays  = weekData?.days          ?? [];

  // Color de cada barra: verde si tiene datos, gris si es 0
  const barColor = (kg: number) => (kg > 0 ? "hsl(var(--primary))" : "hsl(var(--muted))");

  return (
    <div className="space-y-6">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Panel de producción</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {new Date().toLocaleDateString("es-ES", {
              weekday: "long",
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2">
            <div className="flex h-3 w-3 rounded-full bg-success animate-pulse" />
            <span className="text-sm font-medium text-success">En vivo</span>
          </div>
        </div>
      </div>

      {/* ── Error alert ── */}
      {errorWeek && (
        <div className="flex gap-3 rounded-lg border border-destructive/50 bg-destructive/5 p-4 text-sm text-destructive">
          <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">Error cargando datos</p>
            <p className="text-xs opacity-80">
              Revisa tu conexión a Supabase. Los datos pueden estar desactualizados.
            </p>
          </div>
        </div>
      )}

      {/* ── KPI Cards ── */}
      <div className="grid gap-4 md:grid-cols-3">
        {loadingProdHoy || loadingAsistencia || loadingRendimiento ? (
          <>
            <KPISkeleton />
            <KPISkeleton />
            <KPISkeleton />
          </>
        ) : (
          <>
            <KPICard
              label="Producción real hoy"
              value={formatKg(todayKg)}
              hint="kg calibrador + industria − mermas"
              icon={Package}
              trend="neutral"
            />
            <KPICard
              label="Ausencias hoy"
              value={String(ausentes)}
              hint={
                plantilla > 0
                  ? `${presentes} presentes de ${plantilla} en plantilla`
                  : "Sin datos de plantilla"
              }
              icon={UserX}
              trend={ausentes === 0 ? "up" : ausentes > 2 ? "down" : "neutral"}
            />
            <KPICard
              label="Rendimiento"
              value={formatKg(rendimiento)}
              hint="kg por trabajador presente"
              icon={Zap}
              trend="neutral"
            />
          </>
        )}
      </div>

      {/* ── Gráfico de producción semanal ── */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Producción real por día</CardTitle>
              <CardDescription>{weekLabel}</CardDescription>
            </div>
            {/* Navegación semana */}
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => setWeekOffset((w) => w - 1)}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 px-3 text-xs"
                onClick={() => setWeekOffset(0)}
                disabled={weekOffset === 0}
              >
                Esta semana
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => setWeekOffset((w) => w + 1)}
                disabled={weekOffset >= 0}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loadingWeek ? (
            <div className="h-72 bg-muted rounded-lg animate-pulse" />
          ) : (
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={chartDays}
                  margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
                  barCategoryGap="30%"
                >
                  <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => `${(v / 1000).toFixed(0)}t`}
                    width={36}
                  />
                  <Tooltip content={<CustomTooltip />} cursor={{ fill: "hsl(var(--muted))" }} />
                  <Bar dataKey="kg" radius={[4, 4, 0, 0]} maxBarSize={56}>
                    {chartDays.map((entry, index) => (
                      <Cell key={index} fill={barColor(entry.kg)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Resumen asistencia ── */}
      <Card>
        <CardHeader>
          <CardTitle>Asistencia hoy</CardTitle>
          <CardDescription>
            {plantilla > 0 ? `Plantilla total: ${plantilla} personas` : "Sin datos de plantilla para hoy"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loadingAsistencia ? (
            <div className="h-16 bg-muted rounded-lg animate-pulse" />
          ) : plantilla === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No se ha registrado asistencia para hoy.
            </p>
          ) : (
            <div className="grid grid-cols-3 divide-x text-center">
              <div className="px-4 py-2">
                <p className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">{presentes}</p>
                <p className="mt-1 text-xs font-medium text-muted-foreground uppercase tracking-wider">Presentes</p>
              </div>
              <div className="px-4 py-2">
                <p className="text-3xl font-bold text-red-600 dark:text-red-400">{ausentes}</p>
                <p className="mt-1 text-xs font-medium text-muted-foreground uppercase tracking-wider">Ausentes</p>
              </div>
              <div className="px-4 py-2">
                <p className="text-3xl font-bold">{plantilla}</p>
                <p className="mt-1 text-xs font-medium text-muted-foreground uppercase tracking-wider">Plantilla</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

    </div>
  );
}
