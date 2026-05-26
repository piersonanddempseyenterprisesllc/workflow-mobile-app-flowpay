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
    <nav
      className="fixed bottom-0 inset-x-0 z-40 pointer-events-none"
      style={{ paddingBottom: "max(env(safe-area-inset-bottom), 0.5rem)" }}
      aria-label="Primary"
    >
      <div className="app-shell !pb-0 !min-h-0 pointer-events-auto">
        <div className="mx-3 rounded-[28px] bg-card/90 backdrop-blur-xl border border-border/60 shadow-[0_12px_40px_-12px_oklch(0.3_0.02_150/0.22)] px-1.5 py-1.5 flex items-center justify-between">
          {items.map(({ to, label, icon: Icon }) => {
            const active = pathname.startsWith(to);
            return (
              <Link
                key={to}
                to={to}
                aria-label={label}
                aria-current={active ? "page" : undefined}
                className={`relative flex-1 flex flex-col items-center justify-center gap-0.5 px-2 py-2 rounded-2xl transition-all min-h-12 min-w-12 ${
                  active
                    ? "text-primary-foreground bg-primary shadow-sm"
                    : "text-muted-foreground hover:text-foreground active:bg-muted"
                }`}
              >
                <Icon className="w-[22px] h-[22px]" strokeWidth={active ? 2.2 : 1.7} />
                <span className="text-[10px] font-medium tracking-wide leading-none">{label}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
