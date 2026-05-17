
-- PROFESSIONS
CREATE TABLE public.professions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.professions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "professions readable by all authenticated" ON public.professions FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated can create professions" ON public.professions FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);

INSERT INTO public.professions (name) VALUES
  ('Nurse'), ('CNA'), ('Respiratory Therapist'), ('Monitor Tech'),
  ('Medical Assistant'), ('LPN'), ('Physician'), ('Physical Therapist');

-- WORKPLACES
CREATE TABLE public.workplaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  location TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.workplaces ENABLE ROW LEVEL SECURITY;
CREATE POLICY "workplaces readable by all authenticated" ON public.workplaces FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated can create workplaces" ON public.workplaces FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);

-- PROFILES
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  avatar_url TEXT,
  profession_id UUID REFERENCES public.professions(id),
  workplace_id UUID REFERENCES public.workplaces(id),
  hourly_rate NUMERIC(10,2) DEFAULT 35.00,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles readable by authenticated" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "users update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE POLICY "users insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

-- AUTO-CREATE PROFILE + WALLET ON SIGNUP
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name) VALUES (new.id, COALESCE(new.raw_user_meta_data->>'full_name', ''));
  INSERT INTO public.wallets (user_id, balance) VALUES (new.id, 100.00);
  RETURN new;
END;
$$;

-- SHIFTS
CREATE TABLE public.shifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  type TEXT NOT NULL DEFAULT 'Day',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.shifts ENABLE ROW LEVEL SECURITY;
CREATE INDEX shifts_user_date_idx ON public.shifts(user_id, date);

-- FRIENDS
CREATE TABLE public.friends (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  friend_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, friend_id)
);
ALTER TABLE public.friends ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users view own friends" ON public.friends FOR SELECT TO authenticated USING (auth.uid() = user_id OR auth.uid() = friend_id);
CREATE POLICY "users create friends" ON public.friends FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users update own friends" ON public.friends FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "users delete own friends" ON public.friends FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- SCHEDULE ACCESS
CREATE TABLE public.schedule_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  viewer_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(owner_user_id, viewer_user_id)
);
ALTER TABLE public.schedule_access ENABLE ROW LEVEL SECURITY;
CREATE POLICY "view own access rows" ON public.schedule_access FOR SELECT TO authenticated USING (auth.uid() = owner_user_id OR auth.uid() = viewer_user_id);
CREATE POLICY "owners create access" ON public.schedule_access FOR INSERT TO authenticated WITH CHECK (auth.uid() = owner_user_id);
CREATE POLICY "owners delete access" ON public.schedule_access FOR DELETE TO authenticated USING (auth.uid() = owner_user_id);

-- Shifts RLS (depends on schedule_access)
CREATE POLICY "view own shifts or shared" ON public.shifts FOR SELECT TO authenticated USING (
  auth.uid() = user_id OR EXISTS (
    SELECT 1 FROM public.schedule_access WHERE owner_user_id = shifts.user_id AND viewer_user_id = auth.uid()
  )
);
CREATE POLICY "users insert own shifts" ON public.shifts FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users update own shifts" ON public.shifts FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "users delete own shifts" ON public.shifts FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- WALLETS
CREATE TABLE public.wallets (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  balance NUMERIC(12,2) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users view own wallet" ON public.wallets FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Now create the trigger (after wallets exists)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- TRANSACTIONS
CREATE TABLE public.transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  receiver_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount NUMERIC(12,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'completed',
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "view own transactions" ON public.transactions FOR SELECT TO authenticated USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

-- PAYMENT REQUESTS
CREATE TABLE public.payment_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  receiver_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount NUMERIC(12,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.payment_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "view own payment requests" ON public.payment_requests FOR SELECT TO authenticated USING (auth.uid() = requester_id OR auth.uid() = receiver_id);
CREATE POLICY "create payment requests" ON public.payment_requests FOR INSERT TO authenticated WITH CHECK (auth.uid() = requester_id);
CREATE POLICY "update payment requests as receiver" ON public.payment_requests FOR UPDATE TO authenticated USING (auth.uid() = receiver_id);

-- BANK ACCOUNTS (future)
CREATE TABLE public.bank_accounts (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  plaid_account_id TEXT,
  stripe_customer_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.bank_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users view own bank" ON public.bank_accounts FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "users upsert own bank" ON public.bank_accounts FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users update own bank" ON public.bank_accounts FOR UPDATE TO authenticated USING (auth.uid() = user_id);

-- SEND MONEY RPC (atomic, friend-only)
CREATE OR REPLACE FUNCTION public.send_money(p_receiver UUID, p_amount NUMERIC, p_note TEXT DEFAULT NULL)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_sender UUID := auth.uid();
  v_tx_id UUID;
  v_balance NUMERIC;
  v_is_friend BOOLEAN;
BEGIN
  IF v_sender IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_amount <= 0 THEN RAISE EXCEPTION 'Amount must be positive'; END IF;
  IF v_sender = p_receiver THEN RAISE EXCEPTION 'Cannot send to yourself'; END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.friends
    WHERE user_id = v_sender AND friend_id = p_receiver AND status = 'active'
  ) INTO v_is_friend;
  IF NOT v_is_friend THEN RAISE EXCEPTION 'Recipient must be a friend'; END IF;

  SELECT balance INTO v_balance FROM public.wallets WHERE user_id = v_sender FOR UPDATE;
  IF v_balance IS NULL OR v_balance < p_amount THEN RAISE EXCEPTION 'Insufficient funds'; END IF;

  UPDATE public.wallets SET balance = balance - p_amount, updated_at = now() WHERE user_id = v_sender;
  UPDATE public.wallets SET balance = balance + p_amount, updated_at = now() WHERE user_id = p_receiver;

  INSERT INTO public.transactions (sender_id, receiver_id, amount, status, note)
  VALUES (v_sender, p_receiver, p_amount, 'completed', p_note)
  RETURNING id INTO v_tx_id;

  RETURN v_tx_id;
END;
$$;

-- SHARE SCHEDULE RPC (auto-creates friendship)
CREATE OR REPLACE FUNCTION public.share_schedule_with(p_viewer UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_owner UUID := auth.uid();
BEGIN
  IF v_owner IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  INSERT INTO public.schedule_access (owner_user_id, viewer_user_id) VALUES (v_owner, p_viewer) ON CONFLICT DO NOTHING;
  INSERT INTO public.friends (user_id, friend_id, status) VALUES (v_owner, p_viewer, 'active') ON CONFLICT DO NOTHING;
  INSERT INTO public.friends (user_id, friend_id, status) VALUES (p_viewer, v_owner, 'active') ON CONFLICT DO NOTHING;
END;
$$;

-- BLOCK USER RPC
CREATE OR REPLACE FUNCTION public.block_user(p_target UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_me UUID := auth.uid();
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  DELETE FROM public.friends WHERE (user_id = v_me AND friend_id = p_target) OR (user_id = p_target AND friend_id = v_me);
  DELETE FROM public.schedule_access WHERE (owner_user_id = v_me AND viewer_user_id = p_target) OR (owner_user_id = p_target AND viewer_user_id = v_me);
  INSERT INTO public.friends (user_id, friend_id, status) VALUES (v_me, p_target, 'blocked');
END;
$$;
