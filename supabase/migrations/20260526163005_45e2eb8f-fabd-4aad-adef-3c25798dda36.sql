
-- 1. New users start at $0
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (id, full_name) VALUES (new.id, COALESCE(new.raw_user_meta_data->>'full_name', ''));
  INSERT INTO public.wallets (user_id, balance) VALUES (new.id, 0.00);
  RETURN new;
END;
$function$;

-- Ensure trigger exists (recreate to be safe)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 2. Transactions: add fee + type columns
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS fee numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'send';

-- 3. send_money with 1% fee
CREATE OR REPLACE FUNCTION public.send_money(p_receiver uuid, p_amount numeric, p_note text DEFAULT NULL::text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_sender UUID := auth.uid();
  v_tx_id UUID;
  v_balance NUMERIC;
  v_mutual BOOLEAN;
  v_fee NUMERIC;
  v_net NUMERIC;
BEGIN
  IF v_sender IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'Amount must be positive'; END IF;
  IF v_sender = p_receiver THEN RAISE EXCEPTION 'Cannot send to yourself'; END IF;

  SELECT
    EXISTS(SELECT 1 FROM public.friends WHERE user_id = v_sender AND friend_id = p_receiver AND status = 'active')
    AND
    EXISTS(SELECT 1 FROM public.friends WHERE user_id = p_receiver AND friend_id = v_sender AND status = 'active')
  INTO v_mutual;
  IF NOT v_mutual THEN RAISE EXCEPTION 'Recipient must be an accepted friend'; END IF;

  -- 1% fee, rounded to cents
  v_fee := round(p_amount * 0.01, 2);
  v_net := p_amount - v_fee;

  SELECT balance INTO v_balance FROM public.wallets WHERE user_id = v_sender FOR UPDATE;
  IF v_balance IS NULL OR v_balance < p_amount THEN RAISE EXCEPTION 'Insufficient funds'; END IF;

  -- Ensure receiver wallet exists
  INSERT INTO public.wallets (user_id, balance) VALUES (p_receiver, 0)
  ON CONFLICT (user_id) DO NOTHING;

  UPDATE public.wallets SET balance = balance - p_amount, updated_at = now() WHERE user_id = v_sender;
  UPDATE public.wallets SET balance = balance + v_net, updated_at = now() WHERE user_id = p_receiver;

  INSERT INTO public.transactions (sender_id, receiver_id, amount, fee, status, note, type)
  VALUES (v_sender, p_receiver, p_amount, v_fee, 'completed', p_note, 'send')
  RETURNING id INTO v_tx_id;

  RETURN v_tx_id;
END;
$function$;

-- Ensure wallets has unique user_id for ON CONFLICT
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'wallets_user_id_key'
  ) THEN
    ALTER TABLE public.wallets ADD CONSTRAINT wallets_user_id_key UNIQUE (user_id);
  END IF;
END $$;

-- 4. Approve a payment request (receiver pays the requester)
CREATE OR REPLACE FUNCTION public.approve_payment_request(p_request_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_me UUID := auth.uid();
  v_req RECORD;
  v_tx_id UUID;
  v_fee NUMERIC;
  v_net NUMERIC;
  v_balance NUMERIC;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_req FROM public.payment_requests WHERE id = p_request_id FOR UPDATE;
  IF v_req IS NULL THEN RAISE EXCEPTION 'Request not found'; END IF;
  IF v_req.receiver_id <> v_me THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF v_req.status <> 'pending' THEN RAISE EXCEPTION 'Request already %', v_req.status; END IF;

  v_fee := round(v_req.amount * 0.01, 2);
  v_net := v_req.amount - v_fee;

  SELECT balance INTO v_balance FROM public.wallets WHERE user_id = v_me FOR UPDATE;
  IF v_balance IS NULL OR v_balance < v_req.amount THEN RAISE EXCEPTION 'Insufficient funds'; END IF;

  INSERT INTO public.wallets (user_id, balance) VALUES (v_req.requester_id, 0)
  ON CONFLICT (user_id) DO NOTHING;

  UPDATE public.wallets SET balance = balance - v_req.amount, updated_at = now() WHERE user_id = v_me;
  UPDATE public.wallets SET balance = balance + v_net, updated_at = now() WHERE user_id = v_req.requester_id;

  INSERT INTO public.transactions (sender_id, receiver_id, amount, fee, status, note, type)
  VALUES (v_me, v_req.requester_id, v_req.amount, v_fee, 'completed', v_req.note, 'request_payment')
  RETURNING id INTO v_tx_id;

  UPDATE public.payment_requests SET status = 'paid' WHERE id = p_request_id;

  RETURN v_tx_id;
END;
$function$;

-- 5. Decline a payment request
CREATE OR REPLACE FUNCTION public.decline_payment_request(p_request_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_me UUID := auth.uid();
  v_req RECORD;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO v_req FROM public.payment_requests WHERE id = p_request_id FOR UPDATE;
  IF v_req IS NULL THEN RAISE EXCEPTION 'Request not found'; END IF;
  IF v_req.receiver_id <> v_me THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF v_req.status <> 'pending' THEN RAISE EXCEPTION 'Request already %', v_req.status; END IF;
  UPDATE public.payment_requests SET status = 'declined' WHERE id = p_request_id;
END;
$function$;

-- 6. Realtime for live updates
ALTER TABLE public.wallets REPLICA IDENTITY FULL;
ALTER TABLE public.transactions REPLICA IDENTITY FULL;
ALTER TABLE public.payment_requests REPLICA IDENTITY FULL;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='wallets') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.wallets;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='transactions') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.transactions;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='payment_requests') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.payment_requests;
  END IF;
END $$;
