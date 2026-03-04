-- ==========================================
-- Falken: NUCLEAR DATA RESET (START FRESH)
-- Run this in your Supabase SQL Editor
-- ==========================================

-- 1. Disable triggers temporarily to avoid errors
SET session_replication_role = 'replica';

-- 2. WIPE ALL DATA (But keep schema)
TRUNCATE TABLE rounds CASCADE;
TRUNCATE TABLE matches CASCADE;
TRUNCATE TABLE agent_profiles CASCADE;
TRUNCATE TABLE manager_profiles CASCADE;
TRUNCATE TABLE logic_aliases CASCADE;
TRUNCATE TABLE logic_submissions CASCADE;
TRUNCATE TABLE developer_profiles CASCADE;
TRUNCATE TABLE waitlist CASCADE;
TRUNCATE TABLE sync_state CASCADE;

-- 3. Re-enable triggers
SET session_replication_role = 'origin';

-- 4. Seed initial sync state (Restart from contract deployment)
INSERT INTO sync_state (id, last_processed_block)
VALUES ('indexer_main', 37979974)
ON CONFLICT (id) DO UPDATE SET last_processed_block = 37979974;

-- 5. Seed initial logic aliases (Required for bots to function)
INSERT INTO logic_aliases (alias_name, logic_id, is_active)
VALUES 
('ROCK_PAPER_SCISSORS', '0xf2f80f1811f9e2c534946f0e8ddbdbd5c1e23b6e48772afe3bccdb9f2e1cfdf3', true),
('POKER_BLITZ_V5', '0x61266711df04ebe17432b3482471e64c69150e370a9c558657b28944233b97d1', true)
ON CONFLICT (alias_name) DO UPDATE SET logic_id = EXCLUDED.logic_id;

-- 6. Reload Schema Cache
NOTIFY pgrst, 'reload schema';

-- DONE. Your database is now 100% clean and ready for a fresh start.
