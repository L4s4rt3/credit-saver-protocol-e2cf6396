import { cn } from "@/lib/utils";

type Estado = "Borrador" | "Analizado" | "Con descuadre" | "Validado" | string;

export function StatusBadge({ estado }: { estado: Estado }) {
  const styles: Record<string, string> = {
    Borrador: "bg-muted text-muted-foreground",
    Analizado: "bg-primary/15 text-primary",
    "Con descuadre": "bg-warning/20 text-warning",
    Validado: "bg-success/15 text-success",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        styles[estado] ?? "bg-muted text-muted-foreground"
      )}
    >
      {estado}
    </span>
  );
}
