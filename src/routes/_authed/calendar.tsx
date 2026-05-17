import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay,
  startOfWeek, endOfWeek, addMonths, subMonths, isSameMonth, parseISO,
} from "date-fns";
import { ChevronLeft, ChevronRight, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

export const Route = createFileRoute("/_authed/calendar")({ component: CalendarPage });

type Shift = { id: string; user_id: string; date: string; start_time: string; end_time: string; type: string; notes: string | null };

const SHIFT_TYPES = ["Day", "Night", "Evening", "On-call", "Off"] as const;
type ShiftType = typeof SHIFT_TYPES[number];

const SHIFT_META: Record<string, { code: string; bg: string; dot: string; label: string }> = {
  Day:       { code: "D",  bg: "bg-day-shift",     dot: "bg-day-shift",     label: "Day" },
  Night:     { code: "N",  bg: "bg-night-shift",   dot: "bg-night-shift",   label: "Night" },
  Evening:   { code: "E",  bg: "bg-evening-shift", dot: "bg-evening-shift", label: "Evening" },
  "On-call": { code: "OC", bg: "bg-oncall-shift",  dot: "bg-oncall-shift",  label: "On-call" },
  Off:       { code: "O",  bg: "bg-off-shift",     dot: "bg-off-shift",     label: "Off" },
};

function meta(type: string) {
  return SHIFT_META[type] ?? { code: type.slice(0,1).toUpperCase(), bg: "bg-primary", dot: "bg-primary", label: type };
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
  const [month, setMonth] = useState(new Date());
  const [selected, setSelected] = useState<Date | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const monthStart = format(startOfMonth(month), "yyyy-MM-dd");
  const monthEnd = format(endOfMonth(month), "yyyy-MM-dd");

  const { data: shifts = [] } = useQuery({
    queryKey: ["shifts", user?.id, monthStart],
    queryFn: async () => {
      const { data } = await supabase.from("shifts").select("*")
        .eq("user_id", user!.id).gte("date", monthStart).lte("date", monthEnd).order("date");
      return (data ?? []) as Shift[];
    },
    enabled: !!user,
  });

  const days = eachDayOfInterval({
    start: startOfWeek(startOfMonth(month), { weekStartsOn: 0 }),
    end: endOfWeek(endOfMonth(month), { weekStartsOn: 0 }),
  });

  const shiftMap = useMemo(() => {
    const m = new Map<string, Shift>();
    for (const s of shifts) m.set(s.date, s);
    return m;
  }, [shifts]);

  const todayKey = format(new Date(), "yyyy-MM-dd");
  const upcoming = shifts.filter((s) => s.date >= todayKey).slice(0, 8);
  const workedHours = shifts
    .filter((s) => s.type !== "Off")
    .reduce((sum, s) => sum + shiftHours(s.start_time, s.end_time), 0);
  const workedShifts = shifts.filter((s) => s.type !== "Off").length;

  function tapDay(d: Date) {
    const key = format(d, "yyyy-MM-dd");
    const s = shiftMap.get(key);
    if (editMode) {
      if (!s) return;
      const next = new Set(selectedIds);
      next.has(s.id) ? next.delete(s.id) : next.add(s.id);
      setSelectedIds(next);
    } else {
      setSelected(d);
    }
  }

  async function deleteSelected() {
    if (selectedIds.size === 0) return;
    const { error } = await supabase.from("shifts").delete().in("id", Array.from(selectedIds));
    if (error) return toast.error(error.message);
    toast.success(`Deleted ${selectedIds.size} shift${selectedIds.size > 1 ? "s" : ""}`);
    setSelectedIds(new Set());
    setEditMode(false);
    qc.invalidateQueries({ queryKey: ["shifts"] });
    qc.invalidateQueries({ queryKey: ["week-shifts"] });
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <header className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Schedule</p>
          <h1 className="font-serif text-3xl mt-1">{format(month, "MMMM yyyy")}</h1>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setMonth(new Date())}
            className="px-3 h-9 rounded-full bg-card border border-border text-xs font-medium hover:bg-muted/60 transition-colors"
          >
            Today
          </button>
          <button onClick={() => setMonth(subMonths(month, 1))} className="w-9 h-9 rounded-full bg-card border border-border flex items-center justify-center hover:bg-muted/60 transition-colors">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button onClick={() => setMonth(addMonths(month, 1))} className="w-9 h-9 rounded-full bg-card border border-border flex items-center justify-center hover:bg-muted/60 transition-colors">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Calendar grid */}
      <div className="soft-card p-3">
        <div className="grid grid-cols-7 mb-1">
          {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
            <div key={i} className="text-center text-[11px] text-muted-foreground font-medium tracking-wide py-1.5">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {days.map((d) => {
            const key = format(d, "yyyy-MM-dd");
            const s = shiftMap.get(key);
            const inMonth = isSameMonth(d, month);
            const isToday = isSameDay(d, new Date());
            const isSelected = !!s && selectedIds.has(s.id);
            const m = s ? meta(s.type) : null;
            return (
              <button
                key={key}
                onClick={() => tapDay(d)}
                className={`relative aspect-[3/4] rounded-xl overflow-hidden flex flex-col items-stretch text-left transition-all border ${
                  inMonth ? "border-border/50 bg-card" : "border-transparent bg-transparent opacity-40"
                } ${isSelected ? "ring-2 ring-destructive ring-offset-1 ring-offset-card" : ""} ${
                  isToday ? "ring-2 ring-primary ring-offset-1 ring-offset-card" : ""
                }`}
              >
                <div className="flex items-center justify-between px-1.5 pt-1">
                  <span className={`text-[11px] font-semibold ${isToday ? "text-primary" : "text-foreground"}`}>{format(d, "d")}</span>
                </div>
                {m && (
                  <div className={`mt-auto mx-1 mb-1 rounded-lg ${m.bg} flex flex-col items-center justify-center py-1`}>
                    <span className={`text-[11px] font-bold ${s!.type === "Night" || s!.type === "On-call" ? "text-white" : "text-foreground"}`}>{m.code}</span>
                    <span className={`text-[8px] leading-none mt-0.5 opacity-80 ${s!.type === "Night" || s!.type === "On-call" ? "text-white" : "text-foreground"}`}>
                      {s!.start_time.slice(0,5)}
                    </span>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Month totals */}
      <div className="grid grid-cols-2 gap-3">
        <div className="soft-card p-3 text-center">
          <div className="text-xs text-muted-foreground uppercase tracking-wide">Shifts</div>
          <div className="font-serif text-2xl mt-1">{workedShifts}</div>
        </div>
        <div className="soft-card p-3 text-center">
          <div className="text-xs text-muted-foreground uppercase tracking-wide">Hours</div>
          <div className="font-serif text-2xl mt-1">{workedHours.toFixed(1)}</div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        {!editMode ? (
          <>
            <Button onClick={() => setSelected(new Date())} className="flex-1 h-12 rounded-2xl">
              <Plus className="w-4 h-4 mr-1" />Add shift
            </Button>
            <Button variant="outline" onClick={() => setEditMode(true)} className="h-12 rounded-2xl px-5">Edit</Button>
          </>
        ) : (
          <>
            <Button variant="destructive" onClick={deleteSelected} disabled={selectedIds.size === 0} className="flex-1 h-12 rounded-2xl">
              <Trash2 className="w-4 h-4 mr-1" />Delete {selectedIds.size > 0 ? `(${selectedIds.size})` : "selected"}
            </Button>
            <Button variant="outline" onClick={() => { setEditMode(false); setSelectedIds(new Set()); }} className="h-12 rounded-2xl px-5">Done</Button>
          </>
        )}
      </div>

      {/* Upcoming shifts list */}
      <section>
        <div className="flex items-center justify-between mb-2 px-1">
          <h2 className="font-serif text-lg">Upcoming</h2>
          <span className="text-xs text-muted-foreground">{upcoming.length} shift{upcoming.length === 1 ? "" : "s"}</span>
        </div>
        <div className="soft-card divide-y divide-border/60 overflow-hidden">
          {upcoming.length === 0 && (
            <div className="p-6 text-center text-sm text-muted-foreground">
              No upcoming shifts. Tap a day to add one.
            </div>
          )}
          {upcoming.map((s) => {
            const m = meta(s.type);
            const date = parseISO(s.date);
            const hrs = shiftHours(s.start_time, s.end_time);
            return (
              <button
                key={s.id}
                onClick={() => setSelected(date)}
                className="w-full flex items-center gap-3 p-3 hover:bg-muted/40 transition-colors text-left"
              >
                <div className="flex flex-col items-center justify-center w-12 shrink-0">
                  <span className="text-[10px] uppercase text-muted-foreground tracking-wide">{format(date, "EEE")}</span>
                  <span className="font-serif text-xl leading-none mt-0.5">{format(date, "d")}</span>
                </div>
                <div className={`w-1 h-10 rounded-full ${m.bg}`} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">{m.label}</div>
                  <div className="text-xs text-muted-foreground">
                    {s.start_time.slice(0,5)} – {s.end_time.slice(0,5)} · {hrs.toFixed(1)}h
                  </div>
                </div>
                {s.notes && <div className="text-[10px] text-muted-foreground max-w-[80px] truncate">{s.notes}</div>}
              </button>
            );
          })}
        </div>
      </section>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 px-1 pb-2">
        {SHIFT_TYPES.map((t) => {
          const m = meta(t);
          return (
            <div key={t} className="flex items-center gap-1.5">
              <span className={`w-2.5 h-2.5 rounded-full ${m.dot}`} />
              <span className="text-[11px] text-muted-foreground">{m.label}</span>
            </div>
          );
        })}
      </div>

      <ShiftDialog
        date={selected}
        existing={selected ? shiftMap.get(format(selected, "yyyy-MM-dd")) ?? null : null}
        onClose={() => setSelected(null)}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ["shifts"] });
          qc.invalidateQueries({ queryKey: ["week-shifts"] });
        }}
      />
    </div>
  );
}

function ShiftDialog({ date, existing, onClose, onSaved }: { date: Date | null; existing: Shift | null; onClose: () => void; onSaved: () => void }) {
  const { user } = useAuth();
  const [start, setStart] = useState("07:00");
  const [end, setEnd] = useState("19:00");
  const [type, setType] = useState<string>("Day");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!date) return;
    setStart(existing?.start_time?.slice(0,5) ?? "07:00");
    setEnd(existing?.end_time?.slice(0,5) ?? "19:00");
    setType(existing?.type ?? "Day");
    setNotes(existing?.notes ?? "");
  }, [date, existing]);

  async function save() {
    if (!date) return;
    setSaving(true);
    const payload = {
      user_id: user!.id,
      date: format(date, "yyyy-MM-dd"),
      start_time: start, end_time: end, type, notes: notes || null,
    };
    const { error } = existing
      ? await supabase.from("shifts").update(payload).eq("id", existing.id)
      : await supabase.from("shifts").insert(payload);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(existing ? "Shift updated" : "Shift added");
    onSaved();
    onClose();
  }

  async function remove() {
    if (!existing) return;
    const { error } = await supabase.from("shifts").delete().eq("id", existing.id);
    if (error) return toast.error(error.message);
    toast.success("Shift removed");
    onSaved();
    onClose();
  }

  function applyPreset(t: ShiftType) {
    setType(t);
    if (t === "Day") { setStart("07:00"); setEnd("19:00"); }
    else if (t === "Night") { setStart("19:00"); setEnd("07:00"); }
    else if (t === "Evening") { setStart("15:00"); setEnd("23:00"); }
    else if (t === "On-call") { setStart("08:00"); setEnd("20:00"); }
    else if (t === "Off") { setStart("00:00"); setEnd("00:00"); }
  }

  return (
    <Dialog open={!!date} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="rounded-3xl max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl">
            {date && format(date, "EEEE, MMM d")}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* Quick presets */}
          <div className="flex flex-wrap gap-1.5">
            {SHIFT_TYPES.map((t) => {
              const m = meta(t);
              const active = type === t;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => applyPreset(t)}
                  className={`px-3 h-8 rounded-full text-xs font-medium border transition-colors flex items-center gap-1.5 ${
                    active ? `${m.bg} border-transparent ${t === "Night" || t === "On-call" ? "text-white" : "text-foreground"}` : "bg-card border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full ${active ? "bg-white/70" : m.dot}`} />
                  {m.label}
                </button>
              );
            })}
          </div>

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
            <Label>Type</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger className="mt-1.5 h-11 rounded-xl"><SelectValue /></SelectTrigger>
              <SelectContent>
                {SHIFT_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="mt-1.5 rounded-xl" rows={2} placeholder="Unit, patient ratio, reminders…" />
          </div>

          <div className="flex gap-2 pt-2">
            <Button onClick={save} disabled={saving} className="flex-1 h-11 rounded-xl">
              {saving ? "Saving…" : existing ? "Update" : "Add shift"}
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
