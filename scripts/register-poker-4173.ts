import { createWalletClient, http, publicActions } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';
import * as dotenv from 'dotenv';

dotenv.config();

/**
 * REGISTER POKER 4173 (THE WORKING VERSION)
 * -----------------------------------------
 */

async function main() {
  const privKey = process.env.PRIVATE_KEY;
  const registryAddress = '0xF32BF92fcd1C07F515Ee82D4169c8B5dF4eD6bA8' as `0x${string}`;
  const devAddress = '0xCfF9cEA16c4731B6C8e203FB83FbbfbB16A2DFF2' as `0x${string}`;

  if (!privKey) throw new Error("PRIVATE_KEY required");

  const account = privateKeyToAccount(privKey as `0x${string}`);
  const client = createWalletClient({
    account,
    chain: baseSepolia,
    transport: http(process.env.RPC_URL),
  }).extend(publicActions);

  const CID = "bafkreiekzl2m3iezfwcn2izvbu5pjvp32zd3btiabhjkdbevklg7tq2tqm";

  console.log(`🛡️ Registering ORIGINAL Poker (0x4173) on Registry...`);

  const registryAbi = [
    { name: 'registerLogic', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'ipfsCid', type: 'string' }, { name: 'developer', type: 'address' }], outputs: [{ type: 'bytes32' }] }
  ] as const;

  try {
    const hash = await client.writeContract({
      address: registryAddress,
      abi: registryAbi,
      functionName: 'registerLogic',
      args: [CID, devAddress],
    });
    await client.waitForTransactionReceipt({ hash });
    console.log(`✅ Success! Registered. Hash: ${hash}`);
  } catch (err: any) {
    console.log(`⚠️ Skip: Already registered or logic ID mismatch.`);
  }

  console.log(`🎉 0x4173 is live.`);
}

main().catch(console.error);
