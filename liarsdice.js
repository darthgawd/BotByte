/**
 * LiarsDiceJS - Falken FISE Game Logic
 * A 2-player strategic deception game.
 * 
 * Rules:
 * 1. Each player has 5 dice.
 * 2. Dice are generated using the player's salt + matchId (Hidden Information).
 * 3. Players bid on the total quantity of a certain face value across all dice (e.g., "There are four 5s").
 * 4. Next player must either:
 *    - Increase the bid (higher quantity OR higher face).
 *    - Call "Liar".
 * 5. If "Liar" is called, all dice are revealed. If the bid was met, the Caller loses. If not, the Bidder loses.
 */

export default class LiarsDiceJS {
  /**
   * Initialize game state
   */
  init(ctx) {
    return {
      playerA: ctx.playerA.toLowerCase(),
      playerB: ctx.playerB.toLowerCase(),
      stake: ctx.stake,
      round: 1,
      dice: {},      // { address: [1, 2, 3, 4, 5] }
      bids: [],      // [{ player, quantity, face }]
      winner: null,  // match winner
      complete: false,
      turn: ctx.playerA.toLowerCase() // Player A starts
    };
  }

  /**
   * Helper to generate deterministic dice for a player
   * Uses simple LCG PRNG based on the hash of player address + salt
   */
  generateDice(seedHex) {
    // Convert hex string to a numeric seed
    let seed = 0;
    for (let i = 0; i < seedHex.length; i++) {
      seed = (seed << 5) - seed + seedHex.charCodeAt(i);
      seed |= 0; 
    }
    
    const dice = [];
    for (let i = 0; i < 5; i++) {
      seed = (Math.imul(1664525, seed) + 1013904223) | 0;
      dice.push(Math.abs(seed % 6) + 1);
    }
    return dice;
  }

  /**
   * Process a player move
   * moveData is expected to be a JSON string:
   * {"action": "bid", "quantity": 3, "face": 4} OR {"action": "call"}
   */
  processMove(state, move) {
    if (state.complete) return state;

    const player = move.player.toLowerCase();
    const salt = move.salt; // Salt used for dice generation
    
    // 1. Generate dice for this player if not already done
    if (!state.dice[player]) {
      state.dice[player] = this.generateDice(player + salt);
    }

    // Parse the move data
    let actionData;
    try {
      actionData = JSON.parse(move.moveData);
    } catch (e) {
      // Fallback for simple integer moves (e.g., if a bot just sends a number)
      actionData = { action: "call" }; 
    }

    if (actionData.action === "call") {
      // LIAR CALLED: End game and check result
      state.complete = true;
      state.result = this.evaluateLiar(state, player);
    } else if (actionData.action === "bid") {
      // NEW BID
      const newBid = {
        player: player,
        quantity: parseInt(actionData.quantity),
        face: parseInt(actionData.face)
      };

      // Validate bid (must be higher than previous)
      if (this.isValidBid(state.bids, newBid)) {
        state.bids.push(newBid);
        state.turn = player === state.playerA ? state.playerB : state.playerA;
      }
    }

    return state;
  }

  isValidBid(bids, newBid) {
    if (bids.length === 0) return true;
    const lastBid = bids[bids.length - 1];
    
    // Valid if quantity is higher, OR face is higher with same/higher quantity
    if (newBid.quantity > lastBid.quantity) return true;
    if (newBid.quantity === lastBid.quantity && newBid.face > lastBid.face) return true;
    
    return false;
  }

  /**
   * Determine winner when Liar is called
   * @param {string} caller - Address of player who called "Liar"
   */
  evaluateLiar(state, caller) {
    if (state.bids.length === 0) return 0; // Should not happen

    const lastBid = state.bids[state.bids.length - 1];
    const bidder = lastBid.player;

    // Count total occurrences of the bid face across all dice
    let totalCount = 0;
    Object.values(state.dice).forEach(playerDice => {
      playerDice.forEach(die => {
        if (die === lastBid.face || die === 1) { // 1s are usually wild in Liars Dice
          totalCount++;
        }
      });
    });

    const isLiar = totalCount < lastBid.quantity;

    if (isLiar) {
      // Bidder was lying! Caller wins.
      return caller === state.playerA ? 1 : 2;
    } else {
      // Bidder was telling the truth! Bidder wins.
      return bidder === state.playerA ? 1 : 2;
    }
  }

  /**
   * Final result check for Referee
   */
  checkResult(state) {
    if (!state.complete) return 0; // Pending
    return state.result;
  }
}
