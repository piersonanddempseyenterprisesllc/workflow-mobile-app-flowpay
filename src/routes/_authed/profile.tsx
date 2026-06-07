import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  LogOut, Plus, Check, Camera, Loader2,
  Settings, Users, ShieldCheck, Bell, ChevronRight,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authed/profile")({ component: ProfilePage });

type SheetKey = null | "edit" | "coworkers" | "sharing" | "notifications";

function ProfilePage() {
  const { user, signOut } = useAuth();
  const qc = useQueryClient();

  const { data: profile } = useQuery({
    queryKey: ["profile-full", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("*").eq("id", user!.id).maybeSingle();
      return data;
    },
    enabled: !!user,
  });

  const [openSheet, setOpenSheet] = useState<SheetKey>(null);

  const name = profile?.full_name ?? "";
  const initials = (name || user?.email || "?")
    .split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase();

  return (
    <div className="pb-6">
      <header className="pt-1 pb-5">
        <h1 className="font-serif text-3xl">Profile</h1>
      </header>

      {/* Identity card */}
      <div className="relative overflow-hidden soft-card p-5 flex items-center gap-4">
        <Avatar className="w-16 h-16">
          <AvatarImage src={profile?.avatar_url ?? undefined} />
          <AvatarFallback className="bg-[oklch(0.92_0.06_300)] text-[oklch(0.4_0.15_290)] font-semibold text-lg">
            {initials}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="font-serif text-xl truncate">{name || "Unnamed"}</div>
          <div className="text-sm text-muted-foreground truncate">{user?.email}</div>
        </div>
        <div
          aria-hidden
          className="absolute -right-8 -top-8 w-32 h-32 rounded-full opacity-60"
          style={{ background: "radial-gradient(circle, oklch(0.92 0.06 300), transparent 70%)" }}
        />
      </div>

      {/* Action rows */}
      <div className="mt-4 space-y-3">
        <Row
          icon={Settings}
          tint="oklch(0.92 0.06 300)"
          ink="oklch(0.4 0.15 290)"
          title="Edit Profile"
          subtitle="Photo, profession, workplace"
          onClick={() => setOpenSheet("edit")}
        />
        <Row
          icon={Users}
          tint="oklch(0.92 0.06 300)"
          ink="oklch(0.4 0.15 290)"
          title="Coworkers"
          subtitle="Connect with colleagues"
          to="/social"
        />
        <Row
          icon={ShieldCheck}
          tint="oklch(0.92 0.06 300)"
          ink="oklch(0.4 0.15 290)"
          title="Schedule Sharing"
          subtitle="Control who sees your shifts"
          onClick={() => setOpenSheet("sharing")}
        />
        <Row
          icon={Bell}
          tint="oklch(0.92 0.06 300)"
          ink="oklch(0.4 0.15 290)"
          title="Notifications"
          subtitle="All caught up"
          onClick={() => setOpenSheet("notifications")}
        />
      </div>

      <Button onClick={signOut} variant="outline" className="w-full h-12 rounded-2xl mt-6">
        <LogOut className="w-4 h-4 mr-1.5" />Sign out
      </Button>

      <EditProfileSheet open={openSheet === "edit"} onClose={() => setOpenSheet(null)} />
      <SimpleSheet
        open={openSheet === "sharing"}
        onClose={() => setOpenSheet(null)}
        title="Schedule Sharing"
        body="Coming soon — pick who can see your shifts."
      />
      <SimpleSheet
        open={openSheet === "notifications"}
        onClose={() => setOpenSheet(null)}
        title="Notifications"
        body="You're all caught up."
      />
    </div>
  );
}

function Row({
  icon: Icon, tint, ink, title, subtitle, onClick, to,
}: {
  icon: React.ComponentType<{ className?: string }>;
  tint: string;
  ink: string;
  title: string;
  subtitle: string;
  onClick?: () => void;
  to?: string;
}) {
  const inner = (
    <>
      <div
        className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0"
        style={{ background: tint, color: ink }}
      >
        <Icon className="w-5 h-5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[15px] font-semibold leading-tight">{title}</div>
        <div className="text-xs text-muted-foreground mt-0.5">{subtitle}</div>
      </div>
      <ChevronRight className="w-5 h-5 text-muted-foreground shrink-0" />
    </>
  );
  if (to) {
    return (
      <Link to={to} className="soft-card flex items-center gap-3.5 p-4 active:bg-muted/40 transition-colors">
        {inner}
      </Link>
    );
  }
  return (
    <button onClick={onClick} className="soft-card w-full flex items-center gap-3.5 p-4 text-left active:bg-muted/40 transition-colors">
      {inner}
    </button>
  );
}

function SimpleSheet({ open, onClose, title, body }: { open: boolean; onClose: () => void; title: string; body: string }) {
  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="bottom" className="rounded-t-3xl">
        <SheetHeader>
          <SheetTitle className="font-serif text-2xl">{title}</SheetTitle>
        </SheetHeader>
        <p className="text-sm text-muted-foreground mt-2">{body}</p>
      </SheetContent>
    </Sheet>
  );
}

function EditProfileSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: profile } = useQuery({
    queryKey: ["profile-full", user?.id],
    queryFn: async () => (await supabase.from("profiles").select("*").eq("id", user!.id).maybeSingle()).data,
    enabled: !!user,
  });
  const { data: professions = [] } = useQuery({
    queryKey: ["professions"],
    queryFn: async () => (await supabase.from("professions").select("*").order("name")).data ?? [],
  });
  const { data: workplaces = [] } = useQuery({
    queryKey: ["workplaces"],
    queryFn: async () => (await supabase.from("workplaces").select("*").order("name")).data ?? [],
  });

  const [name, setName] = useState("");
  const [rate, setRate] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [addProfOpen, setAddProfOpen] = useState(false);
  const [addWorkOpen, setAddWorkOpen] = useState(false);

  useEffect(() => {
    if (profile) {
      setName(profile.full_name ?? "");
      setRate(String(profile.hourly_rate ?? "35"));
    }
  }, [profile]);

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    if (file.size > 5 * 1024 * 1024) return toast.error("Image must be under 5MB");
    if (!file.type.startsWith("image/")) return toast.error("Please select an image");
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${user.id}/avatar-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("avatars").upload(path, file, { cacheControl: "3600", upsert: true });
      if (upErr) throw upErr;
      const { data: { publicUrl } } = supabase.storage.from("avatars").getPublicUrl(path);
      const { error: updErr } = await supabase.from("profiles").update({ avatar_url: publicUrl }).eq("id", user.id);
      if (updErr) throw updErr;
      toast.success("Profile photo updated");
      qc.invalidateQueries({ queryKey: ["profile-full"] });
      qc.invalidateQueries({ queryKey: ["profile"] });
    } catch (err: any) {
      toast.error(err.message || "Upload failed");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function save() {
    const { error } = await supabase.from("profiles").update({
      full_name: name, hourly_rate: Number(rate) || 0,
    }).eq("id", user!.id);
    if (error) return toast.error(error.message);
    toast.success("Saved");
    qc.invalidateQueries({ queryKey: ["profile-full"] });
    qc.invalidateQueries({ queryKey: ["profile"] });
  }

  async function setProfession(id: string) {
    await supabase.from("profiles").update({ profession_id: id }).eq("id", user!.id);
    qc.invalidateQueries({ queryKey: ["profile-full"] });
  }
  async function setWorkplace(id: string) {
    await supabase.from("profiles").update({ workplace_id: id }).eq("id", user!.id);
    qc.invalidateQueries({ queryKey: ["profile-full"] });
  }

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="bottom" className="rounded-t-3xl max-h-[90vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="font-serif text-2xl">Edit Profile</SheetTitle>
        </SheetHeader>
        <div className="space-y-5 mt-4">
          <div className="flex flex-col items-center">
            <div className="relative">
              <Avatar className="w-20 h-20">
                <AvatarImage src={profile?.avatar_url ?? undefined} />
                <AvatarFallback className="text-xl font-serif">
                  {(name || "?").charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-md"
              >
                {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
              </button>
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
            </div>
          </div>

          <div>
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="mt-1.5 h-11 rounded-xl" />
          </div>
          <div>
            <Label>Hourly rate ($)</Label>
            <Input type="number" step="0.01" value={rate} onChange={(e) => setRate(e.target.value)} className="mt-1.5 h-11 rounded-xl" />
          </div>
          <Button onClick={save} className="w-full h-11 rounded-xl">Save</Button>

          <section>
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-medium">Profession</h3>
              <Button size="sm" variant="ghost" onClick={() => setAddProfOpen(true)} className="rounded-full"><Plus className="w-4 h-4 mr-1" />Add</Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {professions.map((p) => {
                const active = profile?.profession_id === p.id;
                return (
                  <button key={p.id} onClick={() => setProfession(p.id)}
                    className={`px-3.5 py-1.5 rounded-full text-sm border transition-colors ${
                      active ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border"
                    }`}>
                    {active && <Check className="w-3 h-3 inline mr-1" />}{p.name}
                  </button>
                );
              })}
            </div>
          </section>

          <section>
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-medium">Workplace</h3>
              <Button size="sm" variant="ghost" onClick={() => setAddWorkOpen(true)} className="rounded-full"><Plus className="w-4 h-4 mr-1" />Add</Button>
            </div>
            <div className="space-y-2">
              {workplaces.length === 0 && <p className="text-sm text-muted-foreground">No workplaces yet.</p>}
              {workplaces.map((w) => {
                const active = profile?.workplace_id === w.id;
                return (
                  <button key={w.id} onClick={() => setWorkplace(w.id)}
                    className={`w-full text-left px-4 py-3 rounded-xl border transition-colors ${
                      active ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border"
                    }`}>
                    <div className="font-medium text-sm flex items-center gap-1">{active && <Check className="w-3.5 h-3.5" />}{w.name}</div>
                    {w.location && <div className={`text-xs mt-0.5 ${active ? "opacity-80" : "text-muted-foreground"}`}>{w.location}</div>}
                  </button>
                );
              })}
            </div>
          </section>
        </div>

        <AddDialog kind="profession" open={addProfOpen} onClose={() => setAddProfOpen(false)} />
        <AddDialog kind="workplace" open={addWorkOpen} onClose={() => setAddWorkOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}

function AddDialog({ kind, open, onClose }: { kind: "profession" | "workplace"; open: boolean; onClose: () => void }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!name.trim()) return;
    setBusy(true);
    const { error } = kind === "profession"
      ? await supabase.from("professions").insert({ name: name.trim(), created_by: user!.id })
      : await supabase.from("workplaces").insert({ name: name.trim(), location: location.trim() || null, created_by: user!.id });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Added");
    setName(""); setLocation("");
    qc.invalidateQueries({ queryKey: [kind === "profession" ? "professions" : "workplaces"] });
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="rounded-3xl max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl">Add {kind}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="mt-1.5 h-11 rounded-xl" />
          </div>
          {kind === "workplace" && (
            <div>
              <Label>Location (optional)</Label>
              <Input value={location} onChange={(e) => setLocation(e.target.value)} className="mt-1.5 h-11 rounded-xl" />
            </div>
          )}
          <Button onClick={submit} disabled={busy} className="w-full h-11 rounded-xl">{busy ? "…" : "Add"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
