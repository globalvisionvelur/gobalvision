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

-- 12. Bill Payments table (monthly bill payment tracking per subscriber)
CREATE TABLE IF NOT EXISTS public.bill_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID REFERENCES public.connections(id) ON DELETE CASCADE,
  customer_name TEXT NOT NULL,
  phone TEXT,
  provider TEXT,
  connection_type TEXT,
  billing_month TEXT NOT NULL,
  amount NUMERIC(10, 2) NOT NULL DEFAULT 0,
  amount_paid NUMERIC(10, 2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'Paid',
  payment_date DATE,
  payment_method TEXT DEFAULT 'Cash',
  reference_id TEXT,
  notes TEXT,
  recorded_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  recorded_by_name TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT bill_payments_conn_month UNIQUE (connection_id, billing_month)
);
ALTER TABLE public.bill_payments ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Allow public read bill_payments" ON public.bill_payments FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "Allow public insert bill_payments" ON public.bill_payments FOR INSERT WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "Allow public update bill_payments" ON public.bill_payments FOR UPDATE USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "Allow public delete bill_payments" ON public.bill_payments FOR DELETE USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
