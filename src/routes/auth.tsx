import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Eye, EyeOff } from "lucide-react";

export const Route = createFileRoute("/auth")({ component: AuthPage });

const USERNAME_RE = /^[A-Za-z0-9_]{3,20}$/;

function passwordStrength(pw: string): "empty" | "weak" | "fair" | "strong" {
  if (!pw) return "empty";
  let score = 0;
  if (pw.length >= 6) score++;
  if (pw.length >= 10) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  if (score <= 1) return "weak";
  if (score <= 3) return "fair";
  return "strong";
}
const REMEMBER_KEY = "workflow.rememberEmail";

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
  const [remember, setRemember] = useState(true);

  useEffect(() => { if (user) nav({ to: "/calendar" }); }, [user, nav]);

  // Prefill saved email
  useEffect(() => {
    const saved = typeof window !== "undefined" ? window.localStorage.getItem(REMEMBER_KEY) : null;
    if (saved) { setEmail(saved); setRemember(true); }
  }, []);

  useEffect(() => {
    if (mode !== "signup") return;
    const u = username.trim();
    if (!u) { setUsernameStatus("idle"); return; }
    if (!USERNAME_RE.test(u)) { setUsernameStatus("invalid"); return; }
    setUsernameStatus("checking");
    const t = setTimeout(async () => {
      const { data, error } = await supabase
        .from("profiles").select("id").ilike("username", u).maybeSingle();
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
      if (remember) window.localStorage.setItem(REMEMBER_KEY, email);
      else window.localStorage.removeItem(REMEMBER_KEY);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function handleForgotPassword() {
    if (!email) { toast.error("Enter your email above first"); return; }
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
    <div className="min-h-[100dvh] relative overflow-hidden bg-white flex flex-col">


      <div className="mx-auto w-full max-w-md flex-1 flex flex-col justify-center px-5 py-6">
        <div className="text-center mb-4">
          <span
            className={`wordmark-write inline-block text-[2.75rem] sm:text-[3.25rem] leading-[1.4] px-3 pb-3 pt-1 ${loading ? "is-writing" : ""}`}
            style={{
              fontFamily: 'Pacifico, "Dancing Script", cursive',
              backgroundImage: "var(--gradient-brand)",
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              color: "transparent",
              filter: "drop-shadow(0 4px 14px color-mix(in oklab, var(--grad-3) 25%, transparent))",
            }}
          >
            Workflow
          </span>
        </div>



        <div className="soft-card p-5 sm:p-6 backdrop-blur bg-card/85 ring-1 ring-border/60 shadow-[0_20px_60px_-20px_oklch(0.55_0.15_300/0.25)]">
          <div className="flex bg-muted rounded-full p-1 mb-5">
            {(["signin", "signup"] as const).map((m) => (
              <button key={m} type="button" onClick={() => setMode(m)}
                className={`flex-1 py-2 text-sm rounded-full transition-colors ${
                  mode === m ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
                }`}>
                {m === "signin" ? "Sign in" : "Sign up"}
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="space-y-3.5">
            {mode === "signup" && (
              <>
                <div>
                  <Label htmlFor="name">Full name</Label>
                  <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required className="mt-1.5 h-11 rounded-xl" />
                </div>
                <div>
                  <Label htmlFor="username">Username</Label>
                  <Input
                    id="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value.replace(/\s/g, ""))}
                    required minLength={3} maxLength={20}
                    autoCapitalize="none" autoCorrect="off" spellCheck={false}
                    placeholder="yourname"
                    className="mt-1.5 h-11 rounded-xl"
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
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" className="mt-1.5 h-11 rounded-xl" />
            </div>
            <div>
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                {mode === "signin" && (
                  <button type="button" onClick={handleForgotPassword} disabled={loading}
                    className="text-xs text-primary hover:underline">
                    Forgot password?
                  </button>
                )}
              </div>
              <div className="relative mt-1.5">
                <Input id="password" type={showPassword ? "text" : "password"} value={password}
                  onChange={(e) => setPassword(e.target.value)} required minLength={6}
                  autoComplete={mode === "signin" ? "current-password" : "new-password"}
                  className="h-11 rounded-xl pr-12" />
                <button type="button" onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute inset-y-0 right-0 flex items-center justify-center w-11 text-muted-foreground hover:text-foreground">
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer select-none pt-0.5">
              <Checkbox checked={remember} onCheckedChange={(v) => setRemember(v === true)} />
              Remember me on this device
            </label>

            <Button type="submit" disabled={loading} className="w-full h-12 rounded-xl text-base bg-gradient-brand text-primary-foreground ring-brand border-0 hover:opacity-95">
              {loading ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
