import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { LogOut, Plus, Check, Camera, Loader2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authed/profile")({ component: ProfilePage });

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
  useEffect(() => {
    if (profile) {
      setName(profile.full_name ?? "");
      setRate(String(profile.hourly_rate ?? "35"));
    }
  }, [profile]);

  const [addProfOpen, setAddProfOpen] = useState(false);
  const [addWorkOpen, setAddWorkOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    if (file.size > 5 * 1024 * 1024) return toast.error("Image must be under 5MB");
    if (!file.type.startsWith("image/")) return toast.error("Please select an image");

    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${user.id}/avatar-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("avatars").upload(path, file, {
        cacheControl: "3600",
        upsert: true,
      });
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

  async function saveBasics() {
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
    qc.invalidateQueries({ queryKey: ["profile"] });
    toast.success("Profession set");
  }
  async function setWorkplace(id: string) {
    await supabase.from("profiles").update({ workplace_id: id }).eq("id", user!.id);
    qc.invalidateQueries({ queryKey: ["profile-full"] });
    qc.invalidateQueries({ queryKey: ["profile"] });
    toast.success("Workplace set");
  }

  return (
    <div className="space-y-5">
      <header>
        <p className="text-xs uppercase tracking-widest text-muted-foreground">Account</p>
        <h1 className="font-serif text-3xl mt-1">Profile</h1>
        <p className="text-sm text-muted-foreground mt-1">{user?.email}</p>
      </header>

      <section className="soft-card p-5 space-y-3">
        <div>
          <Label>Name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} className="mt-1.5 h-11 rounded-xl" />
        </div>
        <div>
          <Label>Hourly rate ($)</Label>
          <Input type="number" step="0.01" value={rate} onChange={(e) => setRate(e.target.value)} className="mt-1.5 h-11 rounded-xl" />
        </div>
        <Button onClick={saveBasics} className="w-full h-11 rounded-xl">Save</Button>
      </section>

      <section className="soft-card p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-medium">Profession</h2>
          <Button size="sm" variant="ghost" onClick={() => setAddProfOpen(true)} className="rounded-full"><Plus className="w-4 h-4 mr-1" />Add</Button>
        </div>
        <div className="flex flex-wrap gap-2">
          {professions.map((p) => {
            const active = profile?.profession_id === p.id;
            return (
              <button key={p.id} onClick={() => setProfession(p.id)}
                className={`px-3.5 py-1.5 rounded-full text-sm border transition-colors ${
                  active ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border text-foreground"
                }`}>
                {active && <Check className="w-3 h-3 inline mr-1" />}{p.name}
              </button>
            );
          })}
        </div>
      </section>

      <section className="soft-card p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-medium">Workplace</h2>
          <Button size="sm" variant="ghost" onClick={() => setAddWorkOpen(true)} className="rounded-full"><Plus className="w-4 h-4 mr-1" />Add</Button>
        </div>
        <div className="space-y-2">
          {workplaces.length === 0 && <p className="text-sm text-muted-foreground">No workplaces yet. Add one.</p>}
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

      <Button onClick={signOut} variant="outline" className="w-full h-12 rounded-2xl">
        <LogOut className="w-4 h-4 mr-1.5" />Sign out
      </Button>

      <AddDialog kind="profession" open={addProfOpen} onClose={() => setAddProfOpen(false)} />
      <AddDialog kind="workplace" open={addWorkOpen} onClose={() => setAddWorkOpen(false)} />
    </div>
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
