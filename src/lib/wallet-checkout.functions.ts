import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  type StripeEnv,
  createStripeClient,
  getStripeErrorMessage,
} from "@/lib/stripe.server";

type Result = { clientSecret: string } | { error: string };

const MIN_CENTS = 100; // $1.00
const MAX_CENTS = 500_000; // $5,000.00

export const createTopupCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: { amountInCents: number; returnUrl: string; environment: StripeEnv }) => {
      if (
        !Number.isInteger(data.amountInCents) ||
        data.amountInCents < MIN_CENTS ||
        data.amountInCents > MAX_CENTS
      ) {
        throw new Error(
          `Amount must be between $${MIN_CENTS / 100} and $${MAX_CENTS / 100}`,
        );
      }
      if (data.environment !== "sandbox" && data.environment !== "live") {
        throw new Error("Invalid environment");
      }
      if (typeof data.returnUrl !== "string" || data.returnUrl.length > 500) {
        throw new Error("Invalid returnUrl");
      }
      return data;
    },
  )
  .handler(async ({ data, context }): Promise<Result> => {
    try {
      const { userId, claims } = context;
      const email = (claims as { email?: string } | undefined)?.email;
      const stripe = createStripeClient(data.environment);

      const session = await stripe.checkout.sessions.create({
        line_items: [
          {
            price_data: {
              currency: "usd",
              product_data: {
                name: "Workflow Wallet top-up",
                description: "Add funds to your Workflow Wallet balance.",
              },
              unit_amount: data.amountInCents,
            },
            quantity: 1,
          },
        ],
        mode: "payment",
        ui_mode: "embedded_page",
        return_url: data.returnUrl,
        ...(email && { customer_email: email }),
        payment_intent_data: {
          description: "Workflow Wallet top-up",
          metadata: { userId, kind: "wallet_topup" },
        },
        metadata: {
          userId,
          kind: "wallet_topup",
          amount_cents: String(data.amountInCents),
        },
      });

      // Record the pending top-up so the webhook can credit idempotently.
      const { error: insertErr } = await supabaseAdmin
        .from("wallet_topups")
        .insert({
          user_id: userId,
          stripe_session_id: session.id,
          amount_cents: data.amountInCents,
          status: "pending",
          environment: data.environment,
        });
      if (insertErr) throw new Error(insertErr.message);

      return { clientSecret: session.client_secret ?? "" };
    } catch (error) {
      return { error: getStripeErrorMessage(error) };
    }
  });
