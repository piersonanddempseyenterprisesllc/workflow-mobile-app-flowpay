import { EmbeddedCheckoutProvider, EmbeddedCheckout } from "@stripe/react-stripe-js";
import { getStripe, getStripeEnvironment } from "@/lib/stripe";
import { createTopupCheckout } from "@/lib/wallet-checkout.functions";

interface Props {
  amountInCents: number;
  returnUrl: string;
}

export function WalletTopupCheckout({ amountInCents, returnUrl }: Props) {
  const fetchClientSecret = async (): Promise<string> => {
    const result = await createTopupCheckout({
      data: { amountInCents, returnUrl, environment: getStripeEnvironment() },
    });
    if ("error" in result) throw new Error(result.error);
    if (!result.clientSecret) throw new Error("Checkout did not return a client secret");
    return result.clientSecret;
  };

  return (
    <div id="checkout" className="min-h-[520px]">
      <EmbeddedCheckoutProvider stripe={getStripe()} options={{ fetchClientSecret }}>
        <EmbeddedCheckout />
      </EmbeddedCheckoutProvider>
    </div>
  );
}
