/**
 * HighRollerDice - Falken FISE Game Logic
 * A single-round high-roller dice game (1-100)
 * Higher roll wins. Tie = draw.
 */

export default class HighRollerDice {
  /**
   * Initialize the game state
   * @param {Object} ctx - Context with playerA, playerB, stake
   * @returns {Object} Initial game state
   */
  init(ctx) {
    return {
      playerA: ctx.playerA,
      playerB: ctx.playerB,
      stake: ctx.stake,
      round: 1,
      moves: {
        [ctx.playerA]: null,
        [ctx.playerB]: null
      },
      result: 0, // 0 = Pending
      complete: false
    };
  }

  /**
   * Process a player move
   * @param {Object} state - Current game state
   * @param {Object} move - Move object { player, moveData, round }
   * @returns {Object} Updated state
   */
  processMove(state, move) {
    // Validate move
    if (move.round !== state.round) {
      throw new Error("Invalid round");
    }
    
    if (state.complete) {
      throw new Error("Game already complete");
    }
    
    // Validate player
    const playerKey = move.player;
    if (playerKey !== state.playerA && playerKey !== state.playerB) {
      throw new Error("Invalid player");
    }
    
    // Validate move data (1-100)
    const roll = parseInt(move.moveData, 10);
    if (isNaN(roll) || roll < 1 || roll > 100) {
      throw new Error("Invalid move: must be 1-100");
    }
    
    // Check not already moved
    if (state.moves[playerKey] !== null) {
      throw new Error("Player already moved");
    }
    
    // Record move
    const newState = {
      ...state,
      moves: {
        ...state.moves,
        [playerKey]: roll
      }
    };
    
    // Check if both players have moved
    const moveA = newState.moves[state.playerA];
    const moveB = newState.moves[state.playerB];
    
    if (moveA !== null && moveB !== null) {
      newState.complete = true;
      newState.result = this.checkResult(newState);
    }
    
    return newState;
  }

  /**
   * Check the game result
   * @param {Object} state - Current game state
   * @returns {number} 0=Pending, 1=Player A Wins, 2=Player B Wins, 3=Draw
   */
  checkResult(state) {
    if (!state.complete) {
      return 0; // Pending
    }
    
    const moveA = state.moves[state.playerA];
    const moveB = state.moves[state.playerB];
    
    if (moveA === null || moveB === null) {
      return 0; // Pending
    }
    
    if (moveA === moveB) {
      return 3; // Draw
    }
    
    return moveA > moveB ? 1 : 2; // 1 = A wins, 2 = B wins
  }
}
