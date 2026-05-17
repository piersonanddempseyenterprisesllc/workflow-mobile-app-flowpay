import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowUpRight, ArrowDownLeft, Send, HandCoins, Building2 } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

export const Route = createFileRoute("/_authed/flowpay")({ component: FlowPayPage });

function FlowPayPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [sendOpen, setSendOpen] = useState(false);
  const [requestOpen, setRequestOpen] = useState(false);

  const { data: wallet } = useQuery({
    queryKey: ["wallet", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("wallets").select("balance").eq("user_id", user!.id).maybeSingle();
      return data;
    },
    enabled: !!user,
  });

  const { data: txns = [] } = useQuery({
    queryKey: ["transactions", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("transactions")
        .select("*, sender:profiles!transactions_sender_profiles_fkey(id, full_name), receiver:profiles!transactions_receiver_profiles_fkey(id, full_name)")
        .or(`sender_id.eq.${user!.id},receiver_id.eq.${user!.id}`)
        .order("created_at", { ascending: false }).limit(50);
      return data ?? [];
    },
    enabled: !!user,
  });

  const { data: requests = [] } = useQuery({
    queryKey: ["requests", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("payment_requests")
        .select("*, requester:profiles!payment_requests_requester_profiles_fkey(id, full_name)")
        .eq("receiver_id", user!.id).eq("status", "pending");
      return data ?? [];
    },
    enabled: !!user,
  });

  async function acceptRequest(id: string, requesterId: string, amount: number) {
    const { error } = await supabase.rpc("send_money", { p_receiver: requesterId, p_amount: amount, p_note: "Request" });
    if (error) return toast.error(error.message);
    await supabase.from("payment_requests").update({ status: "paid" }).eq("id", id);
    toast.success("Payment sent");
    qc.invalidateQueries({ queryKey: ["wallet"] });
    qc.invalidateQueries({ queryKey: ["transactions"] });
    qc.invalidateQueries({ queryKey: ["requests"] });
  }

  async function declineRequest(id: string) {
    await supabase.from("payment_requests").update({ status: "declined" }).eq("id", id);
    qc.invalidateQueries({ queryKey: ["requests"] });
  }

  return (
    <div className="space-y-5">
      <header>
        <p className="text-xs uppercase tracking-widest text-muted-foreground">FlowPay</p>
        <h1 className="font-serif text-3xl mt-1">Wallet</h1>
      </header>

      <section className="soft-card p-6 bg-gradient-to-br from-gold/40 to-gold/10 border border-gold/30">
        <div className="text-xs uppercase tracking-widest text-gold-foreground/70">Balance</div>
        <div className="font-serif text-5xl mt-2">${Number(wallet?.balance ?? 0).toFixed(2)}</div>
        <div className="text-xs text-muted-foreground mt-1">Available to send</div>

        <div className="grid grid-cols-2 gap-2 mt-5">
          <Button onClick={() => setSendOpen(true)} className="h-12 rounded-2xl"><Send className="w-4 h-4 mr-1.5" />Send</Button>
          <Button onClick={() => setRequestOpen(true)} variant="outline" className="h-12 rounded-2xl bg-card"><HandCoins className="w-4 h-4 mr-1.5" />Request</Button>
        </div>
      </section>

      {requests.length > 0 && (
        <section>
          <h2 className="text-xs uppercase tracking-widest text-muted-foreground mb-2">Pending requests</h2>
          <div className="space-y-2">
            {requests.map((r) => {
              const req = r.requester as { id: string; full_name: string | null } | null;
              return (
                <div key={r.id} className="soft-card p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <div className="font-medium">{req?.full_name || "Unknown"}</div>
                      <div className="text-xs text-muted-foreground">requests ${Number(r.amount).toFixed(2)}</div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => req && acceptRequest(r.id, req.id, Number(r.amount))} className="flex-1 rounded-xl">Pay</Button>
                    <Button size="sm" variant="outline" onClick={() => declineRequest(r.id)} className="flex-1 rounded-xl">Decline</Button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section>
        <h2 className="text-xs uppercase tracking-widest text-muted-foreground mb-2">Activity</h2>
        <div className="space-y-2">
          {txns.length === 0 && <p className="text-sm text-muted-foreground">No transactions yet.</p>}
          {txns.map((t) => {
            const sent = t.sender_id === user!.id;
            const other = (sent ? t.receiver : t.sender) as { full_name: string | null } | null;
            return (
              <div key={t.id} className="soft-card px-4 py-3 flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${sent ? "bg-secondary" : "bg-accent"}`}>
                  {sent ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownLeft className="w-4 h-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">{sent ? "To " : "From "}{other?.full_name || "—"}</div>
                  <div className="text-xs text-muted-foreground">{format(new Date(t.created_at), "MMM d, h:mm a")}</div>
                </div>
                <div className={`font-serif text-lg ${sent ? "text-foreground" : "text-primary"}`}>
                  {sent ? "−" : "+"}${Number(t.amount).toFixed(2)}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="soft-card p-4 border border-dashed border-border bg-muted/40">
        <div className="flex items-center gap-3">
          <Building2 className="w-5 h-5 text-muted-foreground" />
          <div className="flex-1">
            <div className="font-medium text-sm">Connect Bank</div>
            <div className="text-xs text-muted-foreground">Coming soon — Plaid & Stripe Connect</div>
          </div>
          <Button size="sm" variant="outline" disabled className="rounded-full">Soon</Button>
        </div>
      </section>

      <MoneyDialog mode="send" open={sendOpen} onClose={() => setSendOpen(false)} />
      <MoneyDialog mode="request" open={requestOpen} onClose={() => setRequestOpen(false)} />
    </div>
  );
}

function MoneyDialog({ mode, open, onClose }: { mode: "send" | "request"; open: boolean; onClose: () => void }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [friendId, setFriendId] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const { data: friends = [] } = useQuery({
    queryKey: ["friends-flowpay", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("friends")
        .select("friend_id, profiles!friends_friend_id_profiles_fkey(id, full_name)")
        .eq("user_id", user!.id).eq("status", "active");
      return data ?? [];
    },
    enabled: !!user && open,
  });

  async function submit() {
    const amt = Number(amount);
    if (!friendId || !amt || amt <= 0) return toast.error("Pick a friend and an amount");
    setBusy(true);
    try {
      if (mode === "send") {
        const { error } = await supabase.rpc("send_money", { p_receiver: friendId, p_amount: amt, p_note: note || null });
        if (error) throw error;
        toast.success("Sent");
      } else {
        const { error } = await supabase.from("payment_requests").insert({
          requester_id: user!.id, receiver_id: friendId, amount: amt, note: note || null, status: "pending",
        });
        if (error) throw error;
        toast.success("Request sent");
      }
      qc.invalidateQueries({ queryKey: ["wallet"] });
      qc.invalidateQueries({ queryKey: ["transactions"] });
      onClose();
      setAmount(""); setNote(""); setFriendId("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally { setBusy(false); }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="rounded-3xl max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl">{mode === "send" ? "Send money" : "Request money"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>To friend</Label>
            <Select value={friendId} onValueChange={setFriendId}>
              <SelectTrigger className="mt-1.5 h-11 rounded-xl"><SelectValue placeholder="Select…" /></SelectTrigger>
              <SelectContent>
                {friends.map((f) => {
                  const p = f.profiles as { id: string; full_name: string | null } | null;
                  if (!p) return null;
                  return <SelectItem key={p.id} value={p.id}>{p.full_name || "Unnamed"}</SelectItem>;
                })}
              </SelectContent>
            </Select>
            {friends.length === 0 && <p className="text-xs text-muted-foreground mt-1">Add friends first in the Friends tab.</p>}
          </div>
          <div>
            <Label>Amount</Label>
            <Input type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00" className="mt-1.5 h-11 rounded-xl text-lg" />
          </div>
          <div>
            <Label>Note (optional)</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} className="mt-1.5 h-11 rounded-xl" />
          </div>
          <Button onClick={submit} disabled={busy} className="w-full h-11 rounded-xl">{busy ? "…" : mode === "send" ? "Send" : "Request"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
