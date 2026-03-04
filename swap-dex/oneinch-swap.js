/**
 * 1inch Aggregator Integration
 * Easiest way to get best swap rates across all DEXs
 */
import { createPublicClient, createWalletClient, http, parseUnits, formatUnits } from 'viem';
import { base } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';

// Base Mainnet Addresses
const TOKENS = {
  ETH: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', // 1inch uses this for ETH
  WETH: '0x4200000000000000000000000000000000000006',
  USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'
};

const ONE_INCH_API = 'https://api.1inch.dev/swap/v6.0/8453'; // 8453 = Base chain ID
const ONE_INCH_ROUTER = '0x111111125421ca6dc452d289314280a0f8842a65';

// Minimal ERC20 ABI
const ERC20_ABI = [
  { name: 'approve', type: 'function', inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ type: 'bool' }], stateMutability: 'nonpayable' },
  { name: 'allowance', type: 'function', inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' }
];

class OneInchSwapper {
  constructor(apiKey, rpcUrl, privateKey = null) {
    this.apiKey = apiKey;
    this.rpcUrl = rpcUrl;
    
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
   * Get swap quote from 1inch
   * @param {string} fromToken - From token address
   * @param {string} toToken - To token address
   * @param {string} amount - Amount in token units
   * @param {Object} options - Additional options
   */
  async getQuote(fromToken, toToken, amount, options = {}) {
    const params = new URLSearchParams({
      src: fromToken,
      dst: toToken,
      amount: amount,
      includeTokensInfo: 'true',
      includeProtocols: 'true',
      ...options
    });

    const response = await fetch(`${ONE_INCH_API}/quote?${params}`, {
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`1inch API error: ${error.description || error.message}`);
    }

    const data = await response.json();
    
    return {
      fromToken: data.srcToken,
      toToken: data.dstToken,
      fromAmount: data.srcAmount,
      toAmount: data.dstAmount,
      toAmountMin: data.dstAmount, // Can set slippage
      protocols: data.protocols,
      gas: data.gas,
      tx: data.tx // Transaction data if ready to swap
    };
  }

  /**
   * Build swap transaction
   * @param {string} fromToken - From token address
   * @param {string} toToken - To token address
   * @param {string} amount - Amount in token units
   * @param {number} slippage - Slippage tolerance in % (e.g., 1 for 1%)
   * @param {Object} options - Additional options
   */
  async buildSwap(fromToken, toToken, amount, slippage = 1, options = {}) {
    const params = new URLSearchParams({
      src: fromToken,
      dst: toToken,
      amount: amount,
      from: this.address,
      slippage: slippage.toString(),
      disableEstimate: 'false',
      allowPartialFill: 'false',
      ...options
    });

    const response = await fetch(`${ONE_INCH_API}/swap?${params}`, {
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`1inch API error: ${error.description || error.message}`);
    }

    const data = await response.json();
    
    return {
      fromToken: data.srcToken,
      toToken: data.dstToken,
      fromAmount: data.srcAmount,
      toAmount: data.dstAmount,
      tx: data.tx, // Transaction data to send
      protocols: data.protocols
    };
  }

  /**
   * Execute swap using 1inch
   * @param {string} fromToken - From token address
   * @param {string} toToken - To token address  
   * @param {string} amount - Amount in token units (e.g., "100" for 100 USDC)
   * @param {number} slippage - Slippage tolerance %
   */
  async executeSwap(fromToken, toToken, amount, slippage = 1) {
    if (!this.walletClient) throw new Error('Wallet not initialized');

    // If swapping from ERC20 (not ETH), approve first
    if (fromToken !== TOKENS.ETH) {
      const allowance = await this.publicClient.readContract({
        address: fromToken,
        abi: ERC20_ABI,
        functionName: 'allowance',
        args: [this.address, ONE_INCH_ROUTER]
      });

      const amountWei = BigInt(amount);
      
      if (allowance < amountWei) {
        console.log('Approving token...');
        const approveHash = await this.walletClient.writeContract({
          address: fromToken,
          abi: ERC20_ABI,
          functionName: 'approve',
          args: [ONE_INCH_ROUTER, amountWei * 10n]
        });
        console.log('Approval tx:', approveHash);
        
        // Wait for confirmation
        await this.publicClient.waitForTransactionReceipt({ hash: approveHash });
      }
    }

    // Get swap transaction data
    const swapData = await this.buildSwap(fromToken, toToken, amount, slippage);
    
    console.log('Swap quote:', {
      from: swapData.fromAmount,
      to: swapData.toAmount,
      protocols: swapData.protocols
    });

    // Execute the swap
    const hash = await this.walletClient.sendTransaction({
      to: swapData.tx.to,
      data: swapData.tx.data,
      value: BigInt(swapData.tx.value || 0),
      gas: BigInt(swapData.tx.gas || 300000)
    });

    console.log('Swap tx:', hash);
    return { hash, swapData };
  }

  /**
   * Quick swap: USDC → ETH
   */
  async swapUSDCtoETH(amountUSDC, slippage = 1) {
    // Convert amount to wei (6 decimals for USDC)
    const amountWei = parseUnits(amountUSDC, 6).toString();
    return await this.executeSwap(TOKENS.USDC, TOKENS.ETH, amountWei, slippage);
  }

  /**
   * Quick swap: ETH → USDC
   */
  async swapETHtoUSDC(amountETH, slippage = 1) {
    // Convert amount to wei (18 decimals for ETH)
    const amountWei = parseUnits(amountETH, 18).toString();
    return await this.executeSwap(TOKENS.ETH, TOKENS.USDC, amountWei, slippage);
  }
}

// Example usage
async function example() {
  const apiKey = process.env.ONE_INCH_API_KEY;
  const rpcUrl = process.env.RPC_URL || 'https://mainnet.base.org';
  
  if (!apiKey) {
    console.log('Please set ONE_INCH_API_KEY environment variable');
    console.log('Get your API key at: https://portal.1inch.dev/');
    return;
  }

  const swapper = new OneInchSwapper(apiKey, rpcUrl);

  // Get quote: 100 USDC → ETH
  console.log('Getting quote for 100 USDC → ETH...');
  const amountUSDC = parseUnits('100', 6).toString();
  const quote = await swapper.getQuote(TOKENS.USDC, TOKENS.ETH, amountUSDC);
  
  console.log('Quote result:');
  console.log('  From:', formatUnits(quote.fromAmount, 6), 'USDC');
  console.log('  To:', formatUnits(quote.toAmount, 18), 'ETH');
  console.log('  Protocols:', quote.protocols);
  console.log('  Gas estimate:', quote.gas);

  // Get quote: 0.1 ETH → USDC
  console.log('\nGetting quote for 0.1 ETH → USDC...');
  const amountETH = parseUnits('0.1', 18).toString();
  const quote2 = await swapper.getQuote(TOKENS.ETH, TOKENS.USDC, amountETH);
  
  console.log('Quote result:');
  console.log('  From:', formatUnits(quote2.fromAmount, 18), 'ETH');
  console.log('  To:', formatUnits(quote2.toAmount, 6), 'USDC');
  console.log('  Protocols:', quote2.protocols);
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  example().catch(console.error);
}

export { OneInchSwapper, TOKENS };
