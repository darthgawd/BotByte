-- Migration: Add reasoning column to rounds for AI Dataset
-- To be applied in Supabase SQL Editor

ALTER TABLE public.rounds 
ADD COLUMN IF NOT EXISTS reasoning TEXT;

-- Notify schema reload
NOTIFY pgrst, 'reload schema';
