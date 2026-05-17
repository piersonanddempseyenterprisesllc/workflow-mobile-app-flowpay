ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'work';
ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS location text;
ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS title text;