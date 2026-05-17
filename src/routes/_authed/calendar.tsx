import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay,
  startOfWeek, endOfWeek, addMonths, isSameMonth,
} from "date-fns";
import {
  Plus, List, Settings, Bell, Trash2, MapPin, Share2, CheckSquare, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
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

// NurseGrid-style shift library: code + colour + default times.
type ShiftPreset = {
  id: string; code: string; label: string;
  start: string; end: string; bg: string; ink: string;
  category: Category;
};

type ShiftColorOverrides = Record<string, { bg: string; ink: string }>;

const DEFAULT_SHIFT_LIBRARY: ShiftPreset[] = [
  // Work
  { id: "D7",  code: "D",   label: "Day 7a–7p",     start: "07:00", end: "19:00", bg: "#F4C76A", ink: "#3a2a05", category: "work" },
  { id: "D8",  code: "D8",  label: "Day 7a–3p",     start: "07:00", end: "15:00", bg: "#F8DE9B", ink: "#3a2a05", category: "work" },
  { id: "E8",  code: "E",   label: "Evening 3p–11p", start: "15:00", end: "23:00", bg: "#E97A5A", ink: "#fff",    category: "work" },
  { id: "N7",  code: "N",   label: "Night 7p–7a",   start: "19:00", end: "07:00", bg: "#34406B", ink: "#fff",    category: "work" },
  { id: "N8",  code: "N8",  label: "Night 11p–7a",  start: "23:00", end: "07:00", bg: "#1F2647", ink: "#fff",    category: "work" },
  { id: "OC",  code: "OC",  label: "On-call",       start: "08:00", end: "20:00", bg: "#9F6BC4", ink: "#fff",    category: "work" },
  { id: "OFF", code: "OFF", label: "Off",           start: "00:00", end: "00:00", bg: "#D7DBD3", ink: "#384a3a", category: "work" },
  { id: "OT",  code: "OT",  label: "Overtime",      start: "07:00", end: "23:00", bg: "#C44A6C", ink: "#fff",    category: "work" },
  // Vacation
  { id: "PTO", code: "PTO", label: "Paid time off", start: "00:00", end: "00:00", bg: "#7BB5A4", ink: "#fff",    category: "vacation" },
  { id: "VAC", code: "VAC", label: "Vacation",      start: "00:00", end: "00:00", bg: "#5BA3C7", ink: "#fff",    category: "vacation" },
  { id: "SICK",code: "S",   label: "Sick",          start: "00:00", end: "00:00", bg: "#B5C28F", ink: "#2c361f", category: "vacation" },
  { id: "HOL", code: "H",   label: "Holiday",       start: "00:00", end: "00:00", bg: "#E8A87C", ink: "#3b1f10", category: "vacation" },
  // Events
  { id: "EVT", code: "EVT", label: "Event",         start: "18:00", end: "21:00", bg: "#D67BA8", ink: "#fff",    category: "event" },
  { id: "BDAY",code: "BD",  label: "Birthday",      start: "00:00", end: "00:00", bg: "#E8C547", ink: "#3a2a05", category: "event" },
  { id: "MTG", code: "M",   label: "Meeting",       start: "10:00", end: "11:00", bg: "#8E9DCC", ink: "#fff",    category: "event" },
  // Appointments
  { id: "DR",  code: "DR",  label: "Doctor",        start: "09:00", end: "10:00", bg: "#6FB1A8", ink: "#fff",    category: "appointment" },
  { id: "DENT",code: "DT",  label: "Dentist",       start: "09:00", end: "10:00", bg: "#A8C5E6", ink: "#1a2e4a", category: "appointment" },
  { id: "APPT",code: "APT", label: "Appointment",   start: "09:00", end: "10:00", bg: "#B89BC9", ink: "#fff",    category: "appointment" },
];

const DEFAULT_COLORS = new Map(DEFAULT_SHIFT_LIBRARY.map((p) => [p.id, { bg: p.bg, ink: p.ink }]));

function presetFor(s: Shift, library: ShiftPreset[], libById: Map<string, ShiftPreset>): ShiftPreset | null {
  // type column stores either preset id (new) or legacy label
  if (libById.has(s.type)) return libById.get(s.type)!;
  // Legacy fallback by label match within library
  const legacy = library.find((p) => p.label.startsWith(s.type) || p.code === s.type);
  if (legacy) return legacy;
  // Category fallback
  return library.find((p) => p.category === (s.category as Category)) ?? null;
}

function shiftHours(start: string, end: string): number {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  let mins = eh * 60 + em - (sh * 60 + sm);
  if (mins < 0) mins += 24 * 60;
  return mins / 60;
}

function textColorFor(hex: string) {
  const value = hex.replace("#", "");
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.62 ? "#1f2933" : "#ffffff";
}

function CalendarPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [activeCat, setActiveCat] = useState<Category>("work");
  const [selected, setSelected] = useState<Date | null>(null);
  const [openShare, setOpenShare] = useState(false);

  // Multi-select
  const [multiMode, setMultiMode] = useState(false);
  const [selectedDays, setSelectedDays] = useState<Set<string>>(new Set());
  const [pickerOpen, setPickerOpen] = useState(false);
  const [colorOverrides, setColorOverrides] = useState<ShiftColorOverrides>({});

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

  useEffect(() => {
    const saved = window.localStorage.getItem("nurse-grid-shift-colors");
    if (saved) setColorOverrides(JSON.parse(saved) as ShiftColorOverrides);
  }, []);

  const shiftLibrary = useMemo(() => DEFAULT_SHIFT_LIBRARY.map((p) => ({
    ...p,
    bg: colorOverrides[p.id]?.bg ?? p.bg,
    ink: colorOverrides[p.id]?.ink ?? p.ink,
  })), [colorOverrides]);

  const libById = useMemo(() => new Map(shiftLibrary.map((p) => [p.id, p])), [shiftLibrary]);

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

  function onScroll() {
    const el = scrollerRef.current;
    if (!el) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 400) setMonthsForward((n) => n + 3);
    if (el.scrollTop < 200) {
      const prev = el.scrollHeight;
      setMonthsBack((n) => n + 2);
      requestAnimationFrame(() => {
        if (scrollerRef.current) scrollerRef.current.scrollTop += scrollerRef.current.scrollHeight - prev;
      });
    }
  }

  function onDayTap(d: Date) {
    const key = format(d, "yyyy-MM-dd");
    if (multiMode) {
      const next = new Set(selectedDays);
      next.has(key) ? next.delete(key) : next.add(key);
      setSelectedDays(next);
    } else {
      setSelected(d);
    }
  }

  function enterMultiFrom(d?: Date) {
    setMultiMode(true);
    setSelected(null);
    if (d) setSelectedDays(new Set([format(d, "yyyy-MM-dd")]));
  }

  function cancelMulti() {
    setMultiMode(false);
    setSelectedDays(new Set());
    setPickerOpen(false);
  }

  async function applyPresetToSelection(preset: ShiftPreset) {
    if (selectedDays.size === 0 || !user) return;
    const rows = Array.from(selectedDays).map((date) => ({
      user_id: user.id, date,
      start_time: preset.start, end_time: preset.end,
      type: preset.id, category: preset.category,
      title: null, location: null, notes: null,
    }));
    // Upsert: delete existing rows for those dates (same category) then insert
    await supabase.from("shifts").delete()
      .eq("user_id", user.id).eq("category", preset.category)
      .in("date", Array.from(selectedDays));
    const { error } = await supabase.from("shifts").insert(rows);
    if (error) return toast.error(error.message);
    toast.success(`${preset.code} added to ${rows.length} day${rows.length > 1 ? "s" : ""}`);
    cancelMulti();
    if (preset.category !== activeCat) setActiveCat(preset.category);
    qc.invalidateQueries({ queryKey: ["shifts"] });
  }

  async function deleteSelection() {
    if (selectedDays.size === 0 || !user) return;
    const { error } = await supabase.from("shifts").delete()
      .eq("user_id", user.id).eq("category", activeCat)
      .in("date", Array.from(selectedDays));
    if (error) return toast.error(error.message);
    toast.success(`Cleared ${selectedDays.size} day${selectedDays.size > 1 ? "s" : ""}`);
    cancelMulti();
    qc.invalidateQueries({ queryKey: ["shifts"] });
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
        <div className="flex items-center gap-2">
          <button
            onClick={() => (multiMode ? cancelMulti() : enterMultiFrom())}
            className={`h-10 px-3 rounded-full flex items-center gap-1.5 text-sm font-medium transition-colors ${
              multiMode ? "bg-primary text-primary-foreground" : "bg-muted/60 text-foreground hover:bg-muted"
            }`}
            aria-label="Select multiple days"
          >
            <CheckSquare className="w-4 h-4" />
            <span className="hidden sm:inline">{multiMode ? "Done" : "Select days"}</span>
          </button>
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
            onDayTap={onDayTap}
            onDayLongPress={enterMultiFrom}
            onDaySelectToggle={(d) => {
              const k = format(d, "yyyy-MM-dd");
              setSelectedDays((prev) => {
                const next = new Set(prev);
                next.has(k) ? next.delete(k) : next.add(k);
                return next;
              });
            }}
            selectedDays={selectedDays}
            multiMode={multiMode}
          />
        ))}
      </div>

      {/* Multi-select action bar */}
      {multiMode && (
        <div className="fixed bottom-24 inset-x-0 z-50 px-4 pointer-events-none">
          <div className="app-shell !pb-0 !min-h-0">
            <div className="pointer-events-auto rounded-2xl bg-foreground text-background shadow-lg px-3 py-2.5 flex items-center gap-2">
              <button onClick={cancelMulti} className="w-9 h-9 rounded-full hover:bg-white/10 flex items-center justify-center">
                <X className="w-4 h-4" />
              </button>
              <div className="flex-1 text-sm font-medium">
                {selectedDays.size} day{selectedDays.size === 1 ? "" : "s"} selected
              </div>
              <button
                onClick={deleteSelection}
                disabled={selectedDays.size === 0}
                className="px-3 h-9 rounded-full text-xs font-medium hover:bg-white/10 disabled:opacity-40"
              >
                Clear
              </button>
              <button
                onClick={() => setPickerOpen(true)}
                disabled={selectedDays.size === 0}
                className="px-4 h-9 rounded-full bg-background text-foreground text-xs font-semibold disabled:opacity-40"
              >
                Add shift
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Shift picker sheet */}
      <ShiftPickerSheet
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onPick={applyPresetToSelection}
      />

      {/* Single-day dialog */}
      <ShiftDialog
        date={selected}
        category={activeCat}
        existing={selected ? shiftMap.get(format(selected, "yyyy-MM-dd")) ?? null : null}
        onClose={() => setSelected(null)}
        onSaved={() => qc.invalidateQueries({ queryKey: ["shifts"] })}
        onAddToMore={(d) => enterMultiFrom(d)}
      />

      <ShareDialog open={openShare} onOpenChange={setOpenShare} />
    </div>
  );
}

