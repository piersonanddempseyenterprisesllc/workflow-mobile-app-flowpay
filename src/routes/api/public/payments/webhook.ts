import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { type StripeEnv, verifyWebhook } from "@/lib/stripe.server";

async function handleCheckoutCompleted(session: any) {
  if (session?.metadata?.kind !== "wallet_topup") return;
  if (session.payment_status !== "paid") return;
  const sessionId: string = session.id;
  const paymentIntentId: string | null =
    typeof session.payment_intent === "string" ? session.payment_intent : null;

  const { error } = await supabaseAdmin.rpc("credit_wallet_from_topup", {
    p_session_id: sessionId,
    p_payment_intent_id: paymentIntentId,
  });
  if (error) {
    console.error("credit_wallet_from_topup failed", error);
    throw new Error(error.message);
  }
}

async function handleSessionExpired(session: any) {
  if (session?.metadata?.kind !== "wallet_topup") return;
  await supabaseAdmin
    .from("wallet_topups")
    .update({ status: "failed" })
    .eq("stripe_session_id", session.id)
    .eq("status", "pending");
}

async function handleWebhook(req: Request, env: StripeEnv) {
  const event = await verifyWebhook(req, env);
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded":
      await handleCheckoutCompleted(event.data.object);
      break;
    case "checkout.session.expired":
    case "checkout.session.async_payment_failed":
      await handleSessionExpired(event.data.object);
      break;
    default:
      console.log("Unhandled event:", event.type);
  }
}

export const Route = createFileRoute("/api/public/payments/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const rawEnv = new URL(request.url).searchParams.get("env");
        if (rawEnv !== "sandbox" && rawEnv !== "live") {
          console.error("Webhook: invalid env query parameter:", rawEnv);
          return Response.json({ received: true, ignored: "invalid env" });
        }
        try {
          await handleWebhook(request, rawEnv);
          return Response.json({ received: true });
        } catch (e) {
          console.error("Webhook error:", e);
          return new Response("Webhook error", { status: 400 });
        }
      },
    },
  },
});
