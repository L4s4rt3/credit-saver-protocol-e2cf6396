import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  FileText,
  LogOut,
  Citrus,
  Menu,
  X,
  Calculator,
  Droplet,
  Users,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthProvider";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { cn } from "@/lib/utils";

export default function AppLayout() {
  const { signOut, user } = useAuth();
  const { t, lang, setLang } = useI18n();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  const links = [
    { to: "/", icon: LayoutDashboard, label: t("dashboard"), end: true },
    { to: "/partes", icon: FileText, label: t("partes") },
    { to: "/dsj", icon: Calculator, label: "Calculadora DJPMN" },
    { to: "/costes/consumos", icon: Droplet, label: "Consumos" },
    { to: "/costes/asistencia", icon: Users, label: "Asistencia" },
  ];

  const sidebarBody = (
    <>
      <div className="flex items-center gap-2 px-6 py-5 border-b border-sidebar-border">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
          <Citrus className="h-5 w-5 text-primary-foreground" />
        </div>
        <div>
          <p className="font-semibold text-sidebar-foreground leading-tight">{t("app_name")}</p>
          <p className="text-xs text-sidebar-foreground/60">Citrus production</p>
        </div>
      </div>
      <nav className="flex-1 p-3 space-y-1">
        {links.map(({ to, icon: Icon, label, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={() => setMobileOpen(false)}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
                isActive
                  ? "bg-sidebar-primary text-sidebar-primary-foreground font-medium"
                  : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              )
            }
          >
            <Icon className="h-4 w-4" />
            {label}
          </NavLink>
        ))}
      </nav>
      <div className="p-3 border-t border-sidebar-border space-y-2">
        <div className="flex gap-1 px-1">
          {(["es", "en"] as const).map((l) => (
            <button
              key={l}
              onClick={() => setLang(l)}
              className={cn(
                "flex-1 rounded-md px-2 py-1 text-xs font-medium uppercase transition-colors",
                lang === l
                  ? "bg-sidebar-primary text-sidebar-primary-foreground"
                  : "text-sidebar-foreground/60 hover:bg-sidebar-accent"
              )}
            >
              {l}
            </button>
          ))}
        </div>
        <div className="px-2 text-xs text-sidebar-foreground/60 truncate">{user?.email}</div>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          onClick={async () => {
            await signOut();
            navigate("/auth");
          }}
        >
          <LogOut className="h-4 w-4" /> {t("logout")}
        </Button>
      </div>
    </>
  );

  return (
    <div className="flex min-h-screen bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-64 flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border sticky top-0 h-screen">
        {sidebarBody}
      </aside>

      {/* Mobile header */}
      <div className="md:hidden fixed top-0 inset-x-0 z-40 h-14 bg-sidebar text-sidebar-foreground border-b border-sidebar-border flex items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <Citrus className="h-5 w-5 text-primary" />
          <span className="font-semibold">{t("app_name")}</span>
        </div>
        <button onClick={() => setMobileOpen((v) => !v)} aria-label="Menu">
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-30 pt-14">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="relative flex flex-col h-full w-64 bg-sidebar text-sidebar-foreground">
            {sidebarBody}
          </aside>
        </div>
      )}

      <main className="flex-1 md:pt-0 pt-14 min-w-0">
        <Outlet />
      </main>
    </div>
  );
}