function MonthBlock({
  month, shiftMap, onDayTap, onDayLongPress, onDaySelectToggle, selectedDays, multiMode,
}: {
  month: Date; shiftMap: Map<string, Shift>;
  onDayTap: (d: Date) => void; onDayLongPress: (d: Date) => void;
  onDaySelectToggle: (d: Date) => void;
  selectedDays: Set<string>; multiMode: boolean;
}) {
  const days = eachDayOfInterval({
    start: startOfWeek(startOfMonth(month), { weekStartsOn: 0 }),
    end: endOfWeek(endOfMonth(month), { weekStartsOn: 0 }),
  });
  const pressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressedRef = useRef(false);
  const draggingRef = useRef(false);
  const lastToggledRef = useRef<string | null>(null);

  useEffect(() => {
    const up = () => { draggingRef.current = false; lastToggledRef.current = null; };
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, []);

  return (
    <section className="pt-5 pb-2">
      <div className="px-3 flex items-center justify-between mb-3">
        <h2 className="font-serif text-xl md:text-3xl">{format(month, "MMMM yyyy")}</h2>
        <div className="flex items-center gap-1 text-muted-foreground">
          <button className="w-8 h-8 rounded-lg hover:bg-muted/60 flex items-center justify-center"><List className="w-4 h-4" /></button>
          <button className="w-8 h-8 rounded-lg hover:bg-muted/60 flex items-center justify-center"><Settings className="w-4 h-4" /></button>
          <button className="w-8 h-8 rounded-lg hover:bg-muted/60 flex items-center justify-center"><Bell className="w-4 h-4" /></button>
        </div>
      </div>

      <div className="grid grid-cols-7 px-2 mb-1">
        {["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map((d, i) => (
          <div key={i} className="text-center text-[11px] md:text-xs text-muted-foreground font-medium py-1 uppercase tracking-wider">
            <span className="md:hidden">{d.slice(0, d === "Thursday" ? 2 : d === "Tuesday" ? 2 : d === "Saturday" ? 2 : 1)}</span>
            <span className="hidden md:inline">{d}</span>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 px-2 gap-px bg-border/40">
        {days.map((d) => {
          const key = format(d, "yyyy-MM-dd");
          const s = shiftMap.get(key);
          const inMonth = isSameMonth(d, month);
          const isToday = isSameDay(d, new Date());
          const preset = s ? presetFor(s) : null;
          const isSelected = selectedDays.has(key);

          const startPress = (e: React.PointerEvent) => {
            longPressedRef.current = false;
            if (multiMode) {
              // start drag selection
              draggingRef.current = true;
              lastToggledRef.current = key;
              onDaySelectToggle(d);
              return;
            }
            if (pressTimerRef.current) clearTimeout(pressTimerRef.current);
            pressTimerRef.current = setTimeout(() => {
              longPressedRef.current = true;
              draggingRef.current = true;
              lastToggledRef.current = key;
              onDayLongPress(d);
              pressTimerRef.current = null;
            }, 350);
          };
          const cancelPress = () => {
            if (pressTimerRef.current) { clearTimeout(pressTimerRef.current); pressTimerRef.current = null; }
          };
          const onEnter = () => {
            if (!draggingRef.current) return;
            if (lastToggledRef.current === key) return;
            lastToggledRef.current = key;
            onDaySelectToggle(d);
          };
          const onClick = (e: React.MouseEvent) => {
            if (longPressedRef.current) { e.preventDefault(); longPressedRef.current = false; return; }
            onDayTap(d);
          };

          return (
            <button
              key={key}
              onClick={onClick}
              onPointerDown={startPress}
              onPointerEnter={onEnter}
              onPointerUp={cancelPress}
              onPointerLeave={cancelPress}
              onPointerCancel={cancelPress}
              className={`relative bg-background min-h-[68px] md:min-h-[96px] lg:min-h-[120px] flex flex-col items-center pt-2 pb-1 transition-all touch-manipulation select-none ${
                inMonth ? "" : "opacity-30"
              } ${multiMode && isSelected ? "ring-2 ring-primary ring-inset z-10" : ""}`}
            >
              {s && preset ? (
                <div
                  className="absolute inset-0 flex flex-col items-center justify-center"
                  style={{ backgroundColor: preset.bg, color: preset.ink }}
                >
                  <span className="text-base md:text-xl font-semibold leading-none">{format(d, "d")}</span>
                  <span className="text-[10px] md:text-xs font-bold mt-1 tracking-wide opacity-95">{preset.code}</span>
                </div>
              ) : (
                <span className={`text-base md:text-xl ${isToday ? "font-bold text-primary" : "text-foreground/90"}`}>
                  {format(d, "d")}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}

function ShiftPickerSheet({
  open, onOpenChange, onPick,
}: {
  open: boolean; onOpenChange: (o: boolean) => void;
  onPick: (p: ShiftPreset) => void;
}) {
  const byCat = useMemo(() => {
    const m: Record<Category, ShiftPreset[]> = { work: [], vacation: [], event: [], appointment: [] };
    for (const p of SHIFT_LIBRARY) m[p.category].push(p);
    return m;
  }, []);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-3xl max-h-[80dvh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="font-serif text-2xl text-left">Pick a shift</SheetTitle>
          <p className="text-xs text-muted-foreground text-left">Applies to every selected day.</p>
        </SheetHeader>
        <div className="space-y-5 mt-4 pb-6">
          {CATEGORIES.map((c) => (
            <div key={c.id}>
              <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2 px-1">{c.label}</div>
              <div className="grid grid-cols-3 gap-2">
                {byCat[c.id].map((p) => (
                  <button
                    key={p.id}
                    onClick={() => onPick(p)}
                    className="rounded-2xl p-3 flex flex-col items-center justify-center min-h-[78px] text-center transition-transform active:scale-95 shadow-sm"
                    style={{ backgroundColor: p.bg, color: p.ink }}
                  >
                    <span className="font-bold text-lg leading-none">{p.code}</span>
                    <span className="text-[10px] mt-1.5 opacity-90 leading-tight">{p.label}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function ShiftDialog({
  date, category, existing, onClose, onSaved, onAddToMore,
}: {
  date: Date | null; category: Category; existing: Shift | null;
  onClose: () => void; onSaved: () => void;
  onAddToMore: (d: Date) => void;
}) {
  const { user } = useAuth();
  const [presetId, setPresetId] = useState<string>("");
  const [start, setStart] = useState("07:00");
  const [end, setEnd] = useState("19:00");
  const [title, setTitle] = useState("");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const catPresets = useMemo(() => SHIFT_LIBRARY.filter((p) => p.category === category), [category]);

  useEffect(() => {
    if (!date) return;
    const ex = existing;
    const fallback = catPresets[0];
    const initialPreset = ex && LIB_BY_ID.has(ex.type) ? ex.type : fallback?.id ?? "";
    setPresetId(initialPreset);
    setStart(ex?.start_time?.slice(0, 5) ?? fallback?.start ?? "09:00");
    setEnd(ex?.end_time?.slice(0, 5) ?? fallback?.end ?? "10:00");
    setTitle(ex?.title ?? "");
    setLocation(ex?.location ?? "");
    setNotes(ex?.notes ?? "");
  }, [date, existing, category, catPresets]);

  function applyPreset(p: ShiftPreset) {
    setPresetId(p.id);
    setStart(p.start);
    setEnd(p.end);
  }

  async function save() {
    if (!date) return;
    setSaving(true);
    const preset = LIB_BY_ID.get(presetId);
    const payload = {
      user_id: user!.id,
      date: format(date, "yyyy-MM-dd"),
      start_time: start, end_time: end,
      type: presetId || (preset?.id ?? category),
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

  const hrs = existing ? shiftHours(existing.start_time, existing.end_time) : 0;

  return (
    <Dialog open={!!date} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="rounded-3xl max-w-sm max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl">
            {date && format(date, "EEEE, MMM d")}
          </DialogTitle>
          {existing && (
            <p className="text-xs text-muted-foreground">
              {existing.start_time.slice(0, 5)}–{existing.end_time.slice(0, 5)} · {hrs.toFixed(1)}h
              {existing.location ? ` · ${existing.location}` : ""}
            </p>
          )}
        </DialogHeader>

        <div className="space-y-4">
          {/* Color-coded preset grid */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>Shift</Label>
              <button
                type="button"
                onClick={() => { if (date) { onClose(); setTimeout(() => onAddToMore(date), 50); } }}
                className="text-[11px] text-primary font-medium"
              >
                + Add to more days
              </button>
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {catPresets.map((p) => {
                const active = presetId === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => applyPreset(p)}
                    className={`rounded-xl py-2 flex flex-col items-center transition-all ${active ? "ring-2 ring-foreground ring-offset-1 ring-offset-background scale-[1.02]" : ""}`}
                    style={{ backgroundColor: p.bg, color: p.ink }}
                  >
                    <span className="font-bold text-sm leading-none">{p.code}</span>
                    <span className="text-[9px] mt-1 opacity-90 leading-tight px-1 text-center">{p.label.split(" ")[0]}</span>
                  </button>
                );
              })}
            </div>
          </div>

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
