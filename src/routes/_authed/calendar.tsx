import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay,
  startOfWeek, endOfWeek, addMonths, subMonths, isSameMonth,
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
        .eq("user_id", user!.id).gte("date", monthStart).lte("date", monthEnd);
      return (data ?? []) as Shift[];
    },
    enabled: !!user,
  });

  const days = eachDayOfInterval({
    start: startOfWeek(startOfMonth(month), { weekStartsOn: 0 }),
    end: endOfWeek(endOfMonth(month), { weekStartsOn: 0 }),
  });

  const shiftMap = new Map<string, Shift>();
  for (const s of shifts) shiftMap.set(s.date, s);

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
      <header className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Schedule</p>
          <h1 className="font-serif text-3xl mt-1">{format(month, "MMMM yyyy")}</h1>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setMonth(subMonths(month, 1))} className="w-9 h-9 rounded-full bg-card border border-border flex items-center justify-center"><ChevronLeft className="w-4 h-4" /></button>
          <button onClick={() => setMonth(addMonths(month, 1))} className="w-9 h-9 rounded-full bg-card border border-border flex items-center justify-center"><ChevronRight className="w-4 h-4" /></button>
        </div>
      </header>

      <div className="soft-card p-3">
        <div className="grid grid-cols-7 gap-1 mb-2">
          {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
            <div key={i} className="text-center text-[11px] text-muted-foreground font-medium">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {days.map((d) => {
            const key = format(d, "yyyy-MM-dd");
            const s = shiftMap.get(key);
            const inMonth = isSameMonth(d, month);
            const isToday = isSameDay(d, new Date());
            const isSelected = s && selectedIds.has(s.id);
            const bg = s
              ? s.type === "Night" ? "bg-night-shift text-white" : "bg-day-shift text-foreground"
              : "bg-transparent";
            return (
              <button key={key} onClick={() => tapDay(d)}
                className={`aspect-square rounded-xl flex flex-col items-center justify-center text-sm transition-all ${bg} ${
                  !inMonth ? "opacity-30" : ""
                } ${isToday ? "ring-2 ring-primary ring-offset-2 ring-offset-card" : ""} ${
                  isSelected ? "ring-2 ring-destructive" : ""
                }`}>
                <span className={`${s ? "font-semibold" : ""}`}>{format(d, "d")}</span>
                {s && <span className="text-[9px] opacity-80 mt-0.5">{s.start_time.slice(0,5)}</span>}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex gap-2">
        {!editMode ? (
          <>
            <Button onClick={() => setSelected(new Date())} className="flex-1 h-12 rounded-2xl"><Plus className="w-4 h-4 mr-1" />Add shift</Button>
            <Button variant="outline" onClick={() => setEditMode(true)} className="h-12 rounded-2xl">Edit</Button>
          </>
        ) : (
          <>
            <Button variant="destructive" onClick={deleteSelected} disabled={selectedIds.size === 0} className="flex-1 h-12 rounded-2xl">
              <Trash2 className="w-4 h-4 mr-1" />Delete {selectedIds.size > 0 ? `(${selectedIds.size})` : "selected"}
            </Button>
            <Button variant="outline" onClick={() => { setEditMode(false); setSelectedIds(new Set()); }} className="h-12 rounded-2xl">Done</Button>
          </>
        )}
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
  const [start, setStart] = useState(existing?.start_time?.slice(0,5) ?? "07:00");
  const [end, setEnd] = useState(existing?.end_time?.slice(0,5) ?? "19:00");
  const [type, setType] = useState(existing?.type ?? "Day");
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [saving, setSaving] = useState(false);

  // Reset when date/existing changes
  useState(() => {
    setStart(existing?.start_time?.slice(0,5) ?? "07:00");
    setEnd(existing?.end_time?.slice(0,5) ?? "19:00");
    setType(existing?.type ?? "Day");
    setNotes(existing?.notes ?? "");
  });

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

  return (
    <Dialog open={!!date} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="rounded-3xl max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl">
            {date && format(date, "EEE, MMM d")}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
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
            <Label>Shift type</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger className="mt-1.5 h-11 rounded-xl"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Day">Day</SelectItem>
                <SelectItem value="Night">Night</SelectItem>
                <SelectItem value="Custom">Custom</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="mt-1.5 rounded-xl" rows={2} />
          </div>
          <div className="flex gap-2 pt-2">
            <Button onClick={save} disabled={saving} className="flex-1 h-11 rounded-xl">{saving ? "Saving…" : "Save"}</Button>
            {existing && <Button variant="outline" onClick={remove} className="h-11 rounded-xl"><Trash2 className="w-4 h-4" /></Button>}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
