import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";

interface KPICardProps {
  label: string;
  value: string;
  hint?: string;
  icon?: LucideIcon;
  trend?: "up" | "down" | "neutral";
  className?: string;
}

export function KPICard({ label, value, hint, icon: Icon, trend, className }: KPICardProps) {
  return (
    <Card className={cn("shadow-[var(--shadow-card)]", className)}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-medium text-muted-foreground">{label}</p>
            <p className="mt-1 text-2xl font-semibold tracking-tight truncate">{value}</p>
            {hint && (
              <p
                className={cn(
                  "mt-1 text-xs",
                  trend === "up" && "text-success",
                  trend === "down" && "text-destructive",
                  (!trend || trend === "neutral") && "text-muted-foreground"
                )}
              >
                {hint}
              </p>
            )}
          </div>
          {Icon && (
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Icon className="h-5 w-5" />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
