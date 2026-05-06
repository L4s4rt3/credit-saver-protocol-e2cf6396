import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { KPICard } from "@/components/KPICard";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, AreaChart, Area } from "recharts";
import { Package, Users, Target, Zap, Download, AlertCircle } from "lucide-react";
import { useState } from "react";
import { formatKg } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  getProduccionUltimos7Dias,
  getProduccionPorLinea,
  getAsistenciaHoy,
  getProduccionHoy,
  getResumenAsistencia,
  getRendimientoPorTrabajador,
} from "@/lib/dashboard-queries";

const SHIFT_DISTRIBUTION = [
  { name: "Mañana", value: 42 },
  { name: "Tarde", value: 35 },
  { name: "Noche", value: 23 },
];

const COLORS = ["#378ADD", "#1D9E75", "#7F77DD"];

// ─── Loading skeleton ───────────────────────────────────────────────────────
function KPISkeleton() {
  return (
    <div className="h-28 bg-muted rounded-lg animate-pulse" />
  );
}

// ─── Dashboard ──────────────────────────────────────────────────────────────
export default function Dashboard() {
  const [period, setPeriod] = useState<"hoy" | "semana" | "mes" | "trimestre">("hoy");

  // ─── QUERIES ────────────────────────────────────────────────────────────
  const { data: dailyData = [], isLoading: loadingDaily, error: errorDaily } = useQuery({
    queryKey: ["produccion-7dias"],
    queryFn: getProduccionUltimos7Dias,
    refetchInterval: 30000, // Actualizar cada 30 segundos
    staleTime: 10000, // Cache por 10 segundos
  });

  const { data: lineData = [], isLoading: loadingLines, error: errorLines } = useQuery({
    queryKey: ["produccion-por-linea"],
    queryFn: getProduccionPorLinea,
    refetchInterval: 30000,
    staleTime: 10000,
  });

  const { data: workers = [], isLoading: loadingWorkers, error: errorWorkers } = useQuery({
    queryKey: ["asistencia-hoy"],
    queryFn: getAsistenciaHoy,
    refetchInterval: 30000,
    staleTime: 10000,
  });

  const { data: prodHoy, isLoading: loadingProdHoy } = useQuery({
    queryKey: ["produccion-hoy"],
    queryFn: getProduccionHoy,
    refetchInterval: 30000,
    staleTime: 10000,
  });

  const { data: resumenAsistencia, isLoading: loadingResumen } = useQuery({
    queryKey: ["resumen-asistencia"],
    queryFn: getResumenAsistencia,
    refetchInterval: 30000,
    staleTime: 10000,
  });

  const { data: rendimiento = 0, isLoading: loadingRendimiento } = useQuery({
    queryKey: ["rendimiento"],
    queryFn: getRendimientoPorTrabajador,
    refetchInterval: 30000,
    staleTime: 10000,
  });

  // ─── DATOS PROCESADOS ───────────────────────────────────────────────────
  const todayKg = prodHoy?.totalKg || 0;
  const todayGoal = prodHoy?.objetivo || 5200;
  const completion = prodHoy?.completion || 0;
  const presentWorkers = resumenAsistencia?.present || 0;
  const totalWorkers = resumenAsistencia?.total || 0;
  const absentWorkers = totalWorkers - presentWorkers;

  const lineOptimal = lineData.filter(l => l.status === "optimal").length;
  const lineCritical = lineData.filter(l => l.status === "critical").length;

  // ─── ERROR DISPLAY ──────────────────────────────────────────────────────
  const hasErrors = errorDaily || errorLines || errorWorkers;

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
              day: "numeric" 
            })}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="flex h-3 w-3 rounded-full bg-success animate-pulse" />
            <span className="text-sm font-medium text-success">En vivo</span>
          </div>
          <Button variant="outline" size="sm">
            <Download className="h-4 w-4 mr-2" />
            Exportar
          </Button>
        </div>
      </div>

      {/* ── Error alert ── */}
      {hasErrors && (
        <div className="flex gap-3 rounded-lg border border-destructive/50 bg-destructive/5 p-4 text-sm text-destructive">
          <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">Error cargando datos</p>
            <p className="text-xs opacity-80">Revisa tu conexión a Supabase. Los datos mostrados pueden estar desactualizados.</p>
          </div>
        </div>
      )}

      {/* ── Period selector ── */}
      <Tabs value={period} onValueChange={(v) => setPeriod(v as any)} className="w-full">
        <TabsList className="grid w-fit grid-cols-4">
          <TabsTrigger value="hoy">Hoy</TabsTrigger>
          <TabsTrigger value="semana">Semana</TabsTrigger>
          <TabsTrigger value="mes">Mes</TabsTrigger>
          <TabsTrigger value="trimestre">Trimestre</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* ── KPI Grid ── */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {loadingProdHoy ? (
          <>
            <KPISkeleton />
            <KPISkeleton />
            <KPISkeleton />
            <KPISkeleton />
          </>
        ) : (
          <>
            <KPICard
              label="Producción total"
              value={`${formatKg(todayKg)}`}
              hint={"+6.2% vs ayer"}
              icon={Package}
              trend="up"
            />
            <KPICard
              label="Objetivo turno"
              value={`${formatKg(todayGoal)}`}
              hint={`${completion}% completado`}
              icon={Target}
              trend={completion >= 90 ? "up" : completion >= 70 ? "neutral" : "down"}
            />
            <KPICard
              label="Trabajadores"
              value={`${presentWorkers} / ${totalWorkers}`}
              hint={absentWorkers === 0 ? "Sin ausencias" : `${absentWorkers} ausencias`}
              icon={Users}
              trend={absentWorkers > 1 ? "down" : "up"}
            />
            <KPICard
              label="Rendimiento"
              value={`${formatKg(rendimiento)}`}
              hint="kg / trabajador"
              icon={Zap}
              trend="neutral"
            />
          </>
        )}
      </div>

      {/* ── Charts Row ── */}
      <div className="grid gap-6 lg:grid-cols-3">

        {/* Production chart (2/3 width) */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Producción diaria (kg)</CardTitle>
            <CardDescription>Últimos 7 días · línea roja = objetivo</CardDescription>
          </CardHeader>
          <CardContent>
            {loadingDaily ? (
              <div className="h-72 bg-muted rounded-lg animate-pulse" />
            ) : dailyData.length === 0 ? (
              <div className="h-72 flex items-center justify-center text-muted-foreground">
                Sin datos disponibles
              </div>
            ) : (
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dailyData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                    <XAxis dataKey="date" stroke="var(--color-muted-foreground)" />
                    <YAxis stroke="var(--color-muted-foreground)" />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "var(--background)",
                        border: "1px solid var(--color-border)",
                        borderRadius: "6px",
                        color: "var(--foreground)",
                      }}
                      formatter={(value: any) => `${value.toLocaleString()} kg`}
                    />
                    <Bar dataKey="kg" fill="#378ADD" radius={[4, 4, 0, 0]} />
                    <Line
                      type="monotone"
                      dataKey="objetivo"
                      stroke="#E24B4A"
                      strokeWidth={2}
                      strokeDasharray="4 4"
                      dot={false}
                      isAnimationActive={false}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
            <div className="mt-4 flex items-center justify-center gap-6 text-sm">
              <div className="flex items-center gap-2">
                <div className="h-2.5 w-2.5 rounded bg-blue-500" />
                <span>Producción</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-0.5 w-4 border-2 border-dashed border-red-500" />
                <span>Objetivo</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Shift distribution (1/3 width) */}
        <Card>
          <CardHeader>
            <CardTitle>Distribución turno</CardTitle>
            <CardDescription>Kg por franja horaria</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex h-72 items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={SHIFT_DISTRIBUTION}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {SHIFT_DISTRIBUTION.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => `${value}%`} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-4 space-y-2">
              {SHIFT_DISTRIBUTION.map((item, i) => (
                <div key={item.name} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: COLORS[i] }} />
                    <span>{item.name}</span>
                  </div>
                  <span className="font-medium">{item.value}%</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

      </div>

      {/* ── Production lines + Attendance ── */}
      <div className="grid gap-6 lg:grid-cols-2">

        {/* Production lines */}
        <Card>
          <CardHeader>
            <CardTitle>Líneas de producción</CardTitle>
            <CardDescription>{lineOptimal} óptimas · {lineCritical} críticas</CardDescription>
          </CardHeader>
          <CardContent>
            {loadingLines ? (
              <div className="space-y-4">
                {[1, 2, 3, 4].map(i => (
                  <div key={i} className="h-16 bg-muted rounded-lg animate-pulse" />
                ))}
              </div>
            ) : lineData.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground">
                Sin datos de líneas
              </div>
            ) : (
              <div className="space-y-4">
                {lineData.map((line) => {
                  const percent = (line.kg / line.goal) * 100;
                  const statusColor = {
                    optimal: "bg-emerald-500",
                    warning: "bg-amber-500",
                    critical: "bg-red-500",
                  }[line.status];

                  const statusLabel = {
                    optimal: "Óptima",
                    warning: "Revisión",
                    critical: "Parada",
                  }[line.status];

                  return (
                    <div key={line.line} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">{line.line}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold">{formatKg(line.kg)}</span>
                          <span
                            className={cn(
                              "text-xs font-medium px-2 py-1 rounded-full",
                              line.status === "optimal" &&
                                "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
                              line.status === "warning" &&
                                "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
                              line.status === "critical" &&
                                "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"
                            )}
                          >
                            {statusLabel}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                          <div
                            className={cn("h-full rounded-full transition-all", statusColor)}
                            style={{ width: `${Math.min(percent, 100)}%` }}
                          />
                        </div>
                        <span className="text-xs text-muted-foreground w-10 text-right">{Math.round(percent)}%</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Attendance */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Asistencia</CardTitle>
              <CardDescription>Turno mañana</CardDescription>
            </div>
            <Button variant="outline" size="sm">
              <Download className="h-4 w-4 mr-2" />
              Descargar
            </Button>
          </CardHeader>
          <CardContent>
            {loadingWorkers ? (
              <div className="space-y-3">
                {[1, 2, 3, 4, 5].map(i => (
                  <div key={i} className="h-12 bg-muted rounded-lg animate-pulse" />
                ))}
              </div>
            ) : workers.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground">
                Sin datos de asistencia
              </div>
            ) : (
              <div className="space-y-3 max-h-80 overflow-y-auto">
                {workers.map((worker) => {
                  const statusColor = {
                    present: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
                    absent: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
                    late: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
                  }[worker.status];

                  const statusLabel = {
                    present: "Presente",
                    absent: "Ausente",
                    late: "Retrasado",
                  }[worker.status];

                  return (
                    <div
                      key={worker.id}
                      className="flex items-center justify-between p-2 rounded-lg hover:bg-muted transition-colors"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{worker.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {worker.line} {worker.entry_time && `· entrada ${worker.entry_time}`}
                        </p>
                      </div>
                      <span className={cn("text-xs font-medium px-2 py-1 rounded-full whitespace-nowrap ml-2", statusColor)}>
                        {statusLabel}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

      </div>

    </div>
  );
}
