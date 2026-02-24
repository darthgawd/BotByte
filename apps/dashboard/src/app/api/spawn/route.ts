import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { privateKeyToAccount } from 'viem/accounts';
import * as crypto from 'node:crypto';

// Server-side environment variables
const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || '' // Use service role for backend operations
);

const MASTER_ENCRYPTION_KEY = process.env.MASTER_ENCRYPTION_KEY || 'default_key_32_chars_for_dev_only_!!';

/**
 * Encrypts a private key using AES-256-GCM.
 */
function encryptKey(privateKey: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(MASTER_ENCRYPTION_KEY.slice(0, 32)), iv);
  let encrypted = cipher.update(privateKey, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

export async function POST(req: Request) {
  try {
    const { nickname, archetype, llmTier, managerAddress } = await req.json();

    if (!nickname || !archetype || !llmTier || !managerAddress) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    // 1. Generate Wallet
    const privKey = `0x${crypto.randomBytes(32).toString('hex')}` as `0x${string}`;
    const account = privateKeyToAccount(privKey);
    const encryptedKey = encryptKey(privKey);

    // 2. Find Manager ID
    const { data: manager, error: managerError } = await supabase
      .from('manager_profiles')
      .select('id')
      .eq('address', managerAddress.toLowerCase())
      .single();

    if (managerError || !manager) {
      return NextResponse.json({ error: 'Manager profile not found' }, { status: 404 });
    }

    // 3. Save to Hosted Agents
    const { error: spawnError } = await supabase.from('hosted_agents').insert({
      manager_id: manager.id,
      agent_address: account.address.toLowerCase(),
      encrypted_key: encryptedKey,
      nickname,
      archetype,
      llm_tier: llmTier,
      status: 'INACTIVE'
    });

    if (spawnError) {
      console.error('Spawn error:', spawnError);
      return NextResponse.json({ error: 'Failed to record spawned agent' }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true, 
      agentAddress: account.address, 
      nickname 
    });

  } catch (err: any) {
    console.error('API Error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
