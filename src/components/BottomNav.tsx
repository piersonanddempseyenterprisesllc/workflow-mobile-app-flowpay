import { Link, useLocation } from "@tanstack/react-router";
import { Calendar, Users, MessageCircle, User } from "lucide-react";

const items = [
  { to: "/calendar", label: "Calendar", icon: Calendar },
  { to: "/social", label: "Compare", icon: Users },
  { to: "/messages", label: "Messages", icon: MessageCircle },
  { to: "/profile", label: "Profile", icon: User },
] as const;

export function BottomNav() {
  const { pathname } = useLocation();
  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 pointer-events-none" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
      <div className="app-shell !pb-0 !min-h-0 pointer-events-auto">
        <div className="mx-3 mb-3 rounded-3xl bg-card/95 backdrop-blur border border-border/60 shadow-[0_8px_30px_-8px_oklch(0.3_0.02_150/0.18)] px-1.5 py-2 flex items-center justify-between">
          {items.map(({ to, label, icon: Icon }) => {
            const active = pathname.startsWith(to);
            return (
              <Link
                key={to}
                to={to}
                aria-label={label}
                className={`flex-1 flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-2xl transition-colors min-w-11 min-h-11 ${
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="w-5 h-5" strokeWidth={active ? 2.3 : 1.7} />
                <span className="text-[10px] font-medium tracking-wide">{label}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
