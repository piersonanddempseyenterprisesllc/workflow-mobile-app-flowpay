
-- Table for tracking wallet top-up sessions (idempotency for webhook crediting)
CREATE TABLE public.wallet_topups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  stripe_session_id TEXT NOT NULL UNIQUE,
  stripe_payment_intent_id TEXT,
  amount_cents INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | completed | failed
  environment TEXT NOT NULL DEFAULT 'sandbox',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_wallet_topups_user ON public.wallet_topups(user_id);

GRANT SELECT ON public.wallet_topups TO authenticated;
GRANT ALL ON public.wallet_topups TO service_role;

ALTER TABLE public.wallet_topups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users view own topups"
ON public.wallet_topups FOR SELECT TO authenticated
USING (auth.uid() = user_id);

-- Service-role-only RPC: credit a wallet from a completed Stripe session.
-- Idempotent: marking the row 'completed' is atomic and gated.
CREATE OR REPLACE FUNCTION public.credit_wallet_from_topup(
  p_session_id TEXT,
  p_payment_intent_id TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_topup RECORD;
  v_amount NUMERIC;
BEGIN
  SELECT * INTO v_topup FROM public.wallet_topups
    WHERE stripe_session_id = p_session_id FOR UPDATE;
  IF v_topup IS NULL THEN RAISE EXCEPTION 'Top-up not found: %', p_session_id; END IF;
  IF v_topup.status = 'completed' THEN RETURN; END IF; -- idempotent

  v_amount := (v_topup.amount_cents::NUMERIC) / 100.0;

  INSERT INTO public.wallets (user_id, balance) VALUES (v_topup.user_id, 0)
  ON CONFLICT (user_id) DO NOTHING;

  UPDATE public.wallets
    SET balance = balance + v_amount, updated_at = now()
    WHERE user_id = v_topup.user_id;

  UPDATE public.wallet_topups
    SET status = 'completed',
        stripe_payment_intent_id = COALESCE(p_payment_intent_id, stripe_payment_intent_id),
        completed_at = now()
    WHERE id = v_topup.id;

  -- Record as a transaction (sender = receiver = self, type = topup)
  INSERT INTO public.transactions (sender_id, receiver_id, amount, fee, status, note, type)
  VALUES (v_topup.user_id, v_topup.user_id, v_amount, 0, 'completed', 'Bank/card top-up', 'topup');
END;
$$;

REVOKE EXECUTE ON FUNCTION public.credit_wallet_from_topup(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.credit_wallet_from_topup(TEXT, TEXT) TO service_role;

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.wallet_topups;
