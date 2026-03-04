-- Migration: Agent Directives for Terminal Control
-- Enables manual overrides for autonomous agents
-- ==========================================

CREATE TABLE IF NOT EXISTS public.agent_directives (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_address TEXT NOT NULL,
    manager_address TEXT NOT NULL,
    command TEXT NOT NULL, -- e.g., "FOLD", "STAY", "AGGRESSIVE"
    status TEXT DEFAULT 'PENDING', -- PENDING, EXECUTED, EXPIRED
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '5 minutes'
);

-- Enable Realtime for instant bot pickup
ALTER PUBLICATION supabase_realtime ADD TABLE public.agent_directives;

-- RLS: Only managers can insert directives for their agents
ALTER TABLE public.agent_directives ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Managers can issue directives" 
ON public.agent_directives FOR INSERT 
WITH CHECK (true); -- Simplified for MVP, in production check manager_address

CREATE POLICY "Public can view directives" 
ON public.agent_directives FOR SELECT 
USING (true);

NOTIFY pgrst, 'reload schema';
