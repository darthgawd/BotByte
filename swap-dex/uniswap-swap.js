/**
 * Uniswap V3 Direct Integration
 * Swap USDC ↔ ETH on Base Mainnet
 */
import { createPublicClient, createWalletClient, http, parseUnits, formatUnits } from 'viem';
import { base } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';

// Base Mainnet Addresses
const ADDRESSES = {
  WETH: '0x4200000000000000000000000000000000000006',
  USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  UNIVERSAL_ROUTER: '0x198EF79F1F515F02dFE9e3115eD9fC07183f02fC',
  QUOTER_V2: '0x3d4e44Eb1374240CE5F1B871ab261CD16335CB61',
  FACTORY: '0x33128a8fC17869897dcE68Ed026d694621f6FDfD'
};

// Token decimals
const DECIMALS = {
  WETH: 18,
  USDC: 6
};

// Minimal ERC20 ABI
const ERC20_ABI = [
  { name: 'approve', type: 'function', inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ type: 'bool' }], stateMutability: 'nonpayable' },
  { name: 'allowance', type: 'function', inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { name: 'balanceOf', type: 'function', inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' }
];

// Universal Router ABI (simplified)
const ROUTER_ABI = [
  {
    name: 'execute',
    type: 'function',
    inputs: [
      { name: 'commands', type: 'bytes' },
      { name: 'inputs', type: 'bytes[]' }
    ],
    outputs: [],
    stateMutability: 'payable'
  }
];

// Quoter ABI for getting swap quotes
const QUOTER_ABI = [
  {
    name: 'quoteExactInputSingle',
    type: 'function',
    inputs: [
      { name: 'tokenIn', type: 'address' },
      { name: 'tokenOut', type: 'address' },
      { name: 'fee', type: 'uint24' },
      { name: 'amountIn', type: 'uint256' },
      { name: 'sqrtPriceLimitX96', type: 'uint160' }
    ],
    outputs: [
      { name: 'amountOut', type: 'uint256' },
      { name: 'sqrtPriceX96After', type: 'uint160' },
      { name: 'initializedTicksCrossed', type: 'uint32' },
      { name: 'gasEstimate', type: 'uint256' }
    ],
    stateMutability: 'nonpayable'
  }
];

class UniswapSwapper {
  constructor(rpcUrl, privateKey = null) {
    this.publicClient = createPublicClient({
      chain: base,
      transport: http(rpcUrl)
    });

    if (privateKey) {
      const account = privateKeyToAccount(privateKey);
      this.walletClient = createWalletClient({
        account,
        chain: base,
        transport: http(rpcUrl)
      });
      this.address = account.address;
    }
  }

  /**
   * Get quote for exact input swap
   * @param {string} tokenIn - Input token address
   * @param {string} tokenOut - Output token address  
   * @param {string} amountIn - Input amount (in token units, e.g., "100" for 100 USDC)
   * @param {number} fee - Pool fee tier (500 = 0.05%, 3000 = 0.3%, 10000 = 1%)
   */
  async getQuote(tokenIn, tokenOut, amountIn, fee = 500) {
    const decimals = tokenIn === ADDRESSES.USDC ? DECIMALS.USDC : DECIMALS.WETH;
    const amountInWei = parseUnits(amountIn, decimals);

    try {
      const result = await this.publicClient.simulateContract({
        address: ADDRESSES.QUOTER_V2,
        abi: QUOTER_ABI,
        functionName: 'quoteExactInputSingle',
        args: [
          tokenIn,
          tokenOut,
          fee,
          amountInWei,
          0 // sqrtPriceLimitX96 (0 = no limit)
        ]
      });

      const amountOut = result.result[0];
      const outDecimals = tokenOut === ADDRESSES.USDC ? DECIMALS.USDC : DECIMALS.WETH;
      
      return {
        amountIn,
        amountOut: formatUnits(amountOut, outDecimals),
        amountOutWei: amountOut,
        fee
      };
    } catch (error) {
      console.error('Quote failed:', error.message);
      throw error;
    }
  }

  /**
   * Check token allowance
   */
  async getAllowance(tokenAddress, ownerAddress, spenderAddress) {
    return await this.publicClient.readContract({
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName: 'allowance',
      args: [ownerAddress, spenderAddress]
    });
  }

  /**
   * Approve token spending
   */
  async approveToken(tokenAddress, spenderAddress, amount) {
    const hash = await this.walletClient.writeContract({
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [spenderAddress, amount]
    });
    
    console.log('Approval tx:', hash);
    return hash;
  }

  /**
   * Execute swap: USDC → ETH
   * @param {string} amountIn - USDC amount (e.g., "100" for 100 USDC)
   * @param {string} minAmountOut - Minimum ETH to receive (slippage protection)
   * @param {number} fee - Pool fee tier
   */
  async swapUSDCtoETH(amountIn, minAmountOut, fee = 500) {
    if (!this.walletClient) throw new Error('Wallet not initialized');

    const amountInWei = parseUnits(amountIn, DECIMALS.USDC);
    const minOutWei = parseUnits(minAmountOut, DECIMALS.WETH);

    // Check and approve USDC if needed
    const allowance = await this.getAllowance(
      ADDRESSES.USDC,
      this.address,
      ADDRESSES.UNIVERSAL_ROUTER
    );

    if (allowance < amountInWei) {
      console.log('Approving USDC...');
      await this.approveToken(
        ADDRESSES.USDC,
        ADDRESSES.UNIVERSAL_ROUTER,
        amountInWei * 10n // Approve 10x for future swaps
      );
    }

    // Build swap commands
    const commands = '0x01'; // V3_SWAP_EXACT_IN
    
    // Encode swap parameters
    const inputs = [this.encodeV3SwapExactIn(
      this.address, // recipient
      amountInWei,
      minOutWei,
      [{
        tokenIn: ADDRESSES.USDC,
        tokenOut: ADDRESSES.WETH,
        fee: fee,
        recipient: this.address
      }],
      true // unwrap WETH to ETH
    )];

    const hash = await this.walletClient.writeContract({
      address: ADDRESSES.UNIVERSAL_ROUTER,
      abi: ROUTER_ABI,
      functionName: 'execute',
      args: [commands, inputs],
      value: 0n // Not sending ETH
    });

    console.log('Swap tx:', hash);
    return hash;
  }

  /**
   * Execute swap: ETH → USDC
   * @param {string} amountIn - ETH amount (e.g., "0.1" for 0.1 ETH)
   * @param {string} minAmountOut - Minimum USDC to receive
   * @param {number} fee - Pool fee tier
   */
  async swapETHtoUSDC(amountIn, minAmountOut, fee = 500) {
    if (!this.walletClient) throw new Error('Wallet not initialized');

    const amountInWei = parseUnits(amountIn, DECIMALS.WETH);
    const minOutWei = parseUnits(minAmountOut, DECIMALS.USDC);

    // Build swap commands
    const commands = '0x01'; // V3_SWAP_EXACT_IN

    const inputs = [this.encodeV3SwapExactIn(
      this.address,
      amountInWei,
      minOutWei,
      [{
        tokenIn: ADDRESSES.WETH,
        tokenOut: ADDRESSES.USDC,
        fee: fee,
        recipient: this.address
      }],
      false // don't unwrap
    )];

    const hash = await this.walletClient.writeContract({
      address: ADDRESSES.UNIVERSAL_ROUTER,
      abi: ROUTER_ABI,
      functionName: 'execute',
      args: [commands, inputs],
      value: amountInWei // Sending ETH
    });

    console.log('Swap tx:', hash);
    return hash;
  }

  /**
   * Encode V3 swap parameters
   */
  encodeV3SwapExactIn(recipient, amountIn, amountOutMin, path, unwrapWETH) {
    // Simplified encoding - in production use @uniswap/v3-sdk
    const encodedPath = this.encodePath(path);
    
    // ABI encode: (address recipient, uint256 amountIn, uint256 amountOutMin, bytes path, bool payerIsUser)
    // This is simplified - use proper ABI encoding in production
    return `0x${recipient.slice(2).padStart(64, '0')}${amountIn.toString(16).padStart(64, '0')}${amountOutMin.toString(16).padStart(64, '0')}${encodedPath}${unwrapWETH ? '01' : '00'}`;
  }

  encodePath(pools) {
    // Encode pool path for Uniswap V3
    // In production, use @uniswap/v3-sdk Path.encodePath()
    let path = pools[0].tokenIn.slice(2);
    for (const pool of pools) {
      const feeHex = pool.fee.toString(16).padStart(6, '0');
      path += feeHex + pool.tokenOut.slice(2);
    }
    return path;
  }
}

// Example usage
async function example() {
  const rpcUrl = process.env.RPC_URL || 'https://mainnet.base.org';
  
  const swapper = new UniswapSwapper(rpcUrl);

  // Get quote: 100 USDC → ETH
  console.log('Getting quote for 100 USDC → ETH...');
  const quote1 = await swapper.getQuote(
    ADDRESSES.USDC,
    ADDRESSES.WETH,
    '100',
    500 // 0.05% fee tier
  );
  console.log('Quote:', quote1);

  // Get quote: 0.1 ETH → USDC
  console.log('\nGetting quote for 0.1 ETH → USDC...');
  const quote2 = await swapper.getQuote(
    ADDRESSES.WETH,
    ADDRESSES.USDC,
    '0.1',
    500
  );
  console.log('Quote:', quote2);
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  example().catch(console.error);
}

export { UniswapSwapper, ADDRESSES };
