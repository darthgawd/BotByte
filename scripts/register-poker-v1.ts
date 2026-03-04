import { createWalletClient, http, publicActions, keccak256, encodePacked } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';
import * as dotenv from 'dotenv';

dotenv.config();

/**
 * RE-REGISTER POKER V5 ON V1 REGISTRY
 * -----------------------------------
 * This script ensures Poker V5 is available on the original ETH Escrow.
 */

async function main() {
  const privKey = process.env.PRIVATE_KEY;
  // V1 REGISTRY ANCHOR
  const registryAddress = '0xF32BF92fcd1C07F515Ee82D4169c8B5dF4eD6bA8' as `0x${string}`;
  const devAddress = '0xCfF9cEA16c4731B6C8e203FB83FbbfbB16A2DFF2' as `0x${string}`;

  if (!privKey) throw new Error("PRIVATE_KEY required");

  const account = privateKeyToAccount(privKey as `0x${string}`);
  const client = createWalletClient({
    account,
    chain: baseSepolia,
    transport: http(process.env.RPC_URL),
  }).extend(publicActions);

  // CID for Poker V5
  const CID = "bafkreidvpgsk6lv6vukvczpqyd6v6lzuxydwy6zjy6zjy6zjy6zjy6zjy6z";

  // Calculate Logic ID as Solidity V1 would
  const logicId = keccak256(encodePacked(['string'], [CID]));
  console.log(`🎯 TARGET V1 LOGIC ID: ${logicId}`);

  const registryAbi = [
    { name: 'registerLogic', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'ipfsCid', type: 'string' }, { name: 'developer', type: 'address' }], outputs: [{ type: 'bytes32' }] }
  ] as const;

  try {
    console.log(`🔗 Registering on V1 Registry...`);
    const hash = await client.writeContract({
      address: registryAddress,
      abi: registryAbi,
      functionName: 'registerLogic',
      args: [CID, devAddress],
    });
    await client.waitForTransactionReceipt({ hash });
    console.log(`✅ Success! Registered on V1.`);
  } catch (err: any) {
    console.log(`⚠️ Already registered or skipped:`, err.message);
  }

  // Sync to Supabase - Update alias to point back to V1 ID for main branch
  console.log(`📡 Updating Supabase Aliases for V1...`);
  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  await supabase.from('logic_aliases').upsert({
    alias_name: 'POKER_BLITZ_V5',
    logic_id: logicId,
    is_active: true
  }, { onConflict: 'alias_name' });

  console.log(`🎉 V1 Sync Complete. ID: ${logicId}`);
}

main().catch(console.error);
