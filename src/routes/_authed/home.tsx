import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { format, startOfWeek, endOfWeek, parseISO } from "date-fns";
import { Calendar, Wallet, TrendingUp, Clock } from "lucide-react";

export const Route = createFileRoute("/_authed/home")({ component: HomePage });

function shiftHours(start: string, end: string): number {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  let mins = eh * 60 + em - (sh * 60 + sm);
  if (mins < 0) mins += 24 * 60;
  return mins / 60;
}

function HomePage() {
  const { user } = useAuth();

  const { data: profile } = useQuery({
    queryKey: ["profile", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("*, professions(name), workplaces(name)").eq("id", user!.id).maybeSingle();
      return data;
    },
    enabled: !!user,
  });

  const today = format(new Date(), "yyyy-MM-dd");
  const weekStart = format(startOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd");
  const weekEnd = format(endOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd");

  const { data: shifts = [] } = useQuery({
    queryKey: ["week-shifts", user?.id, weekStart],
    queryFn: async () => {
      const { data } = await supabase.from("shifts").select("*")
        .eq("user_id", user!.id)
        .gte("date", weekStart).lte("date", weekEnd).order("date");
      return data ?? [];
    },
    enabled: !!user,
  });

  const { data: wallet } = useQuery({
    queryKey: ["wallet", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("wallets").select("balance").eq("user_id", user!.id).maybeSingle();
      return data;
    },
    enabled: !!user,
  });

  const todayShift = shifts.find((s) => s.date === today);
  const nextShift = shifts.find((s) => s.date > today);
  const totalHours = shifts.reduce((sum, s) => sum + shiftHours(s.start_time, s.end_time), 0);
  const rate = Number(profile?.hourly_rate ?? 35);
  const earnings = totalHours * rate;

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs uppercase tracking-widest text-muted-foreground">{format(new Date(), "EEEE, MMM d")}</p>
        <h1 className="font-serif text-3xl mt-1">Hi, {profile?.full_name?.split(" ")[0] || "there"}</h1>
      </header>

      <section className="soft-card p-5 bg-gradient-to-br from-primary to-[oklch(0.32_0.05_160)] text-primary-foreground">
        <div className="flex items-center gap-2 text-xs uppercase tracking-widest opacity-80"><Clock className="w-3.5 h-3.5" /> Today</div>
        {todayShift ? (
          <div className="mt-3">
            <div className="font-serif text-3xl">{todayShift.start_time.slice(0,5)} – {todayShift.end_time.slice(0,5)}</div>
            <div className="text-sm opacity-80 mt-1">{todayShift.type} shift · {shiftHours(todayShift.start_time, todayShift.end_time).toFixed(1)}h</div>
          </div>
        ) : (
          <div className="mt-3">
            <div className="font-serif text-2xl">No shift today</div>
            <div className="text-sm opacity-80 mt-1">Enjoy your day off.</div>
          </div>
        )}
      </section>

      <div className="grid grid-cols-2 gap-3">
        <StatCard icon={Calendar} label="Next shift"
          value={nextShift ? format(parseISO(nextShift.date), "MMM d") : "—"}
          sub={nextShift ? `${nextShift.start_time.slice(0,5)}` : "Add one"} />
        <StatCard icon={TrendingUp} label="This week" value={`${totalHours.toFixed(1)}h`} sub={`${shifts.length} shifts`} />
        <StatCard icon={Wallet} label="Est. earnings" value={`$${earnings.toFixed(0)}`} sub={`@ $${rate}/h`} />
        <StatCard icon={Wallet} label="FlowPay" value={`$${Number(wallet?.balance ?? 0).toFixed(2)}`} sub="Wallet balance" accent />
      </div>

      <Link to="/calendar" className="soft-card p-4 flex items-center justify-between hover:bg-muted/40 transition-colors">
        <div>
          <div className="font-medium">Plan your week</div>
          <div className="text-sm text-muted-foreground">Tap to open calendar</div>
        </div>
        <Calendar className="w-5 h-5 text-muted-foreground" />
      </Link>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, sub, accent }: { icon: typeof Calendar; label: string; value: string; sub: string; accent?: boolean }) {
  return (
    <div className={`soft-card p-4 ${accent ? "bg-gold/20" : ""}`}>
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Icon className="w-3.5 h-3.5" />{label}</div>
      <div className="font-serif text-2xl mt-2">{value}</div>
      <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>
    </div>
  );
}
