/**
 * ShowdownBlitzPoker Multiplayer - Falken FISE Game Logic (N-Player Dynamic)
 * 5-Card Draw, 1-Swap, Supports 2-6 players dynamically
 */

export default class ShowdownBlitzPokerMultiplayer {
  init(ctx) {
    const players = (ctx.players || []).map(p => p.toLowerCase());
    if (players.length < 3) {
      throw new Error("Multiplayer poker requires at least 3 players. Use poker.js for 2-player games.");
    }
    
    return {
      players, // Array of all player addresses
      playerCount: players.length,
      stake: ctx.stake,
      matchId: ctx.matchId,
      hands: {}, // Map: playerAddress -> hand array
      discards: {}, // Map: playerAddress -> discard indices
      complete: false,
      result: 255 // Default to Draw
    };
  }

  generateDeck(seedStr) {
    let hash = 0;
    for (let i = 0; i < seedStr.length; i++) {
      hash = ((hash << 5) - hash) + seedStr.charCodeAt(i);
      hash |= 0;
    }
    const deck = Array.from({ length: 52 }, (_, i) => i);
    for (let i = deck.length - 1; i > 0; i--) {
      hash = (Math.imul(1664525, hash) + 1013904223) | 0;
      const j = Math.abs(hash % (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
  }

  getPlayerIndex(state, playerAddress) {
    return state.players.indexOf(playerAddress.toLowerCase());
  }

  processMove(state, move) {
    if (state.complete || !move.player) return state;
    const player = move.player.toLowerCase();
    
    const playerIdx = this.getPlayerIndex(state, player);
    if (playerIdx === -1) return state; // Not a participant
    
    const deck = this.generateDeck(state.matchId + "_" + move.round);
    
    // Deal initial hand for this player
    // Player i gets cards from i*5 to i*5+4
    const initialHandOffset = playerIdx * 5;
    const initialHand = deck.slice(initialHandOffset, initialHandOffset + 5);
    
    // Parse discard indices (e.g., "024" = discard cards 0, 2, and 4)
    const moveData = move.moveData.toString();
    // Handle both 0 and 99 as STAY (keep all cards) for backward compatibility
    const discardIndices = (moveData === '0' || moveData === '99' || moveData === '') ? [] : moveData.split('').map(Number);
    state.discards[player] = discardIndices;
    
    let finalHand = [...initialHand];
    
    // Replacements come after all initial hands
    // For N players, initial hands use 0 to N*5-1
    // Replacements start at N*5, each player gets 5 replacement cards
    const replacementOffset = (state.playerCount * 5) + (playerIdx * 5);
    discardIndices.forEach((idx, i) => {
      if (idx >= 0 && idx < 5) {
        finalHand[idx] = deck[replacementOffset + i];
      }
    });

    state.hands[player] = finalHand;

    // Check if all players have submitted hands
    const allRevealed = state.players.every(p => state.hands[p.toLowerCase()] !== undefined);
    
    // Log progress
    const revealedCount = Object.keys(state.hands).length;
    console.log(`[Poker-Multiplayer] Round ${move.round}: ${revealedCount}/${state.playerCount} revealed`);
    
    if (allRevealed) {
      state.complete = true;
      state.result = this.evaluateWinner(state);
    }

    return state;
  }

  evaluateWinner(state) {
    // Calculate scores for all players
    const scores = state.players.map((player, idx) => ({
      index: idx,
      player: player,
      score: this.calculateHandStrength(state.hands[player])
    }));
    
    // Sort by score descending
    scores.sort((a, b) => b.score - a.score);
    
    // Check for tie (draw)
    if (scores.length > 1 && scores[0].score === scores[1].score) {
      return 255; // Draw
    }
    
    // Return index of winner (0-based)
    return scores[0].index;
  }

  calculateHandStrength(hand) {
    // Rank: 0=2, 1=3, ..., 11=K, 12=A
    const ranks = hand.map(c => c % 13).sort((a, b) => b - a);
    const suits = hand.map(c => Math.floor(c / 13));
    
    const counts = {};
    ranks.forEach(r => counts[r] = (counts[r] || 0) + 1);
    
    // Sort by frequency (desc), then by rank (desc)
    const sortedCounts = Object.entries(counts)
      .map(([rank, count]) => [Number(rank), count])
      .sort((a, b) => b[1] - a[1] || b[0] - a[0]);
    
    const isFlush = new Set(suits).size === 1;
    
    // Straight detection
    let isStraight = false;
    let straightHighRank = -1;
    const isNormalStraight = ranks.every((r, i) => i === 0 || ranks[i-1] - r === 1);
    if (isNormalStraight) {
      isStraight = true;
      straightHighRank = ranks[0];
    } else if (ranks[0] === 12 && ranks[1] === 3 && ranks[2] === 2 && ranks[3] === 1 && ranks[4] === 0) {
      isStraight = true;
      straightHighRank = 3;
    }

    let handRank = 0; 
    if (isStraight && isFlush) handRank = 8;
    else if (sortedCounts[0][1] === 4) handRank = 7;
    else if (sortedCounts[0][1] === 3 && sortedCounts[1][1] === 2) handRank = 6;
    else if (isFlush) handRank = 5;
    else if (isStraight) handRank = 4;
    else if (sortedCounts[0][1] === 3) handRank = 3;
    else if (sortedCounts[0][1] === 2 && sortedCounts[1][1] === 2) handRank = 2;
    else if (sortedCounts[0][1] === 2) handRank = 1;

    // Score packing [HandRank][Rank1][Rank2][Rank3][Rank4][Rank5]
    let score = handRank * Math.pow(16, 5);
    
    if (isStraight) {
      score += straightHighRank * Math.pow(16, 4);
    } else {
      let power = 4;
      for (let i = 0; i < sortedCounts.length; i++) {
        const [rank, count] = sortedCounts[i];
        for (let j = 0; j < count; j++) {
          score += rank * Math.pow(16, power--);
        }
      }
    }

    return score;
  }

  checkResult(state) {
    if (!state.complete) return 0; // PENDING
    return state.result;
  }

  describeState(state) {
    const labels = ['High Card', 'Pair', 'Two Pair', 'Three of a Kind', 'Straight', 'Flush', 'Full House', 'Four of a Kind', 'Straight Flush'];
    
    if (!state.complete) {
      const revealedCount = Object.keys(state.hands).length;
      const revealedPlayers = state.players
        .filter(p => state.hands[p.toLowerCase()])
        .map(p => p.slice(0, 6) + '...')
        .join(', ');
      return `Waiting... ${revealedCount}/${state.playerCount} revealed\nRevealed: ${revealedPlayers || 'none'}`;
    }
    
    // Build description for all hands
    const descriptions = state.players.map((player, idx) => {
      const hand = state.hands[player];
      if (!hand) return `${player.slice(0, 6)}...: No hand`;
      
      const score = this.calculateHandStrength(hand);
      const rank = Math.floor(score / Math.pow(16, 5));
      const label = labels[rank] || 'Unknown';
      
      const cardNames = hand.map(c => this.cardName(c)).join(' ');
      return `Player ${idx} (${player.slice(0, 6)}...): ${label} - ${cardNames}`;
    });
    
    return descriptions.join('\n');
  }

  cardName(cardIndex) {
    const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
    const suits = ['♣️', '♦️', '❤️', '♠️'];
    return ranks[cardIndex % 13] + suits[Math.floor(cardIndex / 13)];
  }
}
