-- ===============================================================
-- FALKEN PROTOCOL: V3 CONSOLIDATED MASTER SETUP
-- Architecture: USDC + Bytes32 + Multiplayer + Soft-Chain
-- ===============================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. MANAGER PROFILES
CREATE TABLE IF NOT EXISTS manager_profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    address TEXT UNIQUE NOT NULL,
    nickname TEXT UNIQUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_login TIMESTAMPTZ DEFAULT NOW()
);

-- 3. AGENT PROFILES
CREATE TABLE IF NOT EXISTS agent_profiles (
    address TEXT PRIMARY KEY,
    nickname TEXT,
    elo INT DEFAULT 1200,
    wins INT DEFAULT 0,
    losses INT DEFAULT 0,
    draws INT DEFAULT 0,
    last_active TIMESTAMPTZ DEFAULT NOW(),
    manager_id UUID REFERENCES manager_profiles(id),
    identity_signature TEXT,
    identity_message TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. MATCHES (V3 Multiplayer & Bytes32)
CREATE TABLE IF NOT EXISTS matches (
    match_id TEXT PRIMARY KEY, 
    players TEXT[] DEFAULT '{}',
    stake_wei NUMERIC NOT NULL,
    total_pot NUMERIC DEFAULT 0,
    game_logic TEXT NOT NULL, 
    wins INT[] DEFAULT '{}',
    current_round INT DEFAULT 1,
    phase TEXT DEFAULT 'COMMIT',
    status TEXT DEFAULT 'OPEN',
    winner TEXT,
    winner_index INT,
    is_fise BOOLEAN DEFAULT TRUE,
    is_soft_chain BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    settle_tx_hash TEXT
);

-- 5. ROUNDS
CREATE TABLE IF NOT EXISTS rounds (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    match_id TEXT REFERENCES matches(match_id) ON DELETE CASCADE,
    round_number INT NOT NULL,
    player_address TEXT NOT NULL,
    move INT,
    salt TEXT,
    revealed BOOLEAN DEFAULT FALSE,
    winner INT,
    commit_tx_hash TEXT,
    reveal_tx_hash TEXT,
    state_description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. SOFT MOVES (Gasless Arena)
CREATE TABLE IF NOT EXISTS soft_moves (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    match_id TEXT NOT NULL,
    round_number INT NOT NULL,
    player_address TEXT NOT NULL,
    move_value TEXT NOT NULL,
    salt TEXT NOT NULL,
    signature TEXT NOT NULL,
    processed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(match_id, round_number, player_address)
);

-- 7. LOGIC REGISTRY & APP STORE
CREATE TABLE IF NOT EXISTS logic_submissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    game_name TEXT UNIQUE NOT NULL,
    ipfs_cid TEXT NOT NULL,
    developer_address TEXT NOT NULL,
    status TEXT DEFAULT 'PENDING',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS logic_aliases (
    logic_id TEXT PRIMARY KEY,
    alias_name TEXT UNIQUE,
    is_active BOOLEAN DEFAULT TRUE,
    is_verified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. AGENT DIRECTIVES (Overrides)
CREATE TABLE IF NOT EXISTS agent_directives (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_address TEXT NOT NULL,
    command TEXT NOT NULL,
    payload JSONB,
    status TEXT DEFAULT 'PENDING',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL
);

-- 9. API KEYS
CREATE TABLE IF NOT EXISTS api_keys (
    key_hash TEXT PRIMARY KEY,
    manager_id UUID REFERENCES manager_profiles(id),
    name TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 10. REALTIME & SECURITY
ALTER TABLE matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE soft_moves ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public Read All" ON matches FOR SELECT TO public USING (true);
CREATE POLICY "Public Read Rounds" ON rounds FOR SELECT TO public USING (true);
CREATE POLICY "Public Read Agents" ON agent_profiles FOR SELECT TO public USING (true);
CREATE POLICY "Public Read Soft" ON soft_moves FOR SELECT TO public USING (true);

-- Realtime Publication
DROP PUBLICATION IF EXISTS supabase_realtime;
CREATE PUBLICATION supabase_realtime;
ALTER PUBLICATION supabase_realtime ADD TABLE matches, rounds, agent_profiles, soft_moves, agent_directives;

-- Seed Data
INSERT INTO logic_aliases (logic_id, alias_name, is_verified) 
VALUES ('0x4173a4e2e54727578fd50a3f1e721827c4c97c3a2824ca469c0ec730d4264b43', 'Poker Blitz', true)
ON CONFLICT DO NOTHING;
