/**
 * React Component: Swap Interface
 * 
 * Uses wagmi/viem for wallet connection and 1inch for swap routing
 * 
 * Installation:
 * npm install wagmi viem @tanstack/react-query
 */

import React, { useState, useEffect, useCallback } from 'react';
import { 
  useAccount, 
  useWriteContract, 
  useReadContract,
  useWaitForTransactionReceipt 
} from 'wagmi';
import { parseUnits, formatUnits } from 'viem';
import { base } from 'viem/chains';

// Token addresses on Base
const TOKENS = {
  ETH: { 
    address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
    symbol: 'ETH', 
    decimals: 18,
    logo: 'https://cryptologos.cc/logos/ethereum-eth-logo.png'
  },
  WETH: {
    address: '0x4200000000000000000000000000000000000006',
    symbol: 'WETH',
    decimals: 18,
    logo: 'https://cryptologos.cc/logos/ethereum-eth-logo.png'
  },
  USDC: { 
    address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    symbol: 'USDC', 
    decimals: 6,
    logo: 'https://cryptologos.cc/logos/usd-coin-usdc-logo.png'
  }
};

const ONE_INCH_API = 'https://api.1inch.dev/swap/v6.0/8453';
const ONE_INCH_ROUTER = '0x111111125421ca6dc452d289314280a0f8842a65';

const ERC20_ABI = [
  {
    name: 'approve',
    type: 'function',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' }
    ],
    outputs: [{ type: 'bool' }],
    stateMutability: 'nonpayable'
  },
  {
    name: 'allowance',
    type: 'function',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' }
    ],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view'
  },
  {
    name: 'balanceOf',
    type: 'function',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view'
  },
  {
    name: 'decimals',
    type: 'function',
    inputs: [],
    outputs: [{ type: 'uint8' }],
    stateMutability: 'view'
  }
];

// Custom hook for swap functionality
function useSwap(oneInchApiKey) {
  const { address } = useAccount();
  const [quote, setQuote] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const getQuote = useCallback(async (fromToken, toToken, amount) => {
    if (!amount || parseFloat(amount) <= 0) {
      setQuote(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        src: fromToken.address,
        dst: toToken.address,
        amount: parseUnits(amount, fromToken.decimals).toString(),
        includeTokensInfo: 'true'
      });

      const response = await fetch(`${ONE_INCH_API}/quote?${params}`, {
        headers: {
          'Authorization': `Bearer ${oneInchApiKey}`,
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.description || 'Failed to get quote');
      }

      const data = await response.json();
      
      setQuote({
        fromAmount: amount,
        toAmount: formatUnits(data.dstAmount, toToken.decimals),
        toAmountRaw: data.dstAmount,
        gas: data.gas,
        protocols: data.protocols
      });
    } catch (err) {
      setError(err.message);
      setQuote(null);
    } finally {
      setLoading(false);
    }
  }, [oneInchApiKey]);

  return { quote, loading, error, getQuote };
}

