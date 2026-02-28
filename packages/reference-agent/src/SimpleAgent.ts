import { ethers, Contract } from 'ethers';
import { SaltManager } from './SaltManager.js';
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
});

const ESCROW_ABI = [
  "function joinMatch(uint256 _matchId) payable",
  "function commitMove(uint256 _matchId, bytes32 _commitHash)",
  "function revealMove(uint256 _matchId, uint8 _move, bytes32 _salt)",
  "function getMatch(uint256 _matchId) view returns (address, address, uint256, address, uint8, uint8, uint8, uint8, uint8, uint8, uint256, uint256)",
  "function matchCounter() view returns (uint256)",
  "function getRoundStatus(uint256 matchId, uint8 round, address player) view returns (bytes32 commitHash, bool revealed)"
];

/**
 * A simple reference agent that can join games and play RPS.
 * Developers can extend this to add LLM-based strategy.
 */
export class SimpleAgent {
  private provider: ethers.JsonRpcProvider;
  private wallet: ethers.Wallet;
  private escrow: Contract;
  private saltManager: SaltManager;
  private escrowAddress: string;

  constructor(privateKey: string) {
    this.provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
    this.wallet = new ethers.Wallet(privateKey, this.provider);
    this.escrowAddress = process.env.ESCROW_ADDRESS!.toLowerCase();
    this.escrow = new Contract(this.escrowAddress, ESCROW_ABI, this.wallet);
    this.saltManager = new SaltManager();
  }

  async run() {
    logger.info({ address: this.wallet.address }, '🤖 Agent active');
    
    while (true) {
      try {
        await this.handleMatches();
        await new Promise(resolve => setTimeout(resolve, 20000)); // Poll every 20s
      } catch (e) {
        logger.error(e, 'Agent Loop Error');
        await new Promise(resolve => setTimeout(resolve, 10000));
      }
    }
  }

  async handleMatches() {
    let matchCount = 0;
    try {
      const counter = await this.escrow.matchCounter();
      matchCount = Number(counter);
    } catch (err) {
      logger.warn('Failed to fetch matchCounter, skipping scan.');
      return;
    }

    const start = Math.max(1, matchCount - 5);
    for (let i = start; i <= matchCount; i++) {
      try {
        const [
          playerA, playerB, stake, gameLogic, 
          winsA, winsB, currentRound, drawCounter, 
          phase, status, commitDeadline, revealDeadline
        ] = await this.escrow.getMatch(i);

        const s = Number(status);
        const pA = playerA.toLowerCase();
        const pB = playerB.toLowerCase();
        const myAddress = this.wallet.address.toLowerCase();

        // 1. Discovery: If match is OPEN and we aren't Player A, join it
        if (s === 0 && pA !== myAddress) {
          // ONLY JOIN RPS JS LOGIC
          let logicId = gameLogic.toLowerCase();
          if (logicId === this.escrowAddress) {
             const fiseEscrow = new Contract(this.escrowAddress, ["function fiseMatches(uint256) view returns (bytes32)"], this.provider);
             logicId = (await fiseEscrow.fiseMatches(i)).toLowerCase();
          }

          if (logicId === '0xf2f80f1811f9e2c534946f0e8ddbdbd5c1e23b6e48772afe3bccdb9f2e1cfdf3' || 
              logicId === '0xeab3c0b5d2eb106900c3d910b01a89c6ab7e4fc0a79eca8d75fb7a805cfef9fb') {
            logger.info({ matchId: i, logicId }, 'Found OPEN FISE JS match, joining...');
            await this.joinMatch(i, stake);
          } else {
            logger.debug({ matchId: i, logicId }, 'Skipping match: Logic ID mismatch');
          }
        }

        // 2. Gameplay: If match is ACTIVE and we are a participant, play the round
        if (s === 1 && (pA === myAddress || pB === myAddress)) {
          const now = Math.floor(Date.now() / 1000);
          const deadline = Number(phase) === 0 ? Number(commitDeadline) : Number(revealDeadline);
          
          if (deadline > 0 && now > deadline) {
            logger.warn({ matchId: i, phase: Number(phase) }, 'Match deadline passed, skipping');
            continue;
          }

          logger.debug({ matchId: i, round: Number(currentRound) }, 'Processing active match');
          
          // Re-pack for playRound
          const mData = {
            playerA, playerB, stake, gameLogic, 
            winsA, winsB, currentRound, drawCounter, 
            phase, status: s, commitDeadline, revealDeadline
          };
          await this.playRound(i, mData);
        }
      } catch (err: any) {
        logger.warn({ matchId: i, error: err.message }, 'Error processing match, skipping this match');
      }
    }
  }

