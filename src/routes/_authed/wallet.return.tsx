import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authed/wallet/return")({
  validateSearch: (search: Record<string, unknown>) => ({
    session_id: typeof search.session_id === "string" ? search.session_id : undefined,
  }),
  component: WalletReturn,
});

function WalletReturn() {
  const { session_id } = Route.useSearch();
  const qc = useQueryClient();
  const navigate = useNavigate();

  // Webhook credits the wallet asynchronously; refetch on mount + after delay.
  useEffect(() => {
    qc.invalidateQueries();
    const t = setTimeout(() => qc.invalidateQueries(), 2500);
    return () => clearTimeout(t);
  }, [qc]);

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center p-6 text-center">
      <div className="w-16 h-16 rounded-full bg-emerald-500/15 text-emerald-600 flex items-center justify-center mb-4">
        <CheckCircle2 className="w-8 h-8" />
      </div>
      <h1 className="font-serif text-2xl mb-2">Payment received</h1>
      <p className="text-muted-foreground max-w-sm mb-6">
        Your top-up is being credited to your Workflow Wallet. This usually takes a few
        seconds.
      </p>
      {session_id && (
        <p className="text-[11px] text-muted-foreground font-mono mb-6 break-all max-w-xs">
          {session_id}
        </p>
      )}
      <div className="flex gap-2">
        <Button asChild>
          <Link to="/wallet">
            <ArrowLeft className="w-4 h-4 mr-2" /> Back to Wallet
          </Link>
        </Button>
      </div>
    </div>
  );
}
