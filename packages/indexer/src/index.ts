import { createPublicClient, http, parseEventLogs, decodeFunctionData } from 'viem';
import { baseSepolia } from 'viem/chains';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import pino from 'pino';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const logger = pino({
  transport: {
    target: 'pino-pretty',
    options: { colorize: true }
  }
}, process.stderr);

const supabase: any = createClient(process.env.SUPABASE_URL || '', process.env.SUPABASE_SERVICE_ROLE_KEY || '');
const publicClient: any = createPublicClient({ chain: baseSepolia, transport: http(process.env.RPC_URL) });
const ESCROW_ADDRESS = (process.env.ESCROW_ADDRESS || '').toLowerCase();

// V3 ABI (Multiplayer + Bytes32)
const ESCROW_ABI = [
  { name: 'MatchCreated', type: 'event', inputs: [{ name: 'matchId', type: 'uint256', indexed: true }, { name: 'creator', type: 'address', indexed: true }, { name: 'stake', type: 'uint256', indexed: false }, { name: 'logicId', type: 'bytes32', indexed: true }, { name: 'maxPlayers', type: 'uint8', indexed: false }, { name: 'winsRequired', type: 'uint8', indexed: false }] },
  { name: 'MatchJoined', type: 'event', inputs: [{ name: 'matchId', type: 'uint256', indexed: true }, { name: 'player', type: 'address', indexed: true }, { name: 'index', type: 'uint8', indexed: false }] },
  { name: 'RoundStarted', type: 'event', inputs: [{ name: 'matchId', type: 'uint256', indexed: true }, { name: 'round', type: 'uint8', indexed: false }] },
  { name: 'MoveCommitted', type: 'event', inputs: [{ name: 'matchId', type: 'uint256', indexed: true }, { name: 'round', type: 'uint8', indexed: false }, { name: 'player', type: 'address', indexed: true }] },
  { name: 'MoveRevealed', type: 'event', inputs: [{ name: 'matchId', type: 'uint256', indexed: true }, { name: 'round', type: 'uint8', indexed: false }, { name: 'player', type: 'address', indexed: true }, { name: 'move', type: 'uint8', indexed: false }] },
  { name: 'RoundResolved', type: 'event', inputs: [{ name: 'matchId', type: 'uint256', indexed: true }, { name: 'round', type: 'uint8', indexed: false }, { name: 'winnerIndex', type: 'uint8', indexed: false }] },
  { name: 'MatchSettled', type: 'event', inputs: [{ name: 'matchId', type: 'uint256', indexed: true }, { name: 'winner', type: 'address', indexed: false }, { name: 'payout', type: 'uint256', indexed: false }] },
  { name: 'MatchVoided', type: 'event', inputs: [{ name: 'matchId', type: 'uint256', indexed: true }, { name: 'reason', type: 'string', indexed: false }] },
  { name: 'WithdrawalQueued', type: 'event', inputs: [{ name: 'user', type: 'address', indexed: true }, { name: 'amount', type: 'uint256', indexed: false }] },
  { name: 'getMatch', type: 'function', stateMutability: 'view', inputs: [{ name: 'matchId', type: 'uint256' }], outputs: [{ name: '', type: 'tuple', components: [
    { name: 'players', type: 'address[]' },
    { name: 'stake', type: 'uint256' },
    { name: 'totalPot', type: 'uint256' },
    { name: 'logicId', type: 'bytes32' },
    { name: 'maxPlayers', type: 'uint8' },
    { name: 'currentRound', type: 'uint8' },
    { name: 'wins', type: 'uint8[]' },
    { name: 'drawCounter', type: 'uint8' },
    { name: 'phase', type: 'uint8' },
    { name: 'status', type: 'uint8' },
    { name: 'commitDeadline', type: 'uint256' },
    { name: 'revealDeadline', type: 'uint256' },
    { name: 'winner', type: 'address' }
  ] }] },
  { name: 'roundCommits', type: 'function', stateMutability: 'view', inputs: [{ name: 'matchId', type: 'uint256' }, { name: 'round', type: 'uint8' }, { name: 'player', type: 'address' }], outputs: [{ name: 'commitHash', type: 'bytes32' }, { name: 'move', type: 'uint8' }, { name: 'salt', type: 'bytes32' }, { name: 'revealed', type: 'bool' }] },
];

const processedLogIds = new Set<string>();
const BACKFILL_CHUNK = 2000n;

function getDbMatchId(onChainId: any): string {
  return `${ESCROW_ADDRESS}-${onChainId.toString()}`;
}

async function getBlockTimestamp(blockNumber: bigint): Promise<number> {
  const block = await publicClient.getBlock({ blockNumber });
  return Number(block.timestamp);
}

