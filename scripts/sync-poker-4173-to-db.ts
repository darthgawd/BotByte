import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

/**
 * SYNC STABLE POKER (0x4173) TO SUPABASE
 * -------------------------------------
 */

async function main() {
  const supabase = createClient(
    process.env.SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  );

  const LOGIC_ID = '0x4173a4e2e54727578fd50a3f1e721827c4c97c3a2824ca469c0ec730d4264b43';
  const CID = 'bafkreiekzl2m3iezfwcn2izvbu5pjvp32zd3btiabhjkdbevklg7tq2tqm';
  const DEV_ADDR = "0xCfF9cEA16c4731B6C8e203FB83FbbfbB16A2DFF2".toLowerCase();

  console.log(`📡 Syncing Stable Poker (0x4173) to Supabase...`);

  // 1. Ensure Developer Profile exists
  await supabase.from('developer_profiles').upsert({ address: DEV_ADDR, nickname: 'Falken Architect' });

  // 2. Logic Submissions (Metadata)
  const { error: subErr } = await supabase
    .from('logic_submissions')
    .upsert({
      game_name: "Poker Blitz (Stable)",
      ipfs_cid: CID,
      developer_address: DEV_ADDR,
      status: 'APPROVED',
      description: "Proven 5-card draw poker logic."
    }, { onConflict: 'ipfs_cid' });

  if (subErr) {
    console.error('❌ Metadata Sync Failed:', subErr);
    return;
  }

  // 3. Logic Aliases (Discovery)
  const { error: aliasErr } = await supabase
    .from('logic_aliases')
    .upsert({
      alias_name: 'POKER_BLITZ',
      logic_id: LOGIC_ID,
      is_active: true
    }, { onConflict: 'alias_name' });

  if (aliasErr) {
    console.error('❌ Alias Sync Failed:', aliasErr);
  } else {
    console.log('✅ Stable Poker fully synchronized in database.');
  }
}

main().catch(console.error);
