import { createPublicClient, http } from 'viem';
import { baseSepolia } from 'viem/chains';
import { Referee, RoundWinner } from './Referee.js';
import { Reconstructor } from './Reconstructor.js';
import { Settler } from './Settler.js';
import { Fetcher } from './Fetcher.js';
import pino from 'pino';

const logger = (pino as any)({ name: 'falken-watcher' });

const FISE_ESCROW_ABI = [
  { 
    name: 'MoveRevealed', 
    type: 'event', 
    inputs: [
      { name: 'matchId', type: 'uint256', indexed: true },
      { name: 'roundNumber', type: 'uint8' },
      { name: 'player', type: 'address', indexed: true },
      { name: 'move', type: 'uint8' }
    ] 
  }
] as const;

const LOGIC_REGISTRY_ABI = [
  { 
    name: 'registry', 
    type: 'function', 
    stateMutability: 'view', 
    inputs: [{ name: '', type: 'bytes32' }], 
    outputs: [
      { name: 'ipfsCID', type: 'string' },
      { name: 'developer', type: 'address' },
      { name: 'isVerified', type: 'bool' },
      { name: 'createdAt', type: 'uint256' },
      { name: 'totalVolume', type: 'uint256' }
    ] 
  }
] as const;

/**
 * Falken Watcher
 * Monitors blockchain events and triggers round resolution.
 * 
 * Multi-Round Support:
 * - Listens for MoveRevealed events
 * - Waits for both players to reveal
 * - Calls Referee to determine round winner (0/1/2)
 * - Calls Settler.resolveRound() to update on-chain scores
 * - Contract auto-advances rounds until first-to-3 or max rounds
 */
export class Watcher {
  private client = createPublicClient({
    chain: baseSepolia,
    transport: http(process.env.RPC_URL)
  });

  private referee = new Referee();
  private reconstructor = new Reconstructor();
  private settler = new Settler();
  private fetcher = new Fetcher();
  private processingLocks = new Set<string>();