async function ensureMatchExists(mId: string, onChainId: bigint) {
  const { data: existing } = await supabase.from('matches').select('match_id').eq('match_id', mId).single();
  if (existing) return;

  logger.info({ matchId: mId }, 'Match missing from DB, fetching from chain...');
  
  try {
    const matchData = await publicClient.readContract({
      address: ESCROW_ADDRESS as `0x${string}`,
      abi: ESCROW_ABI,
      functionName: 'getMatch',
      args: [onChainId]
    }) as any;

    const statusMap = ['OPEN', 'ACTIVE', 'SETTLED', 'VOIDED'];
    const phaseMap = ['COMMIT', 'REVEAL'];

    await supabase.from('matches').upsert({
      match_id: mId,
      players: matchData.players.map((p: string) => p.toLowerCase()),
      stake_wei: matchData.stake.toString(),
      total_pot: matchData.totalPot.toString(),
      game_logic: matchData.logicId.toLowerCase(),
      wins: matchData.wins,
      current_round: matchData.currentRound,
      status: statusMap[matchData.status] || 'OPEN',
      phase: phaseMap[matchData.phase] || 'COMMIT',
      max_players: matchData.maxPlayers,
      draw_counter: matchData.drawCounter,
      winner: matchData.winner?.toLowerCase(),
      created_at: new Date().toISOString()
    });
  } catch (err: any) {
    logger.error({ matchId: mId, err: err.message }, 'Failed to fetch missing match from chain');
  }
}

export async function startIndexer() {
  const { data: syncState } = await supabase.from('sync_state').select('last_processed_block').eq('id', 'indexer_v3').single();
  const startBlockEnv = process.env.START_BLOCK ? BigInt(process.env.START_BLOCK) : 0n;
  const fromBlock = BigInt(syncState?.last_processed_block || startBlockEnv);
  const currentBlock = await publicClient.getBlockNumber();
  
  logger.info({ fromBlock, currentBlock, escrow: ESCROW_ADDRESS }, 'V3 Indexer starting...');

  const handleLogs = async (logs: any[]) => {
    const parsedLogs = parseEventLogs({ abi: ESCROW_ABI, logs }) as any[];
    let lastBlock = 0n;
    for (const log of parsedLogs) {
      const logId = `${log.blockHash}-${log.logIndex}`;
      if (log.removed || processedLogIds.has(logId)) continue;
      await processLog(log);
      processedLogIds.add(logId);
      if (log.blockNumber > lastBlock) lastBlock = log.blockNumber;
    }
    if (lastBlock > 0n) {
      await supabase.from('sync_state').upsert({ id: 'indexer_v3', last_processed_block: Number(lastBlock) });
    }
  };

  // 1. Backfill Missed Blocks
  if (currentBlock > fromBlock) {
    let cursor = fromBlock + 1n;
    while (cursor <= currentBlock) {
      const toChunk = cursor + BACKFILL_CHUNK - 1n < currentBlock ? cursor + BACKFILL_CHUNK - 1n : currentBlock;
      logger.info({ cursor, toChunk }, 'Fetching historical logs...');
      const logs = await publicClient.getLogs({ 
        address: ESCROW_ADDRESS as `0x${string}`, 
        fromBlock: cursor, 
        toBlock: toChunk 
      });
      await handleLogs(logs);
      cursor = toChunk + 1n;
    }
  }

  logger.info('Switching to watch mode...');
  // 2. Real-time Monitoring
  publicClient.watchEvent({ address: ESCROW_ADDRESS as `0x${string}`, onLogs: handleLogs });
}

