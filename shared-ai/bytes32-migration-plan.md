# Master Migration Plan: gameLogic (Address) -> logicId (Bytes32)

## Goal
Transition the Falken Protocol to a 100% FISE-native architecture by replacing the `address gameLogic` field with a `bytes32 logicId` across the entire stack.

---

## Phase 1: Smart Contracts (The Source of Truth) ✅ COMPLETE
- [x] **`contracts/src/core/MatchEscrow.sol`**:
    - Update `Match` struct: Change `address gameLogic` to `bytes32 logicId`.
    - Update `MatchCreated` event signature.
    - Remove `IGameLogic` interface imports and logic.
    - Added `totalPot`, `folded[]`, `drawCounter`, `winner` fields.
    - Implemented `placeBet()` and `fold()` functions.
- [x] **`contracts/src/core/FiseEscrow.sol`**:
    - Update `createFiseMatch` to align with the new base `Match` struct.
    - Ensure `fiseMatches` mapping is consistent or merged.
    - Fixed `MAX_ROUNDS` and `COMMIT_WINDOW` visibility.
- [x] **`contracts/src/interfaces/IMatchEscrow.sol`**:
    - Sync function signatures and events.

## Phase 2: Core Infrastructure (The Connectors)
- [ ] **`packages/indexer/src/index.ts`**:
    - **Update `ESCROW_ABI`**: Change `gameLogic` type to `bytes32` in all events and functions.
    - **Update `processLog`**: Ensure `FiseMatchCreated` and `MatchCreated` save the 32-byte hex string to Supabase.
- [ ] **`packages/mcp-server/src/index.ts`**:
    - **Update `ESCROW_ABI`**: Sync with new contract signatures.
    - **Update `prep_create_match_tx`**: Ensure it passes `bytes32` for the logic identifier.
- [ ] **`packages/shared-types/src/index.ts`**:
    - Update `Match` interface: `game_logic: string`.

## Phase 3: The Referee (Falken VM)
- [ ] **`packages/falken-vm/src/Watcher.ts`**:
    - Update event listeners to handle the `bytes32` logicId when detecting reveals.
- [ ] **`packages/falken-vm/src/BettingManager.ts`**:
    - Ensure logicId is handled as a string for any rule-based logic.

## Phase 4: Agents & Bots
- [ ] **`packages/house-bot/src/HouseBot.ts`**:
    - Update match discovery logic to filter by `logicId` (string).
- [ ] **`packages/reference-agent/src/SimpleAgent.ts`**:
    - Update `createMatch` and `joinMatch` logic to handle 32-byte identifiers.

## Phase 5: UI & Scripts
- [ ] **`apps/dashboard/src/components/CreateMatchModal.tsx`**:
    - Update the `createMatch` contract call to pass the 32-byte logic ID.
- [ ] **`scripts/*.js`**: (join-match, commit-move, etc.)
    - Update local ABI copies to match the new contract.

---

## Verification Checklist
1. **Deploy:** Deploy new Escrow and update `ESCROW_ADDRESS` in `.env`.
2. **Sync:** Start Indexer and verify it catches a `MatchCreated` event with a `bytes32` ID.
3. **MCP:** Run `list_available_games` and ensure IDs are correctly returned.
4. **End-to-End:** Initiate a Poker match via Dashboard -> Join via Reference Agent -> Settle via Falken VM.

**Status:** ✅ Smart Contracts Complete. Off-chain integration pending (Indexer, MCP, Falken VM).

## Phase 6: Universal Betting & Multi-Street Support ✅ COMPLETE
- [x] **MatchEscrow.sol** Update:
    - Add `uint256 totalPot` to `Match` struct - tracks accumulated pot.
    - Add `mapping(uint256 => mapping(address => uint256)) playerContributions`.
    - Implement `placeBet(uint256 matchId, uint256 additionalUSDC)`:
        - Allows players to raise stakes during `ACTIVE` status.
        - Optional for games that don't need betting.
    - ~~Implement `fold(uint256 matchId)`~~ **REMOVED** - Belongs in FISE JavaScript, not base contract.
    - Added event: `BetPlaced`.
- [x] **FiseEscrow.sol** Update:
    - Initialize `totalPot`, `playerContributions` in `createMatch()`.
- [x] **Architecture Cleanup**:
    - Removed `folded[]` array from `Match` struct (poker-specific).
    - Removed `PlayerFolded` event (game logic belongs in JavaScript).
    - Base contract now truly game-agnostic.
- [x] **Test Coverage**: 32 tests, 100% pass rate.
- [x] **Handoff Complete**:
    - Dynamic betting supports **Texas Hold'em** and similar games.
    - Exit/forfeit mechanics handled entirely in FISE JavaScript.
    - Any game can implement custom exit rules without contract changes.

## Phase 7: "Soft-Chain" Support for Free Games (Gasless Training)
- [ ] **MCP Server Update**:
    - Update `execute_transaction` to detect `stake == 0` matches.
    - If `stake == 0`, skip blockchain broadcast and instead POST the signed payload to Supabase `soft_moves` table.
- [ ] **Supabase Schema Update**:
    - Create `soft_moves` table to store gasless, signed moves for free games.
    - Create a trigger or function to process these moves just like the indexer processes on-chain events.
- [ ] **Falken VM (Referee) Update**:
    - Ensure the Watcher monitors both the blockchain AND the `soft_moves` table for settlement.
- [ ] **Goal**:
    - Allow new users to instantly benchmark their AI without needing gas or USDC, maintaining cryptographic verifiability via signatures.
