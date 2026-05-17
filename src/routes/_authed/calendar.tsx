import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay,
  startOfWeek, endOfWeek, addMonths, isSameMonth, parseISO,
} from "date-fns";
import {
  Plus, Sun, Moon, Sunset, Phone, Palmtree, PartyPopper, Stethoscope,
  List, Settings, Bell, Trash2, MapPin, Share2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

export const Route = createFileRoute("/_authed/calendar")({ component: CalendarPage });

type Shift = {
  id: string; user_id: string; date: string;
  start_time: string; end_time: string; type: string;
  notes: string | null; category: string;
  location: string | null; title: string | null;
};

type Category = "work" | "vacation" | "event" | "appointment";
const CATEGORIES: { id: Category; label: string }[] = [
  { id: "work", label: "Work" },
  { id: "vacation", label: "Vacation" },
  { id: "event", label: "Events" },
  { id: "appointment", label: "Appointments" },
];

const WORK_TYPES = ["Day", "Night", "Evening", "On-call", "Off"] as const;

const TYPE_META: Record<string, { Icon: typeof Sun; tint: string; ink: string }> = {
  Day:       { Icon: Sun,        tint: "bg-day-shift/85",     ink: "text-foreground" },
  Night:     { Icon: Moon,       tint: "bg-night-shift",      ink: "text-white" },
  Evening:   { Icon: Sunset,     tint: "bg-evening-shift/90", ink: "text-white" },
  "On-call": { Icon: Phone,      tint: "bg-oncall-shift",     ink: "text-white" },
  Off:       { Icon: Palmtree,   tint: "bg-off-shift/30",     ink: "text-foreground" },
};

const CAT_META: Record<Category, { Icon: typeof Sun; tint: string; ink: string; label: string }> = {
  work:        { Icon: Sun,         tint: "bg-day-shift/85",  ink: "text-foreground", label: "Work" },
  vacation:    { Icon: Palmtree,    tint: "bg-off-shift/40",  ink: "text-foreground", label: "Vacation" },
  event:       { Icon: PartyPopper, tint: "bg-evening-shift", ink: "text-white",      label: "Event" },
  appointment: { Icon: Stethoscope, tint: "bg-oncall-shift",  ink: "text-white",      label: "Appointment" },
};

function metaFor(s: Shift) {
  if (s.category === "work") return TYPE_META[s.type] ?? CAT_META.work;
  return CAT_META[s.category as Category] ?? CAT_META.work;
}

function shiftHours(start: string, end: string): number {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  let mins = eh * 60 + em - (sh * 60 + sm);
  if (mins < 0) mins += 24 * 60;
  return mins / 60;
}

function CalendarPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [activeCat, setActiveCat] = useState<Category>("work");
  const [selected, setSelected] = useState<Date | null>(null);
  const [openShare, setOpenShare] = useState(false);

  // Continuous-scroll: render a window of months
  const today = new Date();
  const [monthsBack, setMonthsBack] = useState(2);
  const [monthsForward, setMonthsForward] = useState(6);
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  const months = useMemo(() => {
    const list: Date[] = [];
    for (let i = -monthsBack; i <= monthsForward; i++) list.push(addMonths(today, i));
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthsBack, monthsForward]);

  const rangeStart = format(startOfMonth(months[0]), "yyyy-MM-dd");
  const rangeEnd = format(endOfMonth(months[months.length - 1]), "yyyy-MM-dd");

  const { data: shifts = [] } = useQuery({
    queryKey: ["shifts", user?.id, rangeStart, rangeEnd, activeCat],
    queryFn: async () => {
      const { data } = await supabase.from("shifts").select("*")
        .eq("user_id", user!.id)
        .eq("category", activeCat)
        .gte("date", rangeStart).lte("date", rangeEnd).order("date");
      return (data ?? []) as Shift[];
    },
    enabled: !!user,
  });

  const { data: profile } = useQuery({
    queryKey: ["profile", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("full_name, avatar_url").eq("id", user!.id).maybeSingle();
      return data;
    },
    enabled: !!user,
  });

  const shiftMap = useMemo(() => {
    const m = new Map<string, Shift>();
    for (const s of shifts) m.set(s.date, s);
    return m;
  }, [shifts]);

  // Lazy-load more months when scrolling near edges
  function onScroll() {
    const el = scrollerRef.current;
    if (!el) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 400) {
      setMonthsForward((n) => n + 3);
    }
    if (el.scrollTop < 200) {
      const prev = el.scrollHeight;
      setMonthsBack((n) => n + 2);
      requestAnimationFrame(() => {
        if (scrollerRef.current) {
          scrollerRef.current.scrollTop += scrollerRef.current.scrollHeight - prev;
        }
      });
    }
  }

  const initials = (profile?.full_name ?? user?.email ?? "U")
    .split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase();

  return (
    <div className="-mx-4 -mt-6 flex flex-col h-[100dvh]">
      {/* Header */}
      <header className="px-4 pt-4 pb-2 flex items-center justify-between bg-background">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-accent flex items-center justify-center overflow-hidden ring-1 ring-border">
            {profile?.avatar_url ? (
              <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
            ) : (
              <span className="text-xs font-semibold text-accent-foreground">{initials}</span>
            )}
          </div>
          <h1 className="font-serif text-2xl">Calendar</h1>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setOpenShare(true)} className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-muted/60 text-foreground">
            <Share2 className="w-5 h-5" />
          </button>
          <button onClick={() => setSelected(new Date())} className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-muted/60 text-foreground">
            <Plus className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Category tabs */}
      <div className="px-4 pb-3 border-b border-border/60">
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
          {CATEGORIES.map((c) => {
            const active = activeCat === c.id;
            return (
              <button
                key={c.id}
                onClick={() => setActiveCat(c.id)}
                className={`shrink-0 px-5 h-10 rounded-full text-sm font-medium transition-colors ${
                  active ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {c.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Scrollable months */}
      <div ref={scrollerRef} onScroll={onScroll} className="flex-1 overflow-y-auto px-2 pb-32">
        {months.map((m) => (
          <MonthBlock
            key={format(m, "yyyy-MM")}
            month={m}
            shiftMap={shiftMap}
            onDayTap={setSelected}
          />
        ))}
      </div>

      {/* Day detail / edit dialog */}
      <ShiftDialog
        date={selected}
        category={activeCat}
        existing={selected ? shiftMap.get(format(selected, "yyyy-MM-dd")) ?? null : null}
        onClose={() => setSelected(null)}
        onSaved={() => qc.invalidateQueries({ queryKey: ["shifts"] })}
      />

      <ShareDialog open={openShare} onOpenChange={setOpenShare} />
    </div>
  );
}

function MonthBlock({
  month, shiftMap, onDayTap,
}: { month: Date; shiftMap: Map<string, Shift>; onDayTap: (d: Date) => void }) {
  const days = eachDayOfInterval({
    start: startOfWeek(startOfMonth(month), { weekStartsOn: 0 }),
    end: endOfWeek(endOfMonth(month), { weekStartsOn: 0 }),
  });

  return (
    <section className="pt-5 pb-2">
      <div className="px-3 flex items-center justify-between mb-3">
        <h2 className="font-serif text-xl">{format(month, "MMMM yyyy")}</h2>
        <div className="flex items-center gap-1 text-muted-foreground">
          <button className="w-8 h-8 rounded-lg hover:bg-muted/60 flex items-center justify-center"><List className="w-4 h-4" /></button>
          <button className="w-8 h-8 rounded-lg hover:bg-muted/60 flex items-center justify-center"><Settings className="w-4 h-4" /></button>
          <button className="w-8 h-8 rounded-lg hover:bg-muted/60 flex items-center justify-center"><Bell className="w-4 h-4" /></button>
        </div>
      </div>

      <div className="grid grid-cols-7 px-2 mb-1">
        {["Su", "M", "Tu", "W", "Th", "F", "Sa"].map((d, i) => (
          <div key={i} className="text-center text-[11px] text-muted-foreground font-medium py-1">{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 px-2 gap-px bg-border/40">
        {days.map((d) => {
          const key = format(d, "yyyy-MM-dd");
          const s = shiftMap.get(key);
          const inMonth = isSameMonth(d, month);
          const isToday = isSameDay(d, new Date());
          const m = s ? metaFor(s) : null;
          const Icon = m?.Icon;
          return (
            <button
              key={key}
              onClick={() => onDayTap(d)}
              className={`relative bg-background min-h-[68px] flex flex-col items-center pt-2 pb-1 transition-colors ${
                inMonth ? "" : "opacity-30"
              }`}
            >
              {s ? (
                <div className={`absolute inset-0 ${m!.tint} flex flex-col items-center justify-center`}>
                  <span className={`text-base font-semibold ${m!.ink}`}>{format(d, "d")}</span>
                  {Icon && <Icon className={`w-4 h-4 mt-0.5 ${m!.ink} opacity-90`} strokeWidth={2} />}
                </div>
              ) : (
                <>
                  <span className={`text-base ${isToday ? "font-bold text-primary" : "text-foreground/90"}`}>{format(d, "d")}</span>
                </>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}

function ShiftDialog({
  date, category, existing, onClose, onSaved,
}: {
  date: Date | null; category: Category; existing: Shift | null;
  onClose: () => void; onSaved: () => void;
}) {
  const { user } = useAuth();
  const [start, setStart] = useState("07:00");
  const [end, setEnd] = useState("19:00");
  const [type, setType] = useState<string>("Day");
  const [title, setTitle] = useState("");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!date) return;
    setStart(existing?.start_time?.slice(0, 5) ?? (category === "work" ? "07:00" : "09:00"));
    setEnd(existing?.end_time?.slice(0, 5) ?? (category === "work" ? "19:00" : "10:00"));
    setType(existing?.type ?? (category === "work" ? "Day" : category));
    setTitle(existing?.title ?? "");
    setLocation(existing?.location ?? "");
    setNotes(existing?.notes ?? "");
  }, [date, existing, category]);

  async function save() {
    if (!date) return;
    setSaving(true);
    const payload = {
      user_id: user!.id,
      date: format(date, "yyyy-MM-dd"),
      start_time: start, end_time: end,
      type: category === "work" ? type : category,
      category,
      title: title || null,
      location: location || null,
      notes: notes || null,
    };
    const { error } = existing
      ? await supabase.from("shifts").update(payload).eq("id", existing.id)
      : await supabase.from("shifts").insert(payload);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(existing ? "Updated" : "Added");
    onSaved();
    onClose();
  }

  async function remove() {
    if (!existing) return;
    const { error } = await supabase.from("shifts").delete().eq("id", existing.id);
    if (error) return toast.error(error.message);
    toast.success("Removed");
    onSaved();
    onClose();
  }

  const catLabel = CAT_META[category].label;
  const hrs = existing ? shiftHours(existing.start_time, existing.end_time) : 0;

  return (
    <Dialog open={!!date} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="rounded-3xl max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl">
            {date && format(date, "EEEE, MMM d")}
          </DialogTitle>
          {existing && (
            <p className="text-xs text-muted-foreground">
              {catLabel} · {existing.start_time.slice(0, 5)}–{existing.end_time.slice(0, 5)} · {hrs.toFixed(1)}h
              {existing.location ? ` · ${existing.location}` : ""}
            </p>
          )}
        </DialogHeader>
        <div className="space-y-3">
          {category === "work" && (
            <div className="flex flex-wrap gap-1.5">
              {WORK_TYPES.map((t) => {
                const active = type === t;
                const tm = TYPE_META[t];
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => {
                      setType(t);
                      if (t === "Day") { setStart("07:00"); setEnd("19:00"); }
                      else if (t === "Night") { setStart("19:00"); setEnd("07:00"); }
                      else if (t === "Evening") { setStart("15:00"); setEnd("23:00"); }
                      else if (t === "On-call") { setStart("08:00"); setEnd("20:00"); }
                      else { setStart("00:00"); setEnd("00:00"); }
                    }}
                    className={`px-3 h-8 rounded-full text-xs font-medium border transition-colors ${
                      active ? `${tm.tint} ${tm.ink} border-transparent` : "bg-card border-border text-muted-foreground"
                    }`}
                  >
                    {t}
                  </button>
                );
              })}
            </div>
          )}

          {category !== "work" && (
            <div>
              <Label>Title</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={category === "vacation" ? "Trip name…" : "Title"} className="mt-1.5 h-11 rounded-xl" />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Start</Label>
              <Input type="time" value={start} onChange={(e) => setStart(e.target.value)} className="mt-1.5 h-11 rounded-xl" />
            </div>
            <div>
              <Label>End</Label>
              <Input type="time" value={end} onChange={(e) => setEnd(e.target.value)} className="mt-1.5 h-11 rounded-xl" />
            </div>
          </div>

          <div>
            <Label className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />Location</Label>
            <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Worksite, address…" className="mt-1.5 h-11 rounded-xl" />
          </div>

          <div>
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="mt-1.5 rounded-xl" rows={2} />
          </div>

          <div className="flex gap-2 pt-1">
            <Button onClick={save} disabled={saving} className="flex-1 h-11 rounded-xl">
              {saving ? "Saving…" : existing ? "Update" : "Add"}
            </Button>
            {existing && (
              <Button variant="outline" onClick={remove} className="h-11 rounded-xl">
                <Trash2 className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ShareDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [scope, setScope] = useState<"year" | "month" | "range">("month");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-3xl max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl">Share calendar</DialogTitle>
          <p className="text-xs text-muted-foreground">Send your schedule to a colleague.</p>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>What to share</Label>
            <Select value={scope} onValueChange={(v) => setScope(v as typeof scope)}>
              <SelectTrigger className="mt-1.5 h-11 rounded-xl"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="year">Entire year</SelectItem>
                <SelectItem value="month">Current month</SelectItem>
                <SelectItem value="range">Specific dates</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button
            className="w-full h-11 rounded-xl"
            onClick={() => {
              toast.success("Pick a colleague in the Colleagues tab to share with.");
              onOpenChange(false);
            }}
          >
            Choose colleague →
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
