import { Link, useLocation } from "@tanstack/react-router";
import { Home, Calendar, Users, Wallet, User } from "lucide-react";

const items = [
  { to: "/home", label: "Home", icon: Home },
  { to: "/calendar", label: "Calendar", icon: Calendar },
  { to: "/flowpay", label: "FlowPay", icon: Wallet },
  { to: "/social", label: "Friends", icon: Users },
  { to: "/profile", label: "Profile", icon: User },
] as const;

export function BottomNav() {
  const { pathname } = useLocation();
  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 pointer-events-none">
      <div className="app-shell !pb-0 !min-h-0 pointer-events-auto">
        <div className="mx-3 mb-3 rounded-3xl bg-card/95 backdrop-blur border border-border/60 shadow-[0_8px_30px_-8px_oklch(0.3_0.02_150/0.18)] px-2 py-2 flex items-center justify-between">
          {items.map(({ to, label, icon: Icon }) => {
            const active = pathname.startsWith(to);
            return (
              <Link
                key={to}
                to={to}
                className={`flex flex-col items-center gap-0.5 px-3 py-2 rounded-2xl transition-colors ${
                  active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="w-5 h-5" strokeWidth={active ? 2.2 : 1.8} />
                <span className="text-[10px] font-medium tracking-wide">{label}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