// Main Swap Component
export function SwapCard({ oneInchApiKey }) {
  const { address, isConnected } = useAccount();
  const [fromToken, setFromToken] = useState(TOKENS.USDC);
  const [toToken, setToToken] = useState(TOKENS.ETH);
  const [amount, setAmount] = useState('');
  const [slippage, setSlippage] = useState(1);
  const [swapTx, setSwapTx] = useState(null);
  
  const { quote, loading, error, getQuote } = useSwap(oneInchApiKey);

  // Debounced quote fetching
  useEffect(() => {
    const timeout = setTimeout(() => {
      getQuote(fromToken, toToken, amount);
    }, 500);

    return () => clearTimeout(timeout);
  }, [amount, fromToken, toToken, getQuote]);

  // Token balance
  const { data: balance } = useReadContract({
    address: fromToken.address !== TOKENS.ETH.address ? fromToken.address : undefined,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: {
      enabled: !!address && fromToken.address !== TOKENS.ETH.address
    }
  });

  // Token allowance
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: fromToken.address !== TOKENS.ETH.address ? fromToken.address : undefined,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: address ? [address, ONE_INCH_ROUTER] : undefined,
    query: {
      enabled: !!address && fromToken.address !== TOKENS.ETH.address
    }
  });

  // Approval
  const { writeContract: approve, data: approveHash } = useWriteContract();
  const { isSuccess: isApproved } = useWaitForTransactionReceipt({ hash: approveHash });

  useEffect(() => {
    if (isApproved) {
      refetchAllowance();
    }
  }, [isApproved, refetchAllowance]);

  const handleSwap = async () => {
    if (!address || !quote) return;

    try {
      // Check if approval needed for ERC20
      if (fromToken.address !== TOKENS.ETH.address) {
        const amountWei = parseUnits(amount, fromToken.decimals);
        if (!allowance || allowance < amountWei) {
          approve({
            address: fromToken.address,
            abi: ERC20_ABI,
            functionName: 'approve',
            args: [ONE_INCH_ROUTER, amountWei * 10n]
          });
          return;
        }
      }

      // Get swap transaction data
      const params = new URLSearchParams({
        src: fromToken.address,
        dst: toToken.address,
        amount: parseUnits(amount, fromToken.decimals).toString(),
        from: address,
        slippage: slippage.toString(),
        disableEstimate: 'false'
      });

      const response = await fetch(`${ONE_INCH_API}/swap?${params}`, {
        headers: {
          'Authorization': `Bearer ${oneInchApiKey}`,
          'Accept': 'application/json'
        }
      });

      const data = await response.json();
      
      // Send transaction using wagmi
      // This would typically use useSendTransaction hook
      // For now, just store the tx data
      setSwapTx(data.tx);
      
    } catch (err) {
      console.error('Swap failed:', err);
    }
  };

  const switchTokens = () => {
    setFromToken(toToken);
    setToToken(fromToken);
    setAmount('');
  };

  const needsApproval = fromToken.address !== TOKENS.ETH.address && 
    allowance !== undefined && 
    parseUnits(amount || '0', fromToken.decimals) > (allowance || 0n);

  const formattedBalance = balance ? formatUnits(balance, fromToken.decimals) : '0';

  return (
    <div className="swap-card" style={styles.card}>
      <h2 style={styles.title}>Swap</h2>

      {/* From Token */}
      <div style={styles.inputContainer}>
        <div style={styles.inputHeader}>
          <span>From</span>
          <span style={styles.balance}>
            Balance: {parseFloat(formattedBalance).toFixed(4)} {fromToken.symbol}
          </span>
        </div>
        <div style={styles.inputRow}>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.0"
            style={styles.input}
          />
          <TokenSelect 
            token={fromToken} 
            onSelect={setFromToken}
            exclude={toToken}
          />
        </div>
      </div>

      {/* Switch Button */}
      <button onClick={switchTokens} style={styles.switchBtn}>
        ↓
      </button>

      {/* To Token */}
      <div style={styles.inputContainer}>
        <div style={styles.inputHeader}>
          <span>To</span>
        </div>
        <div style={styles.inputRow}>
          <input
            type="text"
            value={quote ? parseFloat(quote.toAmount).toFixed(6) : ''}
            readOnly
            placeholder="0.0"
            style={{ ...styles.input, background: '#f5f5f5' }}
          />
          <TokenSelect 
            token={toToken} 
            onSelect={setToToken}
            exclude={fromToken}
          />
        </div>
      </div>

      {/* Quote Info */}
      {quote && (
        <div style={styles.quoteInfo}>
          <div style={styles.quoteRow}>
            <span>Rate</span>
            <span>
              1 {fromToken.symbol} ≈ {' '}
              {(parseFloat(quote.toAmount) / parseFloat(quote.fromAmount)).toFixed(6)} {' '}
              {toToken.symbol}
            </span>
          </div>
          <div style={styles.quoteRow}>
            <span>Network Fee</span>
            <span>~${(quote.gas * 0.01).toFixed(2)}</span>
          </div>
          <div style={styles.quoteRow}>
            <span>Slippage</span>
            <select 
              value={slippage} 
              onChange={(e) => setSlippage(Number(e.target.value))}
              style={styles.slippageSelect}
            >
              <option value={0.5}>0.5%</option>
              <option value={1}>1.0%</option>
              <option value={2}>2.0%</option>
              <option value={3}>3.0%</option>
            </select>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={styles.error}>{error}</div>
      )}

      {/* Action Button */}
      {!isConnected ? (
        <button disabled style={styles.buttonDisabled}>
          Connect Wallet
        </button>
      ) : needsApproval ? (
        <button onClick={handleSwap} style={styles.buttonPrimary}>
          Approve {fromToken.symbol}
        </button>
      ) : (
        <button 
          onClick={handleSwap}
          disabled={!quote || loading}
          style={!quote || loading ? styles.buttonDisabled : styles.buttonPrimary}
        >
          {loading ? 'Loading...' : 'Swap'}
        </button>
      )}
    </div>
  );
}