  private async joinMatch(matchId: number, stake: bigint) {
    logger.info({ matchId, stake: ethers.formatEther(stake) }, '🤝 Joining match');
    try {
      const tx = await this.escrow.joinMatch(matchId, { value: stake });
      await tx.wait();
      logger.info({ hash: tx.hash }, '✅ Joined match');
    } catch (err) {
      logger.error(err, 'Failed to join match');
    }
  }

  private async playRound(matchId: number, matchData: any) {
    const round = Number(matchData.currentRound);
    const phase = Number(matchData.phase);
    const dbMatchId = `${this.escrowAddress}-${matchId}`;

    const status = await this.escrow.getRoundStatus(matchId, round, this.wallet.address);
    const [commitHash, revealed] = status;

    if (phase === 0 && commitHash === ethers.ZeroHash) {
      // Pick move (Strategy goes here!)
      let move = 0;
      
      let logicId = matchData.gameLogic.toLowerCase();
      
      // If the logic address is the Escrow itself, it's a FISE JS match
      if (logicId === this.escrowAddress) {
        try {
          // Fetch the actual Logic ID from the fiseMatches mapping
          const fiseEscrow = new Contract(this.escrowAddress, [
            "function fiseMatches(uint256) view returns (bytes32)"
          ], this.provider);
          logicId = (await fiseEscrow.fiseMatches(matchId)).toLowerCase();
          logger.info({ matchId, logicId }, 'Detected FISE JS match');
        } catch (err) {
          logger.warn({ matchId }, 'Failed to fetch FISE logic ID');
        }
      }

      // Detect game type for move range
      if (logicId === '0xada4dcc50ff30f57dba673b4868f2ed6faacefb6a8fc47fc3876ee8bc385fd47') {
        // HighRollerDice (1-100)
        move = Math.floor(Math.random() * 100) + 1;
        logger.info({ matchId, round, move }, '🎲 Picking HighRoller move (1-100)');
      } else if (logicId === '0xf2f80f1811f9e2c534946f0e8ddbdbd5c1e23b6e48772afe3bccdb9f2e1cfdf3') {
        // RockPaperScissorsJS (0-2)
        move = Math.floor(Math.random() * 3);
        logger.info({ matchId, round, move }, '🎲 Picking RPS JS move (0-2)');
      } else if (logicId === '0xeab3c0b5d2eb106900c3d910b01a89c6ab7e4fc0a79eca8d75fb7a805cfef9fb') {
        // LiarsDiceJS (Packed BID or CALL)
        const shouldCall = Math.random() < 0.1;
        if (shouldCall) {
          move = 0;
          logger.info({ matchId, round }, '🎲 Picking LiarsDice CALL (0)');
        } else {
          const quantity = Math.floor(Math.random() * 3) + 1;
          const face = Math.floor(Math.random() * 6) + 1;
          move = (quantity * 10) + face;
          logger.info({ matchId, round, quantity, face }, '🎲 Picking LiarsDice BID');
        }
      } else {
        // Standard RPS (0-2)
        move = Math.floor(Math.random() * 3);
        logger.info({ matchId, round, move }, '🎲 Picking Standard RPS move (0-2)');
      }

      const salt = ethers.hexlify(ethers.randomBytes(32));
      
      // Hash calculation MUST match MatchEscrow.sol:
      // keccak256(abi.encodePacked("FALKEN_V1", address(this), _matchId, m.currentRound, msg.sender, _move, _salt))
      const hash = ethers.solidityPackedKeccak256(
        ['string', 'address', 'uint256', 'uint256', 'address', 'uint256', 'bytes32'],
        ["FALKEN_V1", this.escrowAddress, matchId, round, this.wallet.address, move, salt]
      );

      await this.saltManager.saveSalt({ matchId: dbMatchId, round, move, salt });
      logger.info({ matchId, round, move }, '🎲 Committing move');
      const tx = await this.escrow.commitMove(matchId, hash);
      await tx.wait();
    } 
    else if (phase === 1 && !revealed) {
      const entry = await this.saltManager.getSalt(dbMatchId, round);
      if (entry) {
        logger.info({ matchId, round }, '🔓 Revealing move');
        const tx = await this.escrow.revealMove(matchId, entry.move, entry.salt);
        await tx.wait();
      }
    }
  }
}
