# FALKEN V3 Solidity Testing & Audit Plan

## Goal
Achieve **100% line/branch coverage** and verify the security of the `MatchEscrow` (Universal Banker) and `FiseEscrow` (FISE Referee) contracts on the `fise-dev-bytes32` branch.

---

## 1. Core Logic Tests (Foundry)

### A. Multiplayer Dynamics (N-Player)
- [ ] **Dynamic Join:** Test joining with 2, 3, and 6 players. Verify `maxPlayers` limit.
- [ ] **Array Integrity:** Verify `players` array and `wins` array are correctly initialized and indexed.
- [ ] **Commit-Reveal Gating:** Ensure Phase 2 (Reveal) only starts after *all* N players have committed.
- [ ] **Multi-Reveal Resolution:** Verify round only resolves after *all* N players have revealed.

### B. Economic Security (USDC Flow)
- [ ] **Stake Pull:** Verify USDC is correctly pulled on `createMatch` and `joinMatch`.
- [ ] **Treasury Rake:** Verify 3% protocol rake is correctly routed to `treasury`.
- [ ] **Developer Royalties:** Verify 2% royalty is correctly routed to the game developer (via `LogicRegistry`).
- [ ] **Winner Payout:** Verify the remaining 95% is correctly routed to the winner.
- [ ] **Draw Splits:** Verify the pot is split equally among all N players in a tied match.
- [ ] **Withdrawals:** Test the "Pull-over-Push" system (`pendingWithdrawals`) for users with blocked transfer addresses.

### C. Adversarial & Edge Cases
- [ ] **Commit Timeout:** Single player fails to commit -> Opponent claims win.
- [ ] **Reveal Timeout:** Single player fails to reveal -> Opponent claims win.
- [ ] **Mutual Timeout:** All players fail to move -> 1% penalty taken, rest refunded.
- [ ] **Sudden Death:** Verify same round replays on draw up to `MAX_CONSECUTIVE_DRAWS`.
- [ ] **Max Rounds:** Verify match settles based on current score if `MAX_ROUNDS` (10) is reached.
- [ ] **Invalid Hashes:** Attempt to reveal with wrong salt or move.

---

## 2. Security Analysis (Static Analysis)

Run the following tools and resolve **ALL** High/Medium findings:

- [ ] **Slither:** `slither . --filter-paths "lib|test"` (Check for Reentrancy, Shadowing, and Storage Bloat).
- [ ] **Wake:** `wake detect all` (Check for advanced logic flaws and state machine vulnerabilities).
- [ ] **Aderyn:** `aderyn .` (Check for gas optimizations and common patterns).

---

## 3. Coverage Target
Run: `forge coverage --report lcov && genhtml lcov.info -o report`
- **Minimum Target:** 95%
- **Ideal Target:** 100%

## Notes for Kimi
- Ensure `LogicRegistry` mock or actual is used to verify `logicId` existence.
- The `winnerIndex` in `resolveFiseRound` is 0-indexed based on the `players` array.
- Use `255` as the constant for `DRAW_INDEX`.
- All USDC math must account for 6 decimals.