  async start(escrowAddress: `0x${string}`, registryAddress: `0x${string}`) {
    logger.info({ escrowAddress, registryAddress }, 'WATCHER_INITIALIZED // MONITORING_ARENA');

    const supabase = this.reconstructor.supabase;

    // 1. SUPABASE LISTENER — Backup trigger for ALL matches (catches missed blockchain events)
    // Fires when the indexer unmasks both moves (dual-reveal gate sets move column)
    supabase
      .channel('fise-watcher-rounds')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rounds', filter: 'move=neq.null' }, async (payload: any) => {
        const round = payload.new;
        if (!round.match_id || !round.move) return;

        logger.info({ dbId: round.match_id, round: round.round_number }, 'DB_MOVE_UNMASKED // CHECKING_ROUND');
        await this.processMatch(round.match_id, escrowAddress, registryAddress);
      })
      .subscribe();

    // 2. SUPABASE LISTENER — Simulation matches (phase-based trigger)
    supabase
      .channel('fise-watcher-sim')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matches' }, async (payload: any) => {
        const match = payload.new;
        if (!match.match_id.startsWith('test-fise')) return;
        if (match.phase !== 'REVEAL' || match.status !== 'ACTIVE') return;

        logger.info({ dbId: match.match_id }, 'SIMULATED_REVEAL_DETECTED // INITIATING_OFFCHAIN_JUDGMENT');
        await this.processMatch(match.match_id, escrowAddress, registryAddress);
      })
      .subscribe();

    // 3. REAL BLOCKCHAIN WATCHER — Primary trigger for on-chain events
    this.client.watchContractEvent({
      address: escrowAddress,
      abi: FISE_ESCROW_ABI,
      eventName: 'MoveRevealed',
      onLogs: async (logs) => {
        for (const log of logs) {
          const { matchId } = log.args;
          if (!matchId) continue;
          const dbId = `${escrowAddress.toLowerCase()}-${matchId.toString()}`;
          await this.processMatch(dbId, escrowAddress, registryAddress);
        }
      }
    });
  }

  /**
   * Retry fetching match data from Supabase, waiting for both the match
   * and at least 2 revealed moves (indexer dual-reveal gate may lag).
   */
  private async waitForCompleteMatchData(dbMatchId: string, maxRetries = 8, delayMs = 3000) {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const result = await this.reconstructor.getMatchHistory(dbMatchId);

        // Get current round from the match record
        const { data: matchData } = await this.reconstructor.supabase
          .from('matches')
          .select('current_round')
          .eq('match_id', dbMatchId)
          .single();

        const currentRound = matchData?.current_round || 1;

        // Only count moves for the CURRENT round
        const currentRoundMoves = result.moves.filter((m: any) => m.round === currentRound);

        if (currentRoundMoves.length >= 2) {
          return { context: result.context, moves: currentRoundMoves };
        }
        // Match found but current round moves incomplete — waiting for both reveals
        if (attempt < maxRetries - 1) {
          logger.info({ dbMatchId, currentRound, moveCount: currentRoundMoves.length, attempt: attempt + 1 }, 'WAITING_FOR_CURRENT_ROUND_MOVES');
          await new Promise(r => setTimeout(r, delayMs));
          continue;
        }
        return { context: result.context, moves: currentRoundMoves }; // Return current round moves on final attempt
      } catch (err: any) {
        if (attempt < maxRetries - 1 && err.message?.includes('Match not found')) {
          logger.warn({ dbMatchId, attempt: attempt + 1 }, 'WAITING_FOR_INDEXER_SYNC');
          await new Promise(r => setTimeout(r, delayMs));
          continue;
        }
        throw err;
      }
    }
    throw new Error(`RECONSTRUCTION_FAILED: Match not found after ${maxRetries} retries (${dbMatchId})`);
  }

  private async processMatch(dbMatchId: string, escrowAddress: `0x${string}`, registryAddress: `0x${string}`) {
    // Prevent duplicate processing from multiple MoveRevealed events per round
    if (this.processingLocks.has(dbMatchId)) {
      logger.info({ dbMatchId }, 'ALREADY_PROCESSING // SKIPPING_DUPLICATE');
      return;
    }
    this.processingLocks.add(dbMatchId);

    try {
      // Wait for indexer to sync data and unmask both moves
      const { context, moves } = await this.waitForCompleteMatchData(dbMatchId);

      // Skip if moves are still incomplete after all retries
      if (moves.length < 2) {
        logger.info({ dbMatchId, moveCount: moves.length }, 'INCOMPLETE_CURRENT_ROUND_MOVES // WAITING');
        return;
      }
      
      // For simulation, we hardcode the CID if the logicRegistry lookup fails
      let jsCode = '';
      try {
        const logicId = await this.client.readContract({
          address: escrowAddress,
          abi: [{ name: 'fiseMatches', type: 'function', inputs: [{ type: 'uint256' }], outputs: [{ type: 'bytes32' }] }] as const,
          functionName: 'fiseMatches',
          args: [BigInt(dbMatchId.split('-').pop() || '0')]
        });
        const [ipfsCID] = await this.client.readContract({
          address: registryAddress,
          abi: LOGIC_REGISTRY_ABI,
          functionName: 'registry',
          args: [logicId as `0x${string}`]
        });
        jsCode = await this.fetcher.fetchLogic(ipfsCID);
      } catch (err) {
        logger.warn('REGISTRY_LOOKUP_FAILED // USING_SIMULATION_LOGIC');
        jsCode = `class RockPaperScissors { 
          init(ctx) { return { score: 0, playerA: ctx.playerA, playerB: ctx.playerB, rounds: {} }; }
          processMove(state, move) {
            if (!state.rounds[move.round]) state.rounds[move.round] = {};
            if (move.player === state.playerA) state.rounds[move.round].a = move.moveData;
            else state.rounds[move.round].b = move.moveData;
            const r = state.rounds[move.round];
            if (r.a !== undefined && r.b !== undefined) {
              // Rock(0) beats Scissors(2), Paper(1) beats Rock(0), Scissors(2) beats Paper(1)
              if (r.a === r.b) return state; // Draw
              if ((r.a === 0 && r.b === 2) || (r.a === 1 && r.b === 0) || (r.a === 2 && r.b === 1)) {
                state.score += 1;
              } else {
                state.score -= 1;
              }
            }
            return state;
          }
          checkResult(state) {
            if (state.score > 0) return 1;  // Player A wins
            if (state.score < 0) return 2;  // Player B wins
            return 0; // Draw
          }
        }`;
      }

      // Multi-Round: Resolve current round (returns 0, 1, or 2)
      const roundWinner: RoundWinner = await this.referee.resolveRound(jsCode, context, moves);
      const moveRound = moves[0]?.round || 1;
      logger.info({ dbMatchId, roundWinner, round: moveRound }, 'ROUND_JUDGMENT_RENDERED');

      if (dbMatchId.startsWith('test-fise')) {
        // SIMULATION SETTLEMENT (Direct DB Update)
        // For simulation, we track wins in the match record
        const { data: matchData } = await this.reconstructor.supabase
          .from('matches')
          .select('wins_a, wins_b, current_round')
          .eq('match_id', dbMatchId)
          .single();
        
        let winsA = (matchData?.wins_a || 0);
        let winsB = (matchData?.wins_b || 0);
        let currentRound = (matchData?.current_round || 1);
        
        if (roundWinner === 1) winsA++;
        else if (roundWinner === 2) winsB++;
        
        // Check for match completion (first to 3)
        const isComplete = winsA >= 3 || winsB >= 3 || currentRound >= 5;
        const winner = winsA > winsB ? context.playerA : (winsB > winsA ? context.playerB : null);
        
        const { error } = await this.reconstructor.supabase
          .from('matches')
          .update({
            status: isComplete ? 'SETTLED' : 'ACTIVE',
            phase: isComplete ? 'COMPLETE' : 'COMMIT',
            winner: isComplete ? winner : null,
            wins_a: winsA,
            wins_b: winsB,
            current_round: isComplete ? currentRound : currentRound + 1
          })
          .eq('match_id', dbMatchId);

        if (error) logger.error({ dbMatchId, error }, 'SIMULATION_DB_UPDATE_FAILED');
        else logger.info({ dbMatchId, roundWinner, winsA, winsB, isComplete }, 'SIMULATION_ROUND_RESOLVED');
      } else {
        // REAL ON-CHAIN ROUND RESOLUTION
        // Call resolveFiseRound(matchId, roundWinner) 
        // Contract will update wins, check for first-to-3, advance round or settle
        const onChainMatchId = BigInt(dbMatchId.split('-').pop() || '0');
        await this.settler.resolveRound(escrowAddress, onChainMatchId, roundWinner);
      }
    } catch (err: any) {
      logger.error({ dbMatchId, err: err.message }, 'VM_PROCESSING_FAULT');
    } finally {
      this.processingLocks.delete(dbMatchId);
    }
  }
}
