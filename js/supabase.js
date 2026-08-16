/**
 * Supabase client and sync module for GlobalVision.
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_CONFIG_KEY = 'globalvision_supabase_config';

export function getSupabaseConfig() {
  const local = localStorage.getItem(SUPABASE_CONFIG_KEY);
  if (local) {
    try {
      return JSON.parse(local);
    } catch {
      // ignore
    }
  }

  // Fallback to Vite env vars if present
  const envUrl = import.meta.env?.VITE_SUPABASE_URL || '';
  const envKey = import.meta.env?.VITE_SUPABASE_ANON_KEY || '';
  if (envUrl && envKey) {
    return { url: envUrl, anonKey: envKey, enabled: true };
  }

  return { url: '', anonKey: '', enabled: false };
}

export function saveSupabaseConfig(config) {
  localStorage.setItem(SUPABASE_CONFIG_KEY, JSON.stringify(config));
  initSupabaseClient();
}

let supabaseInstance = null;

export function initSupabaseClient() {
  const config = getSupabaseConfig();
  if (config.url && config.anonKey && config.enabled) {
    try {
      supabaseInstance = createClient(config.url, config.anonKey);
      return supabaseInstance;
    } catch (e) {
      console.warn('Failed to init Supabase client:', e);
      supabaseInstance = null;
      return null;
    }
  }
  supabaseInstance = null;
  return null;
}

export function getSupabase() {
  if (!supabaseInstance) {
    initSupabaseClient();
  }
  return supabaseInstance;
}

export async function testSupabaseConnection(url, anonKey) {
  try {
    const client = createClient(url, anonKey);
    // Simple ping query
    const { error } = await client.from('users').select('id').limit(1);
    if (error && error.code !== 'PGRST116') {
      // Table might not exist yet or auth issue
      return { success: false, message: error.message || 'Could not query table. Did you run the SQL schema?' };
    }
    return { success: true, message: 'Connected successfully to Supabase!' };
  } catch (err) {
    return { success: false, message: err.message || 'Connection failed' };
  }
}

export const SUPABASE_SQL_SCHEMA = `-- ═══════════════════════════════════════════════════════════
-- GlobalVision Tracker — Supabase Database Schema
-- Run this in Supabase SQL Editor (SQL Editor -> New query)
-- ═══════════════════════════════════════════════════════════

-- 1. Users Table
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  pin_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Connections Table
CREATE TABLE IF NOT EXISTS public.connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_name TEXT NOT NULL,
  phone TEXT,
  provider TEXT NOT NULL,
  connection_type TEXT NOT NULL,
  connection_date DATE,
  expiry_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'Active',
  notes TEXT,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Enable Row Level Security (RLS)
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.connections ENABLE ROW LEVEL SECURITY;

-- 4. Open Policies (for Anon Key access)
CREATE POLICY "Allow public read users" ON public.users FOR SELECT USING (true);
CREATE POLICY "Allow public insert users" ON public.users FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update users" ON public.users FOR UPDATE USING (true);
CREATE POLICY "Allow public delete users" ON public.users FOR DELETE USING (true);

CREATE POLICY "Allow public read connections" ON public.connections FOR SELECT USING (true);
CREATE POLICY "Allow public insert connections" ON public.connections FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update connections" ON public.connections FOR UPDATE USING (true);
CREATE POLICY "Allow public delete connections" ON public.connections FOR DELETE USING (true);
`;