async function processLog(log: any) {
  const { eventName, args, blockNumber } = log;
  const mId = args.matchId ? getDbMatchId(args.matchId) : null;

  if (mId && eventName !== 'MatchCreated') {
    await ensureMatchExists(mId, BigInt(args.matchId));
  }

  logger.info({ eventName, matchId: mId }, 'Processing event');

  if (eventName === 'MatchCreated') {
    const { error } = await supabase.from('matches').upsert({ 
      match_id: mId, 
      players: [args.creator.toLowerCase()], 
      stake_wei: args.stake.toString(), 
      game_logic: args.logicId.toLowerCase(), 
      max_players: args.maxPlayers,
      wins_required: args.winsRequired || 3, // Default to 3 for backward compatibility
      status: 'OPEN', 
      phase: 'COMMIT', 
      current_round: 1,
      wins: Array(args.maxPlayers).fill(0),
      is_fise: true
    });
    if (error) logger.error({ mId, error }, 'Failed to insert MatchCreated');
    else logger.info({ mId }, 'Successfully inserted MatchCreated');
  } else if (eventName === 'MatchJoined') {
    try {
      const { data: match, error: fetchError } = await supabase.from('matches').select('players, max_players').eq('match_id', mId).maybeSingle();
      if (fetchError) throw fetchError;
      
      if (match) {
          const playerLower = args.player.toLowerCase();
          // Prevent duplicates
          if (match.players?.includes(playerLower)) {
              logger.info({ mId, player: playerLower }, 'MatchJoined: Player already in match, skipping');
              return;
          }
          const updatedPlayers = [...(match.players || []), playerLower];
          const isFull = updatedPlayers.length >= match.max_players;
          const { error } = await supabase.from('matches').update({ 
              players: updatedPlayers,
              status: isFull ? 'ACTIVE' : 'OPEN'
          }).eq('match_id', mId);
          
          if (error) logger.error({ mId, error }, 'Failed to update MatchJoined');
          else logger.info({ mId, isFull }, 'Successfully updated MatchJoined');
      } else if (mId) {
          logger.warn({ mId }, 'MatchJoined: Match not found in DB, attempting to fetch from chain...');
          await ensureMatchExists(mId, BigInt(args.matchId));
      } else {
          logger.error('MatchJoined: mId is null');
      }
    } catch (err: any) {
      logger.error({ mId, err: err.message }, 'Error processing MatchJoined');
    }
  } else if (eventName === 'RoundStarted') {
    await supabase.from('matches').update({ 
      current_round: args.round, 
      phase: 'COMMIT'
    }).eq('match_id', mId);
  } else if (eventName === 'MoveCommitted') {
    // Get player index from match
    const { data: match } = await supabase.from('matches').select('players').eq('match_id', mId).single();
    const playerIndex = match?.players?.indexOf(args.player.toLowerCase()) ?? 0;
    
    const { error } = await supabase.from('rounds').upsert({
      match_id: mId,
      round_number: args.round,
      player_address: args.player.toLowerCase(),
      player_index: playerIndex,
      revealed: false,
      commit_tx_hash: log.transactionHash
    }, { onConflict: 'match_id,round_number,player_address' });
    
    if (error) {
      logger.error({ mId, error }, 'MoveCommitted upsert FAILED');
    } else {
      logger.info({ mId, round: args.round, player: args.player.toLowerCase(), playerIndex }, 'MoveCommitted recorded');
    }
  } else if (eventName === 'MoveRevealed') {
    // Always upsert - handles both update and insert cases
    const { data: match } = await supabase.from('matches').select('players').eq('match_id', mId).single();
    const playerIndex = match?.players?.indexOf(args.player.toLowerCase()) ?? 0;
    
    // Fetch salt from contract (not in event)
    let salt = null;
    try {
      const commitData = await publicClient.readContract({
        address: ESCROW_ADDRESS as `0x${string}`,
        abi: ESCROW_ABI,
        functionName: 'roundCommits',
        args: [BigInt(args.matchId), args.round, args.player]
      }) as any;
      salt = commitData[2]; // salt is 3rd return value
    } catch (err: any) {
      logger.warn({ mId, player: args.player.toLowerCase(), err: err.message }, 'Failed to fetch salt from contract');
    }
    
    const { error: upsertError } = await supabase.from('rounds').upsert({
      match_id: mId,
      round_number: args.round,
      player_address: args.player.toLowerCase(),
      player_index: playerIndex,
      move: args.move,
      salt: salt,
      revealed: true,
      reveal_tx_hash: log.transactionHash
    }, { onConflict: 'match_id,round_number,player_address' });
    
    if (upsertError) {
      logger.error({ mId, error: upsertError }, 'MoveRevealed upsert FAILED');
    } else {
      logger.info({ mId, round: args.round, player: args.player.toLowerCase(), move: args.move, hasSalt: !!salt }, 'MoveRevealed recorded');
    }
  } else if (eventName === 'RoundResolved') {
    // winnerIndex 255 = Draw
    await supabase.from('rounds').update({ 
        winner: args.winnerIndex === 255 ? 0 : args.winnerIndex + 1 
    }).match({ match_id: mId, round_number: args.round });
    
    // Refresh match scores and full state
    const matchData = await publicClient.readContract({
        address: ESCROW_ADDRESS as `0x${string}`,
        abi: ESCROW_ABI,
        functionName: 'getMatch',
        args: [BigInt(args.matchId)]
    }) as any;
    
    await supabase.from('matches').update({ 
      wins: matchData.wins,
      total_pot: matchData.totalPot.toString(),
      draw_counter: matchData.drawCounter
    }).eq('match_id', mId);

  } else if (eventName === 'MatchSettled') {
    await supabase.from('matches').update({ 
      status: 'SETTLED', 
      winner: args.winner.toLowerCase(), 
      payout_amount: args.payout.toString(),
      phase: 'COMPLETE',
      settle_tx_hash: log.transactionHash
    }).eq('match_id', mId);
  } else if (eventName === 'MatchVoided') {
    await supabase.from('matches').update({ status: 'VOIDED', phase: 'COMPLETE' }).eq('match_id', mId);
  }
}

startIndexer().catch(console.error);
