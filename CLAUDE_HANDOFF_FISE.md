# FISE Auto-Settlement Handoff

**Date:** 2026-02-27  
**Status:** HouseBot not committing to active matches / Falken VM JS execution bug

---

## What's Working

### 1. Smart Contract Fixes (DEPLOYED: 0xE155B0F15dfB5D65364bca23a08501c7384eb737)

**Multiple Match Creation Bug - FIXED**
- File: `packages/house-bot/src/HouseBot.ts`
- Added `waitingMatchesByLogic` tracking to prevent Joshua from creating new matches when he has an active match waiting for opponent

**Reveal Revert (Invalid Move) - FIXED**
- File: `contracts/src/core/MatchEscrow.sol`
- Added check: `if (m.gameLogic != address(this))` before `isValidMove()` call
- FISE matches now skip on-chain move validation since moves are validated by JS

**_resolveRound Override - FIXED**
- File: `contracts/src/core/FiseEscrow.sol`
- Override prevents on-chain resolution for FISE matches
- Emits `RoundResolved(matchId, m.currentRound, 0)` and returns

**Hash Calculation - FIXED**
- Both HouseBot and ReferenceAgent now use `uint256` for round/move in hash calculation
- Format: `["FALKEN_V1", escrow, matchId, round, player, move, salt]`

**Indexer Sync - FIXED**
- Reset sync_state to block 38241300
- Now syncing events to Supabase properly

### 2. Manual Settlement Working
- Matches #1-4 settled successfully via manual `settleFiseMatch()` calls
- Joshua won matches #2 and #4

### 3. Falken VM Detection Working
- Watcher correctly detects `MatchCreated` and `MoveRevealed` events
- Successfully fetches JS logic from IPFS

---

## Current State

### Active Matches
- **Match 7:** Joshua (playerA), Referee (playerB), status=Active, needs commit
- **Match 8:** Joshua (playerA), Referee (playerB), status=Active, needs commit  
- **Match 9:** Likely created by HouseBot (unknown state)

### Addresses
- Escrow: `0xE155B0F15dfB5D65364bca23a08501c7384eb737`
- HouseBot (Joshua): `0xb63ec09e541bc2ef1bf2bb4212fc54a6dac0c5f4`
- Referee: `0xCfF9cEA16c4731B6C8e203FB83FbbfbB16A2DFF2`
- IPFS CID: `QmcaiTUUvVHQ6oLz61R2AYbaZMJPmZYeoN3N4cBxuXSXQs`

---

## Current Blockers

### Blocker 1: HouseBot Not Committing to Active Matches

**Symptoms:**
- HouseBot detects match 8 as active: `"Pulse: Active match detected, processing moves"`
- Calls `playMatch(i, mData)` but no commit happens
- HouseBot log shows it's detecting the match but not sending commit transactions

**Relevant Code:**
- `packages/house-bot/src/HouseBot.ts:420` - `playMatch()` function
- `packages/house-bot/src/HouseBot.ts:202-218` - Active match handling

**To Debug:**
```bash
# Check HouseBot logs
tail -100 /tmp/housebot_final.log | grep -A10 "matchId.*8"

# Check playMatch function logic
grep -A80 "async playMatch" packages/house-bot/src/HouseBot.ts
```

### Blocker 2: Falken VM JS Execution Bug (CRITICAL)

**Symptoms:**
- Falken VM detects reveals but fails to execute JS game logic
- Error: `Unexpected token 'export'` on minified JS containing `export{n as default}`

**Root Cause:**
- `packages/falken-vm/src/Referee.ts` regex doesn't handle minified export syntax
- Current regex: `.replace(/export\s*\{[^}]*\};?/g, '')` doesn't match `export{n as default}`

**Current Transform Code (Referee.ts):**
```typescript
const transformedCode = jsCode
  // Replace export default class with module.exports
  .replace(/export\s+default\s+class\s+(\w+)/g, 'class $1; module.exports = $1;')
  // Replace export class with class + module.exports  
  .replace(/export\s+class\s+(\w+)/g, 'class $1; module.exports = $1;')
  // Handle minified export (NOT WORKING - needs fix)
  .replace(/export\s*\{[^}]*\};?/g, '')
  .replace(/export\s+/g, '');
```

