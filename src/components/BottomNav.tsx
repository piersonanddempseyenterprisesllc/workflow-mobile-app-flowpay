import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { Calendar, Wallet, User, Plus } from "lucide-react";

const items = [
  { to: "/calendar", label: "Schedule", icon: Calendar },
  { to: "/wallet", label: "FlowPay", icon: Wallet },
  { to: "/profile", label: "Profile", icon: User },
] as const;

export function BottomNav() {
  const { pathname } = useLocation();
  const navigate = useNavigate();

  const handleAddShift = async () => {
    if (!pathname.startsWith("/calendar")) {
      await navigate({ to: "/calendar" });
      // wait for calendar to mount before dispatching
      setTimeout(() => window.dispatchEvent(new CustomEvent("workflow:add-shift")), 120);
    } else {
      window.dispatchEvent(new CustomEvent("workflow:add-shift"));
    }
  };

  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-40 pointer-events-none"
      style={{ paddingBottom: "max(env(safe-area-inset-bottom), 0.5rem)" }}
      aria-label="Primary"
    >
      <div className="app-shell !pb-0 !min-h-0 pointer-events-auto">
        <div className="mx-3 relative rounded-[28px] bg-card/95 backdrop-blur-xl border border-border/60 shadow-[0_12px_40px_-12px_oklch(0.3_0.02_150/0.22)] px-2 py-2 flex items-center justify-between">
          {/* Schedule */}
          <NavItem item={items[0]} active={pathname.startsWith(items[0].to)} />

          {/* Center FAB */}
          <button
            type="button"
            onClick={handleAddShift}
            aria-label="Add Shift"
            className="relative -mt-7 flex flex-col items-center justify-center"
          >
            <span
              className="w-14 h-14 rounded-2xl flex items-center justify-center text-white shadow-[0_12px_24px_-8px_oklch(0.5_0.18_280/0.55)] active:scale-95 transition-transform"
              style={{ background: "linear-gradient(135deg, #7C5CFF 0%, #5B7CFF 45%, #3CD2A8 100%)" }}
            >
              <Plus className="w-7 h-7" strokeWidth={2.5} />
            </span>
            <span className="text-[10px] font-semibold tracking-wide mt-1 bg-gradient-to-r from-[#7C5CFF] to-[#3CD2A8] bg-clip-text text-transparent">
              Add Shift
            </span>
          </button>

          {/* FlowPay + Profile */}
          <NavItem item={items[1]} active={pathname.startsWith(items[1].to)} />
          <NavItem item={items[2]} active={pathname.startsWith(items[2].to)} />
        </div>
      </div>
    </nav>
  );
}

function NavItem({
  item,
  active,
}: {
  item: { to: string; label: string; icon: React.ComponentType<{ className?: string; strokeWidth?: number }> };
  active: boolean;
}) {
  const Icon = item.icon;
  return (
    <Link
      to={item.to}
      aria-label={item.label}
      aria-current={active ? "page" : undefined}
      className={`flex-1 flex flex-col items-center justify-center gap-0.5 px-2 py-2 rounded-2xl transition-colors min-h-12 ${
        active ? "text-primary" : "text-muted-foreground hover:text-foreground"
      }`}
    >
      <Icon className="w-[22px] h-[22px]" strokeWidth={active ? 2.2 : 1.7} />
      <span className="text-[10px] font-medium tracking-wide leading-none">{item.label}</span>
    </Link>
  );
}
