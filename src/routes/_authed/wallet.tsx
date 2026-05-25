import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ArrowDownLeft, ArrowUpRight, Send, HandCoins, Clock } from "lucide-react";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";

export const Route = createFileRoute("/_authed/wallet")({ component: WalletPage });

type TxRow = {
  id: string;
  sender_id: string;
  receiver_id: string;
  amount: number;
  note: string | null;
  status: string;
  created_at: string;
};

function WalletPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [openSend, setOpenSend] = useState(false);
  const [openRequest, setOpenRequest] = useState(false);

  const { data: wallet } = useQuery({
    queryKey: ["wallet", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("wallets").select("balance").eq("user_id", user!.id).maybeSingle();
      return data;
    },
    enabled: !!user,
  });

  const { data: txs = [] } = useQuery({
    queryKey: ["transactions", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("transactions")
        .select("*")
        .or(`sender_id.eq.${user!.id},receiver_id.eq.${user!.id}`)
        .order("created_at", { ascending: false })
        .limit(20);
      return (data ?? []) as TxRow[];
    },
    enabled: !!user,
  });

  const balance = Number(wallet?.balance ?? 0);

  return (
    <div className="space-y-5 pb-32">
      <header>
        <p className="text-xs uppercase tracking-widest text-muted-foreground">Your money</p>
        <h1 className="font-serif text-3xl mt-1">Wallet</h1>
      </header>

      <section className="soft-card p-6 bg-gradient-to-br from-primary to-[oklch(0.32_0.05_160)] text-primary-foreground">
        <div className="text-xs uppercase tracking-widest opacity-80">Available balance</div>
        <div className="font-serif text-5xl mt-2">${balance.toFixed(2)}</div>
        <div className="text-xs opacity-80 mt-1">Move money between colleagues instantly</div>
      </section>

      <div className="grid grid-cols-2 gap-3">
        <Button onClick={() => setOpenSend(true)} className="h-14 rounded-2xl text-base">
          <Send className="w-4 h-4 mr-2" /> Send
        </Button>
        <Button onClick={() => setOpenRequest(true)} variant="outline" className="h-14 rounded-2xl text-base">
          <HandCoins className="w-4 h-4 mr-2" /> Request
        </Button>
      </div>

      <section className="soft-card p-4">
        <div className="flex items-center gap-2 mb-3">
          <Clock className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-sm font-medium">Recent activity</h2>
        </div>
        <div className="space-y-2">
          {txs.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6">
              No activity yet. Send or request money to get started.
            </p>
          )}
          {txs.map((t) => {
            const outgoing = t.sender_id === user?.id;
            return (
              <div key={t.id} className="flex items-center gap-3 py-2">
                <div className={`w-9 h-9 rounded-full flex items-center justify-center ${outgoing ? "bg-destructive/10 text-destructive" : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"}`}>
                  {outgoing ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownLeft className="w-4 h-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{outgoing ? "Sent" : "Received"}{t.note ? ` · ${t.note}` : ""}</div>
                  <div className="text-xs text-muted-foreground">{format(parseISO(t.created_at), "MMM d, h:mm a")}</div>
                </div>
                <div className={`text-sm font-semibold ${outgoing ? "text-destructive" : "text-emerald-600 dark:text-emerald-400"}`}>
                  {outgoing ? "−" : "+"}${Number(t.amount).toFixed(2)}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <SendDialog open={openSend} onClose={() => { setOpenSend(false); qc.invalidateQueries({ queryKey: ["wallet"] }); qc.invalidateQueries({ queryKey: ["transactions"] }); }} balance={balance} />
      <RequestDialog open={openRequest} onClose={() => setOpenRequest(false)} />
    </div>
  );
}

function FriendPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { user } = useAuth();
  const { data: friends = [] } = useQuery({
    queryKey: ["friends-picker", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("friends")
        .select("friend_id, profiles!friends_friend_id_profiles_fkey(id, full_name)")
        .eq("user_id", user!.id).eq("status", "active");
      return data ?? [];
    },
    enabled: !!user,
  });

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-11 rounded-xl mt-1.5">
        <SelectValue placeholder="Pick a colleague" />
      </SelectTrigger>
      <SelectContent>
        {friends.length === 0 && <div className="px-3 py-2 text-sm text-muted-foreground">No friends yet — add some in Compare.</div>}
        {friends.map((f) => {
          const p = f.profiles as { id: string; full_name: string | null } | null;
          if (!p) return null;
          return <SelectItem key={p.id} value={p.id}>{p.full_name ?? "Unnamed"}</SelectItem>;
        })}
      </SelectContent>
    </Select>
  );
}

function SendDialog({ open, onClose, balance }: { open: boolean; onClose: () => void; balance: number }) {
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    const n = Number(amount);
    if (!to) return toast.error("Pick a colleague");
    if (!n || n <= 0) return toast.error("Enter an amount");
    if (n > balance) return toast.error("Insufficient balance");
    setBusy(true);
    const { error } = await supabase.rpc("send_money", { p_receiver: to, p_amount: n, p_note: note || null });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(`Sent $${n.toFixed(2)}`);
    setTo(""); setAmount(""); setNote("");
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="rounded-3xl max-w-sm">
        <DialogHeader><DialogTitle className="font-serif text-2xl">Send money</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>To</Label><FriendPicker value={to} onChange={setTo} /></div>
          <div><Label>Amount ($)</Label><Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="mt-1.5 h-11 rounded-xl" /></div>
          <div><Label>Note (optional)</Label><Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={80} className="mt-1.5 h-11 rounded-xl" /></div>
          <Button onClick={submit} disabled={busy} className="w-full h-11 rounded-xl">{busy ? "Sending…" : `Send $${amount || "0"}`}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function RequestDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user } = useAuth();
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    const n = Number(amount);
    if (!to) return toast.error("Pick a colleague");
    if (!n || n <= 0) return toast.error("Enter an amount");
    setBusy(true);
    const { error } = await supabase.from("payment_requests").insert({
      requester_id: user!.id, receiver_id: to, amount: n, note: note || null,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Request sent");
    setTo(""); setAmount(""); setNote("");
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="rounded-3xl max-w-sm">
        <DialogHeader><DialogTitle className="font-serif text-2xl">Request money</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>From</Label><FriendPicker value={to} onChange={setTo} /></div>
          <div><Label>Amount ($)</Label><Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="mt-1.5 h-11 rounded-xl" /></div>
          <div><Label>What for? (optional)</Label><Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={80} className="mt-1.5 h-11 rounded-xl" /></div>
          <Button onClick={submit} disabled={busy} className="w-full h-11 rounded-xl">{busy ? "Sending…" : "Send request"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
