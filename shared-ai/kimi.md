# 🦅 Falken Protocol: The Kimi AI Knowledge Base

Welcome, Kimi. You are joining the core development team of the **Falken Protocol**. This document contains the absolute truth of our vision, our technical architecture, and our non-negotiable security standards. Use this to help build the first truly sovereign machine economy.

---

## 1. The Vision: "AI, GAMIFIED."
Falken is the **Economic Proving Ground for Machine Intelligence**. 
*   **The Problem:** Current AI benchmarks (MMLU, etc.) are sterile and memorized.
*   **The Solution:** We put real capital (ETH) on the line. Smarter code wins; inefficient code loses.
*   **The Store:** We are building the **"Steam Store" for AI Agents**. Developers launch games (benchmarks), and agents pay to play, earn, and evolve.

---

## 2. Core Technical Architecture
The protocol is built natively on **Base** (Sepolia for testnet, moving to Mainnet).

### 2.1 The Engine (MatchEscrow.sol)
*   **Match Lifecycle:** Best-of-5 rounds. First to 3 wins takes the pot.
*   **Commit-Reveal:** Every move is hidden using `keccak256("FALKEN_V1", address(this), matchId, round, player, move, salt)`. This prevents front-running.
*   **Sudden Death:** On a DRAW (0), the round is reset, not incremented. Players replay the round.
*   **Stale-Mate Limit:** Max 3 consecutive draws per round. If hit, the match forces progress to the next round.
*   **Hybrid Payout:** Winners are paid instantly via `.call`. If it fails (e.g., smart contract wallet), funds move to `pendingWithdrawals` (IOU system).

### 2.2 The Modular Oracle (PriceProvider.sol)
*   Handles all USD-to-ETH math.
*   Connected to **Chainlink ETH/USD Feed** on Base Sepolia.
*   Enforces a **$2.00 USD Minimum Stake** per match.
*   Allows the protocol to "Hot Swap" oracles without redeploying the core money logic.

### 2.3 The Watcher (Self-Healing Indexer)
*   A Node.js process that monitors the blockchain 24/7.
*   Saves match and round history to **Supabase**.
*   **Self-Healing:** If it goes offline, it automatically scans missed blocks starting from its last saved checkpoint.

---

## 3. Mandatory Security Standards (The "Ref Rules")
Every code change MUST follow these rules:
1.  **CEI Pattern:** Checks $ightarrow$ Effects $ightarrow$ Interactions. Update state before making any external calls.
2.  **Pull over Push:** Always provide a `withdraw()` fallback if a direct ETH transfer fails.
3.  **Non-Reentrant:** Use the `nonReentrant` modifier on all public state-changing functions.
4.  **100% Coverage:** No contract logic is accepted unless it is 100% covered by Forge tests.
5.  **Audit Clean:** All contracts must pass `slither` and `wake` security scans without "High" or "Medium" findings.

---

## 4. Current Resident: Joshua (The House Bot)
Joshua is our benchmark agent.
*   **Brain:** Uses a **Bayesian Transition Matrix**. It analyzes the opponent's "Last Move $ightarrow$ Next Move" history to predict patterns.
*   **GTO Mix:** Plays the optimal counter 80% of the time and perfectly random 20% of the time to remain un-exploitable.
*   **Intel Lens:** Joshua has a direct line to the `rounds` table to "remember" every rival on the network.

---

## 5. The Future Roadmap
### 5.1 Immutable Scripting (JS on IPFS)
*   Developers write games in **JavaScript** (not Solidity).
*   Code is hashed to **IPFS** (Logic as a Hash).
*   The blockchain verifies the result using **Optimistic Proofs** or **TEEs (AWS Nitro/CDP)**.

### 5.2 The Elite Intel Lens
Exposing 20+ advanced metrics including:
*   `latency_fingerprint`: Identifying bot brain types by speed.
*   `tilt_index`: Detecting when a bot gets predictable after a loss.
*   `nash_equilibrium_gap`: Measuring mathematical efficiency.

### 5.3 Marketing & Hype
*   **Falken-Hype Bot:** An AI that reads our `git log` and automatically posts technical updates to Twitter to build "Proof of Work" hype.

---

## 6. Workspace Workflow
*   **Branches:** 
    *   `v1-development`: The stable, production-ready line.
    *   `feat/...`: Specific features being built.
    *   `internal-ops`: Private tools like the Hype Bot (Ignored by GitHub).
*   **Deployment:** Managed via Foundry scripts (`contracts/script/Deploy.s.sol`).

---

**Remember Kimi: In the Arena, Logic is Absolute. Let's build.**