**IPFS Content:**
- CID: `QmcaiTUUvVHQ6oLz61R2AYbaZMJPmZYeoN3N4cBxuXSXQs`
- URL: https://ipfs.io/ipfs/QmcaiTUUvVHQ6oLz61R2AYbaZMJPmZYeoN3N4cBxuXSXQs
- Contains minified JS with `export{n as default}` syntax

**To Test Fix:**
```bash
# Fetch the actual JS
curl -s https://ipfs.io/ipfs/QmcaiTUUvVHQ6oLz61R2AYbaZMJPmZYeoN3N4cBxuXSXQs

# Test the transform in Node.js
node -e "
const code = '...paste minified code here...';
const transformed = code
  .replace(/export\s*\{\s*(\w+)\s+as\s+default\s*\}/g, 'module.exports = \$1;')
  .replace(/export\s+default\s+(\w+)/g, 'module.exports = \$1;');
console.log(transformed);
"
```

---

## Next Steps

### Priority 1: Fix HouseBot Commit Issue
1. Examine `playMatch()` function to see why it's not committing
2. Check if the bot correctly detects phase=0 (commit phase)
3. Verify salt generation and hash calculation
4. Add debug logging if needed

### Priority 2: Fix Falken VM JS Transform
1. Update regex in `packages/falken-vm/src/Referee.ts` to handle `export{n as default}`
2. Test with actual IPFS content
3. Ensure VM can execute game logic and determine winner

### Priority 3: Complete End-to-End Test
1. Both bots commit to match
2. Both bots reveal
3. Falken VM detects reveal → fetches JS → executes → calls settleFiseMatch
4. Match completes with correct winner

---

## Architecture Summary

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│  HouseBot   │────▶│  MatchEscrow │────▶│   Events    │
│ (Joshua)    │     │  (FISE Mode) │     │             │
└─────────────┘     └──────────────┘     └──────┬──────┘
       │                                        │
       │    ┌──────────────┐                    │
       └───▶│ ReferenceAgent│◀───────────────────┘
            │ (SimpleAgent) │
            └───────────────┘
                          │
                          ▼
                   ┌─────────────┐
                   │  Falken VM  │
                   │  (Referee)  │
                   └──────┬──────┘
                          │
                          ▼
                   ┌─────────────┐
                   │  IPFS/JS    │
                   │  Game Logic │
                   └─────────────┘
```

**Flow:**
1. HouseBot creates FISE match (status=Open)
2. ReferenceAgent joins match (status=Active)
3. Both bots commit (phase=Committed)
4. Both bots reveal (phase=Revealed)
5. Falken VM detects MoveRevealed event
6. Falken VM fetches JS from IPFS
7. Falken VM executes JS to determine winner
8. Falken VM calls settleFiseMatch()
9. Winner receives payout

---

## Logs Location

- HouseBot: `/tmp/housebot_final.log`
- Falken VM: `/tmp/falken_final.log`
- ReferenceAgent: `/tmp/referenceagent_final.log`

## Useful Commands

```bash
# Check match counter
cast call 0xE155B0F15dfB5D65364bca23a08501c7384eb737 "matchCounter()" --rpc-url https://sepolia.base.org

# Check match status
cast call 0xE155B0F15dfB5D65364bca23a08501c7384eb737 "getMatch(uint256)" 8 --rpc-url https://sepolia.base.org

# Join match (value = 0.001 ETH)
cast send 0xE155B0F15dfB5D65364bca23a08501c7384eb737 "joinMatch(uint256)" 8 --value 0.001ether --rpc-url https://sepolia.base.org --private-key <key>

# Manual settle (winner: 1=playerA, 2=playerB)
cast send 0xE155B0F15dfB5D65364bca23a08501c7384eb737 "settleFiseMatch(uint256,uint8)" 8 1 --rpc-url https://sepolia.base.org --private-key <key>
```

---

## Environment

Network: Base Sepolia
Escrow: 0xE155B0F15dfB5D65364bca23a08501c7384eb737
Registry: 0xc87d466e9F2240b1d7caB99431D1C80a608268Df

Bots running:
- HouseBot: In packages/house-bot, log at /tmp/housebot_final.log
- ReferenceAgent: In packages/reference-agent, log at /tmp/referenceagent_final.log
- Falken VM: In packages/falken-vm, log at /tmp/falken_final.log
