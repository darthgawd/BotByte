# BotByte Smart Contract Shared Knowledge Base

This file serves as a shared instruction set for developers and AI agents (Gemini/Claude) regarding pending logic updates and protocol standards. **Do not remove completed tasks; mark them as [COMPLETED] and preserve the details for regression testing and context.**

---

## 5-Card Draw Logic Upgrade: Royal Flush Tier [COMPLETED]

### Objective
Upgrade the hand rank hierarchy in `FiveCardDraw.sol` to include a dedicated tier for a Royal Flush.

### Original Hierarchy
- `HIGH_CARD = 0`
- `PAIR = 1`
- `TWO_PAIR = 2`
- `THREE_OF_A_KIND = 3`
- `STRAIGHT = 4`
- `FLUSH = 5`
- `FULL_HOUSE = 6`
- `FOUR_OF_A_KIND = 7`
- `STRAIGHT_FLUSH = 8`

### Required Update
1.  **Add Constant:** Define `uint8 constant ROYAL_FLUSH = 9;`.
2.  **Logic Implementation:** Update `_evaluateHand` to distinguish between a standard `STRAIGHT_FLUSH` and a `ROYAL_FLUSH` (Ace-high Straight Flush).
3.  **Metadata Update:** Ensure `getRoundResultMetadata` reports a `9` so the Dashboard can trigger "Legendary" UI states.

### Rationale
- **Deterministic Tie-Breaking:** Simplifies logic for unbeatable hands (`9 > 8`).
- **Agent Intelligence:** Allows agents to explicitly weigh the "mathematical ceiling."
- **Visual Signal:** Enables high-fidelity animations on the Dashboard for rare events.

---

## BotByte V2.1: The "Mental Poker" Upgrade (Discard & Draw) [COMPLETED]

### Objective
Upgrade the protocol to support a "Discard and Draw" phase in 5-Card Draw. This transforms the game from a single-step showdown into a multi-stage strategic interaction.

### Architectural Requirements

#### 1. MatchEscrowV2 State Machine Update
- **Phase Enum:** Add `DISCARD` to the `Phase` enum (`COMMIT`, `REVEAL`, `DISCARD`).
- **Phase Flow:** After `REVEAL` is complete for both players, the match MUST move to `Phase.DISCARD` if the game logic requires it.
- **Submit Discard Function:**
  ```solidity
  function submitDiscard(uint256 _matchId, uint8 _discardMask) external;
  ```
  - `_discardMask` is a 5-bit bitmask (e.g., `0b11001` means keep cards 0, 3, and 4; discard 1 and 2).
  - Must enforce a `discardDeadline` similar to commit/reveal.

#### 2. IGameLogicV2 Interface Extension
- **New Hook:** `function requiresDiscard() external view returns (bool);`
- **New Hook:** 
  ```solidity
  function resolveDraw(
      bytes32 seed, 
      uint8 discardMaskA, 
      uint8 discardMaskB
  ) external pure returns (uint8 winner);
  ```

#### 3. FiveCardDraw.sol Logic
- **Deck Continuity:** Ensure replacement cards are drawn from the *remaining* 42 cards in the deck (avoiding the 10 cards already dealt).
- **Evaluation:** Hand evaluation must happen *after* the draw phase is resolved.
- **Metadata:** `getRoundResultMetadata` must be updated to show the "Starting Hand," the "Discard Action," and the "Final Hand."

### Strategic Rationale (AI Logic)
- **Probability:** Agents must now calculate the odds of improving their hand based on the 10 cards already visible (once seeds are revealed).
- **Game Theory:** Adding a second transaction window allows for deeper "Signal Analysis"—an agent can infer the strength of an opponent's initial hand based on how many cards they discard.

---

## Protocol Security Standards (Quick Reference)
- **Pattern:** Always use CEI (Checks-Effects-Interactions).
- **Pattern:** Use Pull-over-Push via `_safeTransfer` and `pendingWithdrawals`.
- **Constraint:** All core logic must maintain 100% branch coverage.
