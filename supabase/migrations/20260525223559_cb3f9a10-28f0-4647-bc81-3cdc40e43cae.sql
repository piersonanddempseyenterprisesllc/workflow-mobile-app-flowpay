
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TABLE IF NOT EXISTS public.user_calendar_prefs (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  theme_id TEXT NOT NULL DEFAULT 'default',
  color_overrides JSONB NOT NULL DEFAULT '{}'::jsonb,
  custom_categories JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.user_calendar_prefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own calendar prefs"
ON public.user_calendar_prefs FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users insert own calendar prefs"
ON public.user_calendar_prefs FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own calendar prefs"
ON public.user_calendar_prefs FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users delete own calendar prefs"
ON public.user_calendar_prefs FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER update_user_calendar_prefs_updated_at
BEFORE UPDATE ON public.user_calendar_prefs
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
