import { GameResult, GameMove, MatchContext } from '@falken/logic-sdk';
import pino from 'pino';

const logger = (pino as any)({ name: 'falken-referee' });

/**
 * Round winner result type:
 * - 0 to N-1: Index of winning player in the players array
 * - 255: Draw
 * - null: Pending
 */
export type RoundWinner = number | null;

export type RoundResolution = {
  winner: RoundWinner;
  description: string;
};

/**
 * Falken VM: The Referee (V3)
 * Securely executes JS game logic to settle on-chain matches.
 * Hardened for N-player scalability.
 */
export class Referee {
  /**
   * Resolves a single round of a FISE match.
   */
  async resolveRound(jsCode: string, context: MatchContext, moves: GameMove[]): Promise<RoundResolution | null> {
    const currentRound = moves[0]?.round || 1;
    logger.info({ 
      playersCount: context.players?.length || 2,
      round: currentRound,
      movesCount: moves.length 
    }, 'INITIATING_ROUND_RESOLUTION');

    try {
      // Transform ES6 module syntax to CommonJS for safe evaluation
      const transformedCode = this.transformJsCode(jsCode);
      
      const runLogic = new Function('context', 'moves', `
        let GameClass;
        const exports = {};
        const module = { exports };

        ${transformedCode}

        GameClass = module.exports;

        if (!GameClass) {
          const classMatch = /class\\s+(\\w+)/.exec(\`${jsCode.replace(/`/g, '\\`')}\`);
          if (classMatch && classMatch[1]) {
            GameClass = eval(classMatch[1]);
          }
        }

        if (!GameClass) throw new Error("Could not find Game Class in logic");

        const game = new GameClass();
        let state = game.init(context);

        for (const move of moves) {
          state = game.processMove(state, move);
        }

        const winner = game.checkResult(state);
        const description = game.describeState ? game.describeState(state) : "";
        return { winner, description };
      `);

      const result = runLogic(context, moves);
      
      if (!result) return null;

      logger.info({ winner: result.winner, description: result.description, round: currentRound }, 'ROUND_EXECUTION_RESULT');
      const normalizedWinner = this.normalizeResult(result.winner, context);
      return { winner: normalizedWinner, description: result.description || "" };

    } catch (err: any) {
      logger.error({ err: err.message, round: currentRound }, 'ROUND_RESOLUTION_FAULT');
      throw err;
    }
  }

  private transformJsCode(jsCode: string): string {
    // Extract default class name
    const defaultClassMatch = jsCode.match(/export\s+default\s+class\s+(\w+)/);
    const className = defaultClassMatch ? defaultClassMatch[1] : null;
    
    let transformed = jsCode
      .replace(/export\s*\{\s*(\w+)\s+as\s+default\s*\};?/g, 'module.exports = $1;')
      .replace(/export\s+default\s+class\s+(\w+)/g, 'class $1')
      .replace(/export\s+class\s+(\w+)/g, 'class $1')
      .replace(/export\s+\{[^}]*\};?/g, '')
      .replace(/export\s+/g, '');
    
    // Add module.exports assignment for default class
    if (className) {
      transformed += `\nmodule.exports = ${className};`;
    }
    
    return transformed;
  }

  private normalizeResult(result: any, context: MatchContext): RoundWinner {
    // 255 is the protocol standard for DRAW
    if (result === 255 || result === 'draw' || result === 'DRAW') return 255;

    if (typeof result === 'number') {
      // Support legacy 1-indexed results (1 or 2) from older game logic
      // BUT only if the result is >= number of players (meaning it's 1-indexed)
      // For 2 players: result 1 or 2 means 1-indexed, convert to 0 or 1
      // For N players: result should already be 0-indexed (0 to N-1)
      const playerCount = context.players?.length || 2;
      if (result >= 1 && result <= playerCount && result > playerCount - 1) {
        return result - 1; // Convert 1-indexed to 0-indexed
      }
      return result; // Already 0-indexed (0, 1, 2, etc.)
    }

    if (typeof result === 'string') {
      const lower = result.toLowerCase().trim();
      if (lower === 'a' || lower === 'playera') return 0;
      if (lower === 'b' || lower === 'playerb') return 1;
      
      // Check if it's a player address
      const idx = context.players?.findIndex(p => p.toLowerCase() === lower);
      if (idx !== undefined && idx !== -1) return idx;
    }

    logger.warn({ result }, 'Unrecognized game result, defaulting to draw');
    return 255;
  }
}
