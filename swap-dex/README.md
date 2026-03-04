# Swap DEX Integration

Two approaches to integrate swapping into your platform:

## Approach 1: Uniswap Integration (Recommended)
Direct integration with Uniswap v3 contracts. Users swap through Uniswap but on your UI.

**Pros:**
- Full control over UX
- Direct contract interaction
- No middleman fees

**Cons:**
- Need to handle quotes/routing yourself

## Approach 2: 1inch Aggregator (Easiest)
Use 1inch API to get best rates across all DEXs.

**Pros:**
- Best rates automatically
- Simple API integration
- Handles complex routing

**Cons:**
- Dependency on 1inch service
- Possible API rate limits

## Quick Start

```bash
npm install
# Set your RPC URL in .env
node example-uniswap.js
node example-1inch.js
```

## Environment Variables

```env
RPC_URL=https://base-mainnet.g.alchemy.com/v2/YOUR_KEY
PRIVATE_KEY=0x... # For testing only
```

## Base Mainnet Addresses

| Token | Address |
|-------|---------|
| WETH | `0x4200000000000000000000000000000000000006` |
| USDC | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` |
| Uniswap V3 Router | `0x2626664c2603336E57B271c5C0b26F421741e481` |
