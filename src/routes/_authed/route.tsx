import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { BottomNav } from "@/components/BottomNav";

export const Route = createFileRoute("/_authed")({ component: AuthedLayout });

function AuthedLayout() {
  const { user, loading } = useAuth();
  const nav = useNavigate();

  useEffect(() => {
    if (!loading && !user) nav({ to: "/auth" });
  }, [user, loading, nav]);

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-muted-foreground text-sm">Loading…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div
        className="app-shell px-4 pb-0"
        style={{
          paddingTop: "max(env(safe-area-inset-top), 1.25rem)",
          paddingLeft: "max(env(safe-area-inset-left), 1rem)",
          paddingRight: "max(env(safe-area-inset-right), 1rem)",
        }}
      >
        <Outlet />
      </div>
      <BottomNav />
    </div>
  );
}
