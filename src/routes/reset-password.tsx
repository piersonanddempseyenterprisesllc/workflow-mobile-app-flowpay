import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Eye, EyeOff } from "lucide-react";

export const Route = createFileRoute("/reset-password")({ component: ResetPasswordPage });

function ResetPasswordPage() {
  const nav = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [show, setShow] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Supabase JS auto-exchanges the recovery token from the URL hash and fires PASSWORD_RECOVERY.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setReady(true);
    });
    // Also handle case where session is already established from the link.
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    return () => subscription.unsubscribe();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    if (password !== confirm) {
      toast.error("Passwords do not match");
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast.success("Password updated");
      await supabase.auth.signOut();
      nav({ to: "/auth" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="app-shell flex-1 flex flex-col justify-center px-6 py-12 !pb-12">
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary text-primary-foreground mb-5 font-serif text-2xl">W</div>
          <h1 className="font-serif text-4xl text-foreground">Reset password</h1>
          <p className="mt-2 text-sm text-muted-foreground">Choose a new password for your account.</p>
        </div>

        <div className="soft-card p-6">
          {!ready ? (
            <p className="text-sm text-muted-foreground text-center">
              Verifying your reset link…
            </p>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <div>
                <Label htmlFor="password">New password</Label>
                <div className="relative mt-1.5">
                  <Input id="password" type={show ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} className="h-12 rounded-xl pr-12" />
                  <button
                    type="button"
                    onClick={() => setShow((v) => !v)}
                    aria-label={show ? "Hide password" : "Show password"}
                    className="absolute inset-y-0 right-0 flex items-center justify-center w-12 text-muted-foreground hover:text-foreground"
                  >
                    {show ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
              </div>
              <div>
                <Label htmlFor="confirm">Confirm password</Label>
                <Input id="confirm" type={show ? "text" : "password"} value={confirm} onChange={(e) => setConfirm(e.target.value)} required minLength={6} className="mt-1.5 h-12 rounded-xl" />
              </div>
              <Button type="submit" disabled={loading} className="w-full h-12 rounded-xl text-base">
                {loading ? "Please wait…" : "Update password"}
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
