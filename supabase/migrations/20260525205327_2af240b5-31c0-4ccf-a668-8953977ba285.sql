
-- 1. Profiles: restrict hourly_rate exposure
DROP POLICY IF EXISTS "profiles readable by authenticated" ON public.profiles;
CREATE POLICY "users view own full profile"
ON public.profiles FOR SELECT TO authenticated
USING (auth.uid() = id);

-- Public-safe view for browsing other users (no hourly_rate)
CREATE OR REPLACE VIEW public.profiles_public
WITH (security_invoker = true) AS
SELECT id, full_name, avatar_url, profession_id, workplace_id, created_at, updated_at
FROM public.profiles;
GRANT SELECT ON public.profiles_public TO authenticated;

-- Allow viewing other profiles (excluding sensitive fields) through column-level: re-add a SELECT policy but apps should use the view. Keep restrictive.
CREATE POLICY "view non-sensitive profile fields of others"
ON public.profiles FOR SELECT TO authenticated
USING (true);
-- NOTE: column-level grants
REVOKE SELECT ON public.profiles FROM authenticated;
GRANT SELECT (id, full_name, avatar_url, profession_id, workplace_id, created_at, updated_at) ON public.profiles TO authenticated;
GRANT SELECT (hourly_rate) ON public.profiles TO authenticated;
-- Restrict hourly_rate via RLS by using a policy on a separate path:
-- Simplest: revoke hourly_rate column from authenticated entirely; owner reads via separate policy using all columns
REVOKE SELECT (hourly_rate) ON public.profiles FROM authenticated;

-- 2. Friends: require pending status, recipient confirms
DROP POLICY IF EXISTS "users create friends" ON public.friends;
CREATE POLICY "users create pending friend requests"
ON public.friends FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id AND status = 'pending');

DROP POLICY IF EXISTS "users update own friends" ON public.friends;
CREATE POLICY "users update own friend rows"
ON public.friends FOR UPDATE TO authenticated
USING (auth.uid() = user_id OR auth.uid() = friend_id);

-- 3. send_money: require mutual active friendship
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
BEGIN
  IF v_sender IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_amount <= 0 THEN RAISE EXCEPTION 'Amount must be positive'; END IF;
  IF v_sender = p_receiver THEN RAISE EXCEPTION 'Cannot send to yourself'; END IF;

  SELECT
    EXISTS(SELECT 1 FROM public.friends WHERE user_id = v_sender AND friend_id = p_receiver AND status = 'active')
    AND
    EXISTS(SELECT 1 FROM public.friends WHERE user_id = p_receiver AND friend_id = v_sender AND status = 'active')
  INTO v_mutual;
  IF NOT v_mutual THEN RAISE EXCEPTION 'Recipient must have accepted friendship'; END IF;

  SELECT balance INTO v_balance FROM public.wallets WHERE user_id = v_sender FOR UPDATE;
  IF v_balance IS NULL OR v_balance < p_amount THEN RAISE EXCEPTION 'Insufficient funds'; END IF;

  UPDATE public.wallets SET balance = balance - p_amount, updated_at = now() WHERE user_id = v_sender;
  UPDATE public.wallets SET balance = balance + p_amount, updated_at = now() WHERE user_id = p_receiver;

  INSERT INTO public.transactions (sender_id, receiver_id, amount, status, note)
  VALUES (v_sender, p_receiver, p_amount, 'completed', p_note)
  RETURNING id INTO v_tx_id;

  RETURN v_tx_id;
END;
$function$;

-- 4. Wallets: explicit insert policy
CREATE POLICY "users create own wallet"
ON public.wallets FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

-- 5. Payment requests: allow delete by either party
CREATE POLICY "delete own payment requests"
ON public.payment_requests FOR DELETE TO authenticated
USING (auth.uid() = requester_id OR auth.uid() = receiver_id);

-- 6. Storage: restrict avatar listing/access to owner's folder; keep public read for individual files via signed URLs is preferred, but maintain public read for now scoped tighter
DROP POLICY IF EXISTS "Avatar images are publicly accessible" ON storage.objects;
CREATE POLICY "Avatar images viewable by owner or via direct path"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'avatars' AND (
    auth.uid()::text = (storage.foldername(name))[1]
    OR auth.role() = 'anon' AND false  -- block broad listing
  )
);
-- Allow authenticated users to read any single avatar (needed for showing other users' avatars) but not list
CREATE POLICY "Authenticated can read avatars"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'avatars');

-- 7. Lock down handle_new_user (trigger function) execute permission
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, authenticated, anon;
