import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import dotenv from 'dotenv';

dotenv.config();

/**
 * V3 ONE-CLICK DEPLOYER
 * --------------------
 * 1. Runs Forge Script to deploy V3 LogicRegistry and FiseEscrow.
 * 2. Parses the output for new addresses.
 * 3. Updates root .env and apps/dashboard/.env.
 */
async function deployV3() {
  console.log(chalk.blue.bold('\n🚀 Starting Falken V3 Deployment (USDC + Bytes32 + Multiplayer)...\n'));

  try {
    // 1. Run the Forge script
    console.log(chalk.yellow('Broadcasting to Base Sepolia...'));
    const output = execSync(
      'cd contracts && forge script script/Deploy.s.sol:DeployFalken --rpc-url $RPC_URL --broadcast',
      { stdio: 'pipe', env: process.env }
    ).toString();

    console.log(chalk.gray(output));

    // 2. Extract addresses using Regex
    const registryMatch = output.match(/LogicRegistry: (0x[a-fA-F0-9]{40})/i);
    const escrowMatch = output.match(/FiseEscrow: (0x[a-fA-F0-9]{40})/i);

    if (!registryMatch || !escrowMatch) {
      throw new Error('Could not parse contract addresses from forge output.');
    }

    const logicRegistryAddress = registryMatch[1];
    const escrowAddress = escrowMatch[1];

    console.log(chalk.green.bold('\n✅ Deployment Successful!'));
    console.log(chalk.white(`   - LogicRegistry: ${logicRegistryAddress}`));
    console.log(chalk.white(`   - FiseEscrow:    ${escrowAddress}\n`));

    // 3. Update .env files
    updateEnv('LOGIC_REGISTRY_ADDRESS', logicRegistryAddress);
    updateEnv('ESCROW_ADDRESS', escrowAddress);
    updateEnv('FISE_ESCROW_ADDRESS', escrowAddress); // Sync both for safety

    console.log(chalk.blue('\n🌍 Environment files synchronized. V3 is now active.'));

  } catch (err: any) {
    console.error(chalk.red('\n❌ Deployment Failed:'), err.message);
    process.exit(1);
  }
}

function updateEnv(key: string, value: string) {
  const envPaths = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), 'apps/dashboard/.env')
  ];

  envPaths.forEach(envPath => {
    if (!fs.existsSync(envPath)) return;

    let content = fs.readFileSync(envPath, 'utf8');
    
    // Update raw key (e.g. LOGIC_REGISTRY_ADDRESS)
    const rawRegex = new RegExp(`^${key}=.*`, 'm');
    if (rawRegex.test(content)) {
      content = content.replace(rawRegex, `${key}=${value}`);
    } else {
      content += `\n${key}=${value}`;
    }

    // Update NEXT_PUBLIC_ key for dashboard
    const nextKey = `NEXT_PUBLIC_${key}`;
    const nextRegex = new RegExp(`^${nextKey}=.*`, 'm');
    if (nextRegex.test(content)) {
      content = content.replace(nextRegex, `${nextKey}=${value}`);
    } else if (envPath.includes('dashboard')) {
      content += `\n${nextKey}=${value}`;
    }

    fs.writeFileSync(envPath, content, 'utf8');
    console.log(chalk.gray(`   - Updated ${key} in ${path.relative(process.cwd(), envPath)}`));
  });
}

deployV3().catch(console.error);
