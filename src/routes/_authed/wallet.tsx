import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { ArrowUpRight, ArrowDownLeft, Plus, Check, X, Loader2, Send, HandCoins, Search, Info } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authed/wallet")({ component: WalletPage });

type Friend = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
};

type Transaction = {
  id: string;
  sender_id: string;
  receiver_id: string;
  amount: number;
  fee: number;
  status: string;
  note: string | null;
  type: string;
  created_at: string;
};

type PaymentRequest = {
  id: string;
  requester_id: string;
  receiver_id: string;
  amount: number;
  status: string;
  note: string | null;
  created_at: string;
};

const FEE_RATE = 0.01;
const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });
const initials = (name?: string | null) =>
  (name ?? "?").split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase();

function WalletPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const uid = user!.id;

  const { data: wallet } = useQuery({
    queryKey: ["wallet", uid],
    queryFn: async () => {
      const { data } = await supabase
        .from("wallets")
        .select("balance")
        .eq("user_id", uid)
        .maybeSingle();
      return data ?? { balance: 0 };
    },
  });

  const { data: friends = [] } = useQuery({
    queryKey: ["wallet-friends", uid],
    queryFn: async (): Promise<Friend[]> => {
      const { data: rows } = await supabase
        .from("friends")
        .select("user_id, friend_id, status")
        .or(`user_id.eq.${uid},friend_id.eq.${uid}`)
        .eq("status", "active");
      if (!rows) return [];
      const otherIds = Array.from(
        new Set(rows.map((r) => (r.user_id === uid ? r.friend_id : r.user_id))),
      );
      if (!otherIds.length) return [];
      const { data: reverse } = await supabase
        .from("friends")
        .select("user_id, friend_id, status")
        .in("user_id", otherIds)
        .eq("friend_id", uid)
        .eq("status", "active");
      const mutualIds = new Set((reverse ?? []).map((r) => r.user_id));
      const finalIds = otherIds.filter((id) => mutualIds.has(id));
      if (!finalIds.length) return [];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, avatar_url")
        .in("id", finalIds);
      return (profiles ?? []) as Friend[];
    },
  });

  const { data: txs = [] } = useQuery({
    queryKey: ["wallet-tx", uid],
    queryFn: async (): Promise<Transaction[]> => {
      const { data } = await supabase
        .from("transactions")
        .select("*")
        .or(`sender_id.eq.${uid},receiver_id.eq.${uid}`)
        .order("created_at", { ascending: false })
        .limit(50);
      return (data ?? []) as Transaction[];
    },
  });

  const { data: requests = [] } = useQuery({
    queryKey: ["wallet-requests", uid],
    queryFn: async (): Promise<PaymentRequest[]> => {
      const { data } = await supabase
        .from("payment_requests")
        .select("*")
        .or(`requester_id.eq.${uid},receiver_id.eq.${uid}`)
        .order("created_at", { ascending: false })
        .limit(50);
      return (data ?? []) as PaymentRequest[];
    },
  });

  const counterpartyIds = useMemo(() => {
    const ids = new Set<string>();
    for (const t of txs) ids.add(t.sender_id === uid ? t.receiver_id : t.sender_id);
    for (const r of requests) ids.add(r.requester_id === uid ? r.receiver_id : r.requester_id);
    return Array.from(ids);
  }, [txs, requests, uid]);

  const { data: counterparties = {} } = useQuery({
    queryKey: ["wallet-counterparties", uid, counterpartyIds.join(",")],
    queryFn: async () => {
      if (!counterpartyIds.length) return {};
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, avatar_url")
        .in("id", counterpartyIds);
      const map: Record<string, Friend> = {};
      for (const p of data ?? []) map[p.id] = p as Friend;
      return map;
    },
    enabled: counterpartyIds.length > 0,
  });

  useEffect(() => {
    const ch = supabase
      .channel(`wallet-${uid}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "wallets", filter: `user_id=eq.${uid}` }, () => {
        qc.invalidateQueries({ queryKey: ["wallet", uid] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "transactions" }, (payload) => {
        const row = (payload.new ?? payload.old) as Transaction | undefined;
        if (row && (row.sender_id === uid || row.receiver_id === uid)) {
          qc.invalidateQueries({ queryKey: ["wallet-tx", uid] });
          qc.invalidateQueries({ queryKey: ["wallet", uid] });
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "payment_requests" }, (payload) => {
        const row = (payload.new ?? payload.old) as PaymentRequest | undefined;
        if (row && (row.requester_id === uid || row.receiver_id === uid)) {
          qc.invalidateQueries({ queryKey: ["wallet-requests", uid] });
        }
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [uid, qc]);

  const [sendOpen, setSendOpen] = useState(false);
  const [requestOpen, setRequestOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  const pendingIncoming = requests.filter((r) => r.status === "pending" && r.receiver_id === uid);
  const pendingOutgoing = requests.filter((r) => r.status === "pending" && r.requester_id === uid);
  const balance = Number(wallet?.balance ?? 0);

  return (
    <div className="pb-6">
      <header className="pt-1 pb-5">
        <h1 className="font-serif text-3xl">Wallet</h1>
        <p className="text-sm text-muted-foreground mt-1">Move money between friends, instantly.</p>
      </header>

      <div
        className="relative overflow-hidden rounded-3xl p-6 text-primary-foreground shadow-[0_20px_50px_-20px_oklch(0.3_0.04_155/0.4)]"
        style={{ background: "linear-gradient(135deg, oklch(0.38 0.045 155) 0%, oklch(0.32 0.05 165) 60%, oklch(0.42 0.08 75) 140%)" }}
      >
        <div className="text-[11px] uppercase tracking-[0.18em] opacity-75">Available balance</div>
        <div className="mt-2 font-serif text-5xl tabular-nums">{money(balance)}</div>
        <div className="mt-1 text-xs opacity-70">USD · Workflow Wallet</div>
        <div
          className="absolute -right-12 -bottom-12 w-48 h-48 rounded-full opacity-15"
          style={{ background: "radial-gradient(circle, oklch(0.95 0.1 75), transparent 70%)" }}
        />
      </div>

      <div className="grid grid-cols-3 gap-2 mt-4">
        <ActionButton icon={Send} label="Send" onClick={() => setSendOpen(true)} />
        <ActionButton icon={HandCoins} label="Request" onClick={() => setRequestOpen(true)} />
        <ActionButton icon={Plus} label="Add money" onClick={() => setAddOpen(true)} />
      </div>

      {pendingIncoming.length > 0 && (
        <section className="mt-6">
          <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground mb-2 px-1">Action needed</h2>
          <div className="space-y-2">
            {pendingIncoming.map((r) => (
              <IncomingRequestRow key={r.id} request={r} who={counterparties[r.requester_id]} balance={balance} />
            ))}
          </div>
        </section>
      )}

      {pendingOutgoing.length > 0 && (
        <section className="mt-6">
          <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground mb-2 px-1">Waiting on them</h2>
          <div className="space-y-2">
            {pendingOutgoing.map((r) => (
              <OutgoingRequestRow key={r.id} request={r} who={counterparties[r.receiver_id]} />
            ))}
          </div>
        </section>
      )}

      <section className="mt-6">
        <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground mb-2 px-1">Activity</h2>
        {txs.length === 0 ? (
          <div className="soft-card p-6 text-center">
            <div className="font-serif text-lg">No activity yet</div>
            <p className="text-sm text-muted-foreground mt-1">Send money to a friend to get started.</p>
          </div>
        ) : (
          <div className="soft-card divide-y divide-border/60">
            {txs.map((t) => (
              <TxRow key={t.id} tx={t} uid={uid} who={counterparties[t.sender_id === uid ? t.receiver_id : t.sender_id]} />
            ))}
          </div>
        )}
      </section>

      <SendDialog
        open={sendOpen}
        onOpenChange={setSendOpen}
        friends={friends}
        balance={balance}
        onSent={() => {
          qc.invalidateQueries({ queryKey: ["wallet", uid] });
          qc.invalidateQueries({ queryKey: ["wallet-tx", uid] });
        }}
      />
      <RequestDialog
        open={requestOpen}
        onOpenChange={setRequestOpen}
        friends={friends}
        uid={uid}
        onCreated={() => qc.invalidateQueries({ queryKey: ["wallet-requests", uid] })}
      />
      <AddMoneyDialog open={addOpen} onOpenChange={setAddOpen} />
    </div>
  );
}

function ActionButton({ icon: Icon, label, onClick }: { icon: React.ElementType; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="soft-card flex flex-col items-center justify-center gap-1.5 py-3.5 active:scale-[0.98] transition-transform"
    >
      <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center">
        <Icon className="w-[18px] h-[18px]" strokeWidth={2} />
      </div>
      <span className="text-xs font-medium">{label}</span>
    </button>
  );
}

function TxRow({ tx, uid, who }: { tx: Transaction; uid: string; who?: Friend }) {
  const incoming = tx.receiver_id === uid;
  const date = new Date(tx.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <Avatar className="w-10 h-10">
        <AvatarImage src={who?.avatar_url ?? undefined} />
        <AvatarFallback className="text-xs">{initials(who?.full_name)}</AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{who?.full_name || "Unknown"}</div>
        <div className="text-xs text-muted-foreground truncate">{tx.note || (incoming ? "Received" : "Sent")} · {date}</div>
      </div>
      <div className="text-right">
        <div className={`text-sm font-semibold tabular-nums ${incoming ? "text-[oklch(0.5_0.13_155)]" : "text-foreground"}`}>
          {incoming ? "+" : "−"}{money(incoming ? Number(tx.amount) - Number(tx.fee) : Number(tx.amount))}
        </div>
        {!incoming && Number(tx.fee) > 0 && (
          <div className="text-[10px] text-muted-foreground">fee {money(Number(tx.fee))}</div>
        )}
      </div>
      <div className={`w-7 h-7 rounded-full flex items-center justify-center ${incoming ? "bg-[oklch(0.92_0.06_155)] text-[oklch(0.4_0.08_155)]" : "bg-muted text-muted-foreground"}`}>
        {incoming ? <ArrowDownLeft className="w-3.5 h-3.5" /> : <ArrowUpRight className="w-3.5 h-3.5" />}
      </div>
    </div>
  );
}

function IncomingRequestRow({ request, who, balance }: { request: PaymentRequest; who?: Friend; balance: number }) {
  const [loading, setLoading] = useState<null | "approve" | "decline">(null);
  const insufficient = balance < Number(request.amount);
  const approve = async () => {
    setLoading("approve");
    const { error } = await supabase.rpc("approve_payment_request", { p_request_id: request.id });
    setLoading(null);
    if (error) toast.error(error.message);
    else toast.success("Payment sent");
  };
  const decline = async () => {
    setLoading("decline");
    const { error } = await supabase.rpc("decline_payment_request", { p_request_id: request.id });
    setLoading(null);
    if (error) toast.error(error.message);
    else toast("Request declined");
  };
  return (
    <div className="soft-card p-4">
      <div className="flex items-center gap-3">
        <Avatar className="w-10 h-10">
          <AvatarImage src={who?.avatar_url ?? undefined} />
          <AvatarFallback className="text-xs">{initials(who?.full_name)}</AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <div className="text-sm">
            <span className="font-medium">{who?.full_name || "Someone"}</span>
            <span className="text-muted-foreground"> requested</span>
          </div>
          {request.note && <div className="text-xs text-muted-foreground truncate mt-0.5">{request.note}</div>}
        </div>
        <div className="font-semibold tabular-nums">{money(Number(request.amount))}</div>
      </div>
      {insufficient && (
        <div className="mt-2 text-[11px] text-destructive flex items-center gap-1">
          <Info className="w-3 h-3" /> Not enough in your wallet
        </div>
      )}
      <div className="flex gap-2 mt-3">
        <Button size="sm" variant="outline" className="flex-1" onClick={decline} disabled={!!loading}>
          {loading === "decline" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><X className="w-3.5 h-3.5 mr-1" />Decline</>}
        </Button>
        <Button size="sm" className="flex-1" onClick={approve} disabled={!!loading || insufficient}>
          {loading === "approve" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><Check className="w-3.5 h-3.5 mr-1" />Pay</>}
        </Button>
      </div>
    </div>
  );
}

function OutgoingRequestRow({ request, who }: { request: PaymentRequest; who?: Friend }) {
  return (
    <div className="soft-card p-3.5 flex items-center gap-3">
      <Avatar className="w-9 h-9">
        <AvatarImage src={who?.avatar_url ?? undefined} />
        <AvatarFallback className="text-xs">{initials(who?.full_name)}</AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{who?.full_name || "Unknown"}</div>
        <div className="text-xs text-muted-foreground truncate">{request.note || "Awaiting response"}</div>
      </div>
      <div className="text-sm font-semibold tabular-nums text-muted-foreground">{money(Number(request.amount))}</div>
    </div>
  );
}

const amountSchema = z.coerce.number().positive().max(10000);

function SendDialog({
  open, onOpenChange, friends, balance, onSent,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  friends: Friend[];
  balance: number;
  onSent: () => void;
}) {
  const [q, setQ] = useState("");
  const [recipient, setRecipient] = useState<Friend | null>(null);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) {
      setQ(""); setRecipient(null); setAmount(""); setNote(""); setLoading(false);
    }
  }, [open]);

  const filtered = useMemo(
    () => friends.filter((f) => (f.full_name ?? "").toLowerCase().includes(q.toLowerCase())),
    [friends, q],
  );

  const numAmount = Number(amount) || 0;
  const fee = Math.round(numAmount * FEE_RATE * 100) / 100;
  const net = Math.max(numAmount - fee, 0);
  const insufficient = numAmount > balance;
  const valid = !!recipient && numAmount > 0 && !insufficient;

  const submit = async () => {
    const parsed = amountSchema.safeParse(amount);
    if (!parsed.success) return toast.error("Enter a valid amount (max $10,000)");
    if (!recipient) return toast.error("Pick someone to send to");
    setLoading(true);
    const { error } = await supabase.rpc("send_money", {
      p_receiver: recipient.id,
      p_amount: parsed.data,
      p_note: note.trim().slice(0, 140) || null,
    });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success(`Sent ${money(parsed.data)} to ${recipient.full_name ?? "friend"}`);
    onSent();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Send money</DialogTitle>
          <DialogDescription>1% platform fee · friends only</DialogDescription>
        </DialogHeader>
        {!recipient ? (
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input className="pl-9" placeholder="Search friends" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <div className="max-h-72 overflow-y-auto -mx-1 px-1">
              {filtered.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  {friends.length === 0 ? "Add friends in Compare first." : "No matches."}
                </div>
              ) : filtered.map((f) => (
                <button
                  key={f.id}
                  onClick={() => setRecipient(f)}
                  className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-muted/60 active:bg-muted text-left"
                >
                  <Avatar className="w-9 h-9">
                    <AvatarImage src={f.avatar_url ?? undefined} />
                    <AvatarFallback className="text-xs">{initials(f.full_name)}</AvatarFallback>
                  </Avatar>
                  <span className="text-sm font-medium">{f.full_name ?? "Unnamed"}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <button onClick={() => setRecipient(null)} className="flex items-center gap-3 w-full p-2 rounded-xl bg-muted/50">
              <Avatar className="w-9 h-9">
                <AvatarImage src={recipient.avatar_url ?? undefined} />
                <AvatarFallback className="text-xs">{initials(recipient.full_name)}</AvatarFallback>
              </Avatar>
              <span className="text-sm font-medium flex-1 text-left">{recipient.full_name ?? "Unnamed"}</span>
              <span className="text-xs text-muted-foreground">Change</span>
            </button>
            <div>
              <div className="text-center py-4">
                <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Amount</div>
                <div className="flex items-baseline justify-center gap-1">
                  <span className="font-serif text-3xl text-muted-foreground">$</span>
                  <input
                    inputMode="decimal"
                    autoFocus
                    placeholder="0"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                    className="bg-transparent font-serif text-6xl text-center w-44 outline-none tabular-nums"
                  />
                </div>
                <div className="text-xs text-muted-foreground mt-2">Balance {money(balance)}</div>
              </div>
              <Textarea
                placeholder="What's it for?"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={140}
                rows={2}
                className="resize-none"
              />
              {numAmount > 0 && (
                <div className="mt-3 rounded-xl bg-muted/60 px-3 py-2.5 text-xs space-y-1">
                  <div className="flex justify-between"><span className="text-muted-foreground">Amount</span><span className="tabular-nums">{money(numAmount)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Platform fee (1%)</span><span className="tabular-nums">{money(fee)}</span></div>
                  <div className="flex justify-between font-medium pt-1 border-t border-border/60"><span>They receive</span><span className="tabular-nums">{money(net)}</span></div>
                </div>
              )}
              {insufficient && <div className="mt-2 text-xs text-destructive flex items-center gap-1"><Info className="w-3 h-3" /> Not enough in your wallet</div>}
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={!valid || loading}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : `Send ${numAmount > 0 ? money(numAmount) : ""}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RequestDialog({
  open, onOpenChange, friends, uid, onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  friends: Friend[];
  uid: string;
  onCreated: () => void;
}) {
  const [q, setQ] = useState("");
  const [from, setFrom] = useState<Friend | null>(null);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) { setQ(""); setFrom(null); setAmount(""); setNote(""); setLoading(false); }
  }, [open]);

  const filtered = useMemo(
    () => friends.filter((f) => (f.full_name ?? "").toLowerCase().includes(q.toLowerCase())),
    [friends, q],
  );

  const submit = async () => {
    const parsed = amountSchema.safeParse(amount);
    if (!parsed.success) return toast.error("Enter a valid amount (max $10,000)");
    if (!from) return toast.error("Pick who to request from");
    setLoading(true);
    const { error } = await supabase.from("payment_requests").insert({
      requester_id: uid,
      receiver_id: from.id,
      amount: parsed.data,
      note: note.trim().slice(0, 140) || null,
    });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success(`Requested ${money(parsed.data)} from ${from.full_name ?? "friend"}`);
    onCreated();
    onOpenChange(false);
  };

  const numAmount = Number(amount) || 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Request money</DialogTitle>
          <DialogDescription>They'll get a notification to approve or decline.</DialogDescription>
        </DialogHeader>
        {!from ? (
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input className="pl-9" placeholder="Search friends" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <div className="max-h-72 overflow-y-auto -mx-1 px-1">
              {filtered.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  {friends.length === 0 ? "Add friends in Compare first." : "No matches."}
                </div>
              ) : filtered.map((f) => (
                <button
                  key={f.id}
                  onClick={() => setFrom(f)}
                  className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-muted/60 active:bg-muted text-left"
                >
                  <Avatar className="w-9 h-9">
                    <AvatarImage src={f.avatar_url ?? undefined} />
                    <AvatarFallback className="text-xs">{initials(f.full_name)}</AvatarFallback>
                  </Avatar>
                  <span className="text-sm font-medium">{f.full_name ?? "Unnamed"}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <button onClick={() => setFrom(null)} className="flex items-center gap-3 w-full p-2 rounded-xl bg-muted/50">
              <Avatar className="w-9 h-9">
                <AvatarImage src={from.avatar_url ?? undefined} />
                <AvatarFallback className="text-xs">{initials(from.full_name)}</AvatarFallback>
              </Avatar>
              <span className="text-sm font-medium flex-1 text-left">{from.full_name ?? "Unnamed"}</span>
              <span className="text-xs text-muted-foreground">Change</span>
            </button>
            <div className="text-center py-4">
              <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Request</div>
              <div className="flex items-baseline justify-center gap-1">
                <span className="font-serif text-3xl text-muted-foreground">$</span>
                <input
                  inputMode="decimal"
                  autoFocus
                  placeholder="0"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                  className="bg-transparent font-serif text-6xl text-center w-44 outline-none tabular-nums"
                />
              </div>
            </div>
            <Textarea
              placeholder="What's it for?"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={140}
              rows={2}
              className="resize-none"
            />
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={!from || numAmount <= 0 || loading}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : `Request ${numAmount > 0 ? money(numAmount) : ""}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddMoneyDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add money</DialogTitle>
          <DialogDescription>Top up your Workflow Wallet from a bank or card.</DialogDescription>
        </DialogHeader>
        <div className="rounded-2xl bg-muted/60 p-5 text-center">
          <div className="w-12 h-12 rounded-full bg-gold/20 text-gold-foreground flex items-center justify-center mx-auto mb-3">
            <Plus className="w-5 h-5" />
          </div>
          <div className="font-serif text-lg">Bank top-ups coming soon</div>
          <p className="text-sm text-muted-foreground mt-1">
            We're finishing payment-processor verification. You'll be the first to know when real top-ups go live.
          </p>
        </div>
        <DialogFooter>
          <Button className="w-full" onClick={() => onOpenChange(false)}>Got it</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
