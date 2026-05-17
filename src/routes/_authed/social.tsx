import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, UserPlus, Share2, Ban, X } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authed/social")({ component: SocialPage });

function SocialPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [query, setQuery] = useState("");

  const { data: friends = [] } = useQuery({
    queryKey: ["friends", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("friends")
        .select("friend_id, status, profiles:friend_id(id, full_name, profession_id, professions(name))")
        .eq("user_id", user!.id).eq("status", "active");
      return data ?? [];
    },
    enabled: !!user,
  });

  const { data: sharedWith = [] } = useQuery({
    queryKey: ["sharedWith", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("schedule_access")
        .select("viewer_user_id, profiles:viewer_user_id(id, full_name)")
        .eq("owner_user_id", user!.id);
      return data ?? [];
    },
    enabled: !!user,
  });

  const { data: searchResults = [] } = useQuery({
    queryKey: ["search", query],
    queryFn: async () => {
      if (query.length < 2) return [];
      const { data } = await supabase.from("profiles")
        .select("id, full_name, professions(name)")
        .ilike("full_name", `%${query}%`).neq("id", user!.id).limit(10);
      return data ?? [];
    },
    enabled: !!user && query.length >= 2,
  });

  async function addFriend(friendId: string) {
    const { error } = await supabase.from("friends").upsert({ user_id: user!.id, friend_id: friendId, status: "active" });
    if (error) return toast.error(error.message);
    toast.success("Friend added");
    qc.invalidateQueries({ queryKey: ["friends"] });
  }

  async function shareWith(viewerId: string) {
    const { error } = await supabase.rpc("share_schedule_with", { p_viewer: viewerId });
    if (error) return toast.error(error.message);
    toast.success("Schedule shared");
    qc.invalidateQueries({ queryKey: ["sharedWith"] });
    qc.invalidateQueries({ queryKey: ["friends"] });
  }

  async function unshare(viewerId: string) {
    const { error } = await supabase.from("schedule_access").delete()
      .eq("owner_user_id", user!.id).eq("viewer_user_id", viewerId);
    if (error) return toast.error(error.message);
    toast.success("Access revoked");
    qc.invalidateQueries({ queryKey: ["sharedWith"] });
  }

  async function block(targetId: string) {
    const { error } = await supabase.rpc("block_user", { p_target: targetId });
    if (error) return toast.error(error.message);
    toast.success("Blocked");
    qc.invalidateQueries({ queryKey: ["friends"] });
    qc.invalidateQueries({ queryKey: ["sharedWith"] });
  }

  return (
    <div className="space-y-5">
      <header>
        <p className="text-xs uppercase tracking-widest text-muted-foreground">Coworkers</p>
        <h1 className="font-serif text-3xl mt-1">Connect</h1>
      </header>

      <div className="soft-card p-3 flex items-center gap-2">
        <Search className="w-4 h-4 text-muted-foreground ml-2" />
        <Input placeholder="Search coworkers by name…" value={query} onChange={(e) => setQuery(e.target.value)}
          className="border-0 shadow-none focus-visible:ring-0 px-1 h-10" />
      </div>

      {query.length >= 2 && (
        <section>
          <h2 className="text-xs uppercase tracking-widest text-muted-foreground mb-2">Results</h2>
          <div className="space-y-2">
            {searchResults.length === 0 && <p className="text-sm text-muted-foreground">No matches.</p>}
            {searchResults.map((p) => (
              <Row key={p.id} name={p.full_name || "Unnamed"} sub={(p.professions as { name: string } | null)?.name || ""}>
                <Button size="sm" variant="outline" onClick={() => addFriend(p.id)} className="rounded-full">
                  <UserPlus className="w-3.5 h-3.5 mr-1" />Add
                </Button>
              </Row>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="text-xs uppercase tracking-widest text-muted-foreground mb-2">Your friends ({friends.length})</h2>
        <div className="space-y-2">
          {friends.length === 0 && <p className="text-sm text-muted-foreground">Search above to add coworkers.</p>}
          {friends.map((f) => {
            const p = f.profiles as { id: string; full_name: string | null; professions: { name: string } | null } | null;
            if (!p) return null;
            return (
              <Row key={f.friend_id} name={p.full_name || "Unnamed"} sub={p.professions?.name || ""}>
                <Button size="sm" variant="outline" onClick={() => shareWith(p.id)} className="rounded-full">
                  <Share2 className="w-3.5 h-3.5 mr-1" />Share
                </Button>
                <Button size="sm" variant="ghost" onClick={() => block(p.id)} className="rounded-full text-destructive">
                  <Ban className="w-3.5 h-3.5" />
                </Button>
              </Row>
            );
          })}
        </div>
      </section>

      <section>
        <h2 className="text-xs uppercase tracking-widest text-muted-foreground mb-2">Shared with</h2>
        <div className="space-y-2">
          {sharedWith.length === 0 && <p className="text-sm text-muted-foreground">No one yet.</p>}
          {sharedWith.map((s) => {
            const p = s.profiles as { id: string; full_name: string | null } | null;
            if (!p) return null;
            return (
              <Row key={s.viewer_user_id} name={p.full_name || "Unnamed"} sub="Can view your schedule">
                <Button size="sm" variant="ghost" onClick={() => unshare(p.id)} className="rounded-full text-destructive">
                  <X className="w-3.5 h-3.5 mr-1" />Revoke
                </Button>
              </Row>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function Row({ name, sub, children }: { name: string; sub: string; children: React.ReactNode }) {
  return (
    <div className="soft-card px-4 py-3 flex items-center gap-3">
      <div className="w-10 h-10 rounded-full bg-accent text-accent-foreground flex items-center justify-center font-serif">
        {name.charAt(0).toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-medium truncate">{name}</div>
        {sub && <div className="text-xs text-muted-foreground truncate">{sub}</div>}
      </div>
      <div className="flex gap-1">{children}</div>
    </div>
  );
}
