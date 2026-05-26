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
  v_fee NUMERIC;
  v_net NUMERIC;
  v_receiver_exists BOOLEAN;
BEGIN
  IF v_sender IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'Amount must be positive'; END IF;
  IF v_sender = p_receiver THEN RAISE EXCEPTION 'Cannot send to yourself'; END IF;

  SELECT EXISTS(SELECT 1 FROM public.profiles WHERE id = p_receiver) INTO v_receiver_exists;
  IF NOT v_receiver_exists THEN RAISE EXCEPTION 'Recipient not found'; END IF;

  v_fee := round(p_amount * 0.01, 2);
  v_net := p_amount - v_fee;

  SELECT balance INTO v_balance FROM public.wallets WHERE user_id = v_sender FOR UPDATE;
  IF v_balance IS NULL OR v_balance < p_amount THEN RAISE EXCEPTION 'Insufficient funds'; END IF;

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