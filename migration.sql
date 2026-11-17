-- ═══════════════════════════════════════════════════════════
-- GlobalVision — Incremental Migration
-- Run this in Supabase SQL Editor (SQL Editor -> New query)
-- Safe to re-run: uses IF NOT EXISTS / IF NOT EXISTS
-- ═══════════════════════════════════════════════════════════

-- 9. Add monthly_rate column to connections
ALTER TABLE public.connections ADD COLUMN IF NOT EXISTS monthly_rate NUMERIC(10, 2) DEFAULT NULL;

-- 10. Add business_profile column to app_settings
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS business_profile JSONB DEFAULT NULL;

-- 11. Master Plans table
CREATE TABLE IF NOT EXISTS public.master_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT '',
  connection_type TEXT NOT NULL DEFAULT 'Broadband',
  rate NUMERIC(10, 2) NOT NULL DEFAULT 500,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.master_plans ENABLE ROW LEVEL SECURITY;

-- RLS policies (safe: Postgres errors on duplicate policy names, so wrap in DO block)
DO $$ BEGIN
  CREATE POLICY "Allow public read master_plans" ON public.master_plans FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "Allow public insert master_plans" ON public.master_plans FOR INSERT WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "Allow public update master_plans" ON public.master_plans FOR UPDATE USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "Allow public delete master_plans" ON public.master_plans FOR DELETE USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
