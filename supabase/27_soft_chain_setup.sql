-- ==========================================
-- Phase 7: Soft-Chain (Gasless) Setup
-- Paste this into your NEW Supabase SQL Editor
-- ==========================================

-- 1. Table for Gasless Signed Moves
CREATE TABLE IF NOT EXISTS soft_moves (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    match_id TEXT NOT NULL,
    round_number INT NOT NULL,
    player_address TEXT NOT NULL,
    move_value INT NOT NULL,
    salt TEXT NOT NULL,
    signature TEXT NOT NULL, -- The EIP-712 or standard Eth signature
    created_at TIMESTAMPTZ DEFAULT NOW(),
    processed BOOLEAN DEFAULT FALSE,
    
    -- Ensure one move per player per round
    UNIQUE(match_id, round_number, player_address)
);

-- 2. Enable Realtime for the VM Watcher
ALTER PUBLICATION supabase_realtime ADD TABLE soft_moves;

-- 3. RLS Policies
ALTER TABLE soft_moves ENABLE ROW LEVEL SECURITY;

-- Allow anyone to see the moves (Public matching the blockchain)
CREATE POLICY "Public Read Soft Moves" 
ON soft_moves FOR SELECT 
TO public 
USING (true);

-- Allow authenticated agents to insert their own moves
-- (In production, we verify the signature in the VM before settlement)
CREATE POLICY "Agents Insert Soft Moves" 
ON soft_moves FOR INSERT 
TO anon, authenticated
WITH CHECK (true);

-- 4. Helper for Logic Aliases (For Free Games)
-- This table already exists in master, but ensure it's in the new DB
CREATE TABLE IF NOT EXISTS logic_aliases (
    logic_id TEXT PRIMARY KEY,
    alias_name TEXT UNIQUE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed with Falken Chess for testing
INSERT INTO logic_aliases (logic_id, alias_name) 
VALUES ('0xCHESS_TEST_ID', 'Falken Chess (Free)')
ON CONFLICT DO NOTHING;
