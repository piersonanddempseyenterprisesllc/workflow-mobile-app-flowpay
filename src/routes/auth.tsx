import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Eye, EyeOff, CalendarDays, Wallet, Users } from "lucide-react";
import workflowLogo from "@/assets/workflow-logo.png";

export const Route = createFileRoute("/auth")({ component: AuthPage });

const USERNAME_RE = /^[A-Za-z0-9_]{3,20}$/;

function AuthPage() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [usernameStatus, setUsernameStatus] = useState<"idle" | "checking" | "available" | "taken" | "invalid">("idle");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => { if (user) nav({ to: "/calendar" }); }, [user, nav]);

  useEffect(() => {
    if (mode !== "signup") return;
    const u = username.trim();
    if (!u) { setUsernameStatus("idle"); return; }
    if (!USERNAME_RE.test(u)) { setUsernameStatus("invalid"); return; }
    setUsernameStatus("checking");
    const t = setTimeout(async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id")
        .ilike("username", u)
        .maybeSingle();
      if (error) { setUsernameStatus("idle"); return; }
      setUsernameStatus(data ? "taken" : "available");
    }, 350);
    return () => clearTimeout(t);
  }, [username, mode]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        const u = username.trim();
        if (!USERNAME_RE.test(u)) throw new Error("Username must be 3–20 letters, numbers, or underscores");
        if (usernameStatus === "taken") throw new Error("That username is taken");
        const { error } = await supabase.auth.signUp({
          email, password,
          options: { data: { full_name: name, username: u }, emailRedirectTo: `${window.location.origin}/calendar` },
        });
        if (error) {
          if (/profiles_username_lower_unique|duplicate key/i.test(error.message)) {
            throw new Error("That username is taken");
          }
          throw error;
        }
        toast.success("Welcome to Workflow");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }


  async function handleForgotPassword() {
    if (!email) {
      toast.error("Enter your email above first");
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      toast.success("Check your email for a reset link");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen relative overflow-hidden bg-background flex flex-col">
      {/* Ambient ombre background */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-32 -left-24 w-[28rem] h-[28rem] rounded-full bg-[oklch(0.75_0.18_295)] opacity-40 blur-3xl" />
        <div className="absolute top-1/3 -right-32 w-[26rem] h-[26rem] rounded-full bg-[oklch(0.78_0.14_250)] opacity-45 blur-3xl" />
        <div className="absolute bottom-[-8rem] left-1/4 w-[22rem] h-[22rem] rounded-full bg-[oklch(0.82_0.14_175)] opacity-45 blur-3xl" />
      </div>

      <div className="app-shell flex-1 flex flex-col justify-center px-6 py-12 !pb-12">
        <div className="text-center mb-8">
          <div className="mb-4">
            <span className="wordmark text-7xl">Workflow</span>
          </div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-card/70 backdrop-blur ring-1 ring-border/60 text-[11px] uppercase tracking-wider text-muted-foreground mb-3">
            <span className="w-1.5 h-1.5 rounded-full bg-primary" />
            Shifts · Pay · People
          </div>
          <h1 className="font-serif text-5xl leading-tight text-foreground">
            Your week,<br/><span className="italic text-primary">beautifully in sync.</span>
          </h1>
          <p className="mt-3 text-sm text-muted-foreground max-w-sm mx-auto">
            Plan shifts, split costs, and pay coworkers — all in one calm, gorgeous space.
          </p>

          <div className="mt-5 flex items-center justify-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-card/70 backdrop-blur ring-1 ring-border/60 text-xs text-foreground">
              <CalendarDays className="h-3.5 w-3.5 text-primary" /> Smart schedule
            </span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-card/70 backdrop-blur ring-1 ring-border/60 text-xs text-foreground">
              <Wallet className="h-3.5 w-3.5 text-primary" /> FlowPay
            </span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-card/70 backdrop-blur ring-1 ring-border/60 text-xs text-foreground">
              <Users className="h-3.5 w-3.5 text-primary" /> Coworkers
            </span>
          </div>
        </div>

        <div className="soft-card p-6 backdrop-blur bg-card/85 ring-1 ring-border/60 shadow-[0_20px_60px_-20px_oklch(0.55_0.15_300/0.25)]">

          <div className="flex bg-muted rounded-full p-1 mb-6">
            {(["signin", "signup"] as const).map((m) => (
              <button key={m} type="button" onClick={() => setMode(m)}
                className={`flex-1 py-2 text-sm rounded-full transition-colors ${
                  mode === m ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
                }`}>
                {m === "signin" ? "Sign in" : "Sign up"}
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="space-y-4">
            {mode === "signup" && (
              <>
                <div>
                  <Label htmlFor="name">Full name</Label>
                  <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required className="mt-1.5 h-12 rounded-xl" />
                </div>
                <div>
                  <Label htmlFor="username">Username</Label>
                  <Input
                    id="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value.replace(/\s/g, ""))}
                    required
                    minLength={3}
                    maxLength={20}
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    placeholder="yourname"
                    className="mt-1.5 h-12 rounded-xl"
                  />
                  <p className={`mt-1 text-xs ${
                    usernameStatus === "taken" || usernameStatus === "invalid" ? "text-destructive" :
                    usernameStatus === "available" ? "text-primary" : "text-muted-foreground"
                  }`}>
                    {usernameStatus === "checking" && "Checking…"}
                    {usernameStatus === "available" && "Username is available"}
                    {usernameStatus === "taken" && "That username is taken"}
                    {usernameStatus === "invalid" && "3–20 letters, numbers, or underscores"}
                    {usernameStatus === "idle" && "3–20 letters, numbers, or underscores"}
                  </p>
                </div>
              </>
            )}
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="mt-1.5 h-12 rounded-xl" />
            </div>
            <div>
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                {mode === "signin" && (
                  <button
                    type="button"
                    onClick={handleForgotPassword}
                    disabled={loading}
                    className="text-xs text-primary hover:underline"
                  >
                    Forgot password?
                  </button>
                )}
              </div>
              <div className="relative mt-1.5">
                <Input id="password" type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} className="h-12 rounded-xl pr-12" />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute inset-y-0 right-0 flex items-center justify-center w-12 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>
            <Button type="submit" disabled={loading} className="w-full h-12 rounded-xl text-base">
              {loading ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