// Token Selector Component
function TokenSelect({ token, onSelect, exclude }) {
  const [open, setOpen] = useState(false);

  const tokens = Object.values(TOKENS).filter(t => t.address !== exclude.address);

  return (
    <div style={styles.tokenSelect}>
      <button 
        onClick={() => setOpen(!open)}
        style={styles.tokenButton}
      >
        <img src={token.logo} alt={token.symbol} style={styles.tokenLogo} />
        {token.symbol}
        <span style={styles.chevron}>▼</span>
      </button>

      {open && (
        <div style={styles.tokenDropdown}>
          {tokens.map(t => (
            <button
              key={t.address}
              onClick={() => { onSelect(t); setOpen(false); }}
              style={styles.tokenOption}
            >
              <img src={t.logo} alt={t.symbol} style={styles.tokenLogo} />
              {t.symbol}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Styles
const styles = {
  card: {
    background: 'white',
    borderRadius: '16px',
    padding: '24px',
    width: '100%',
    maxWidth: '420px',
    boxShadow: '0 4px 20px rgba(0,0,0,0.1)'
  },
  title: {
    margin: '0 0 20px 0',
    fontSize: '20px',
    fontWeight: '600'
  },
  inputContainer: {
    background: '#f7f8fa',
    borderRadius: '12px',
    padding: '16px',
    marginBottom: '8px'
  },
  inputHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '14px',
    color: '#666',
    marginBottom: '8px'
  },
  balance: {
    cursor: 'pointer',
    color: '#007bff'
  },
  inputRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px'
  },
  input: {
    flex: 1,
    border: 'none',
    background: 'transparent',
    fontSize: '28px',
    fontWeight: '500',
    outline: 'none',
    width: '100%'
  },
  tokenSelect: {
    position: 'relative'
  },
  tokenButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    background: 'white',
    border: '1px solid #e0e0e0',
    borderRadius: '20px',
    padding: '8px 16px',
    cursor: 'pointer',
    fontSize: '16px',
    fontWeight: '600'
  },
  tokenLogo: {
    width: '24px',
    height: '24px',
    borderRadius: '50%'
  },
  chevron: {
    fontSize: '12px',
    marginLeft: '4px'
  },
  tokenDropdown: {
    position: 'absolute',
    top: '100%',
    right: 0,
    marginTop: '8px',
    background: 'white',
    border: '1px solid #e0e0e0',
    borderRadius: '12px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
    zIndex: 10,
    minWidth: '150px'
  },
  tokenOption: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    width: '100%',
    padding: '12px 16px',
    border: 'none',
    background: 'transparent',
    cursor: 'pointer',
    textAlign: 'left',
    fontSize: '16px'
  },
  switchBtn: {
    display: 'block',
    margin: '-4px auto',
    width: '40px',
    height: '40px',
    borderRadius: '50%',
    border: '4px solid white',
    background: '#f7f8fa',
    cursor: 'pointer',
    fontSize: '16px',
    color: '#666',
    zIndex: 1,
    position: 'relative'
  },
  quoteInfo: {
    marginTop: '16px',
    padding: '16px',
    background: '#f7f8fa',
    borderRadius: '12px'
  },
  quoteRow: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '14px',
    marginBottom: '8px'
  },
  slippageSelect: {
    border: 'none',
    background: 'transparent',
    fontSize: '14px',
    cursor: 'pointer'
  },
  error: {
    marginTop: '16px',
    padding: '12px',
    background: '#fee',
    color: '#c33',
    borderRadius: '8px',
    fontSize: '14px'
  },
  buttonPrimary: {
    width: '100%',
    marginTop: '16px',
    padding: '16px',
    background: '#007bff',
    color: 'white',
    border: 'none',
    borderRadius: '12px',
    fontSize: '18px',
    fontWeight: '600',
    cursor: 'pointer'
  },
  buttonDisabled: {
    width: '100%',
    marginTop: '16px',
    padding: '16px',
    background: '#e0e0e0',
    color: '#999',
    border: 'none',
    borderRadius: '12px',
    fontSize: '18px',
    fontWeight: '600',
    cursor: 'not-allowed'
  }
};

export default SwapCard;
