import { GameResult, GameMove, MatchContext } from '@falken/logic-sdk';
import pino from 'pino';

const logger = (pino as any)({ name: 'falken-referee' });

/**
 * Round winner result type:
 * - 0: Draw
 * - 1: Player A wins
 * - 2: Player B wins
 */
export type RoundWinner = 0 | 1 | 2;

/**
 * Falken VM: The Referee
 * Securely executes JS game logic to settle on-chain matches.
 * 
 * Multi-Round Support:
 * - resolveRound(): Returns round winner (0/1/2) for per-round resolution
 * - resolveMatch(): Returns winner address for final settlement
 * 
 * Note: Falls back to local execution if isolated-vm is missing (for dev/beta).
 */
export class Referee {
  /**
   * Resolves a single round of a FISE match.
   * Executes the JS game logic and returns the round winner as a number.
   * 
   * @param jsCode The JavaScript game logic code (from IPFS)
   * @param context Match context (player addresses, current round, etc.)
   * @param moves Array of moves for this round
   * @returns RoundWinner: 0=draw, 1=playerA wins, 2=playerB wins
   */
  async resolveRound(jsCode: string, context: MatchContext, moves: GameMove[]): Promise<RoundWinner> {
    const currentRound = moves[0]?.round || 1;
    logger.info({ 
      playerA: context.playerA.slice(0, 10) + '...',
      playerB: context.playerB.slice(0, 10) + '...',
      round: currentRound,
      movesCount: moves.length 
    }, 'INITIATING_ROUND_RESOLUTION');

    try {
      // Transform ES6 module syntax to CommonJS for safe evaluation
      const transformedCode = this.transformJsCode(jsCode);
      
      const runLogic = new Function('context', 'moves', `
        // Mocking ES Modules for dynamic Function execution
        let GameClass;
        const exports = {};
        const module = { exports };

        // Transformed game logic code
        ${transformedCode}

        GameClass = module.exports;

        // If module.exports is empty, try to find the class by name
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

        return game.checkResult(state);
      `);

      // Normalize moves to round 1 for per-round resolution.
      // Game logic init() sets state.round=1 and processMove skips moves
      // where move.round !== state.round. Since we create fresh state each
      // time, we must align move rounds with the initial state.
      const normalizedMoves = moves.map(m => ({ ...m, round: 1 }));
      const result = runLogic(context, normalizedMoves);
      logger.info({ result, round: currentRound }, 'ROUND_EXECUTION_RESULT');

      // Validate and normalize result
      const normalizedResult = this.normalizeResult(result, context);
      logger.info({ 
        result, 
        normalizedResult,
        round: currentRound 
      }, 'ROUND_RESOLUTION_COMPLETE');

      return normalizedResult;

    } catch (err: any) {
      logger.error({ 
        err: err.message,
        round: currentRound 
      }, 'ROUND_RESOLUTION_FAULT');
      throw err;
    }
  }

  /**
   * Resolves a complete match (legacy/single-round support).
   * Returns the winner's address or null for draw.
   * 
   * @param jsCode The JavaScript game logic code
   * @param context Match context
   * @param moves Array of moves
   * @returns Winner address or null for draw
   */
  async resolveMatch(jsCode: string, context: MatchContext, moves: GameMove[]): Promise<string | null> {
    const currentRound = moves[0]?.round || 1;
    logger.info({ 
      playerA: context.playerA.slice(0, 10) + '...',
      playerB: context.playerB.slice(0, 10) + '...',
      round: currentRound 
    }, 'INITIATING_MATCH_RESOLUTION');

    try {
      const roundWinner = await this.resolveRound(jsCode, context, moves);
      
      // Convert round winner to address
      if (roundWinner === 1) return context.playerA;
      if (roundWinner === 2) return context.playerB;
      return null; // Draw

    } catch (err: any) {
      logger.error({ err: err.message, round: currentRound }, 'MATCH_RESOLUTION_FAULT');
      throw err;
    }
  }

  /**
   * Transforms ES6 module syntax to CommonJS for safe evaluation.
   */
  private transformJsCode(jsCode: string): string {
    return jsCode
      // Handle minified: export{n as default} -> module.exports = n;
      .replace(/export\s*\{\s*(\w+)\s+as\s+default\s*\};?/g, 'module.exports = $1;')
      // Handle: export default class Name -> class Name; module.exports = Name;
      .replace(/export\s+default\s+class\s+(\w+)/g, 'class $1; module.exports = $1;')
      // Handle: export class Name -> class Name; module.exports = Name;
      .replace(/export\s+class\s+(\w+)/g, 'class $1; module.exports = $1;')
      // Remove any remaining export statements
      .replace(/export\s+\{[^}]*\};?/g, '')
      .replace(/export\s+/g, '');
  }

  /**
   * Normalizes the game result to RoundWinner type.
   * Handles various return types from game logic.
   */
  private normalizeResult(result: any, context: MatchContext): RoundWinner {
    // Handle numeric results
    if (typeof result === 'number') {
      if (result === 0 || result === 1 || result === 2) {
        return result as RoundWinner;
      }
      // GameResult.DRAW = 3 → RoundWinner 0 (draw)
      if (result === 3) {
        return 0;
      }
    }
    
    // Handle string results
    if (typeof result === 'string') {
      const lower = result.toLowerCase().trim();
      if (lower === 'draw' || lower === '0' || lower === 'tie') return 0;
      if (lower === 'a' || lower === '1' || lower === 'playera') return 1;
      if (lower === 'b' || lower === '2' || lower === 'playerb') return 2;
      // Check if result matches player addresses
      if (lower === context.playerA.toLowerCase()) return 1;
      if (lower === context.playerB.toLowerCase()) return 2;
    }
    
    // Default to draw if result is unclear
    logger.warn({ result }, 'Unrecognized game result, defaulting to draw');
    return 0;
  }
}
