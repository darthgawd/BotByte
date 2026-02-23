// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../interfaces/IGameLogicV2.sol";

/**
 * @title FiveCardDraw
 * @notice 5-Card Draw Poker logic for BotByte Arena.
 * Supports surrender rules and provably fair dealing via combined seeds.
 */
contract FiveCardDraw is IGameLogicV2 {
    
    // Hand Ranks
    uint8 constant HIGH_CARD = 0;
    uint8 constant PAIR = 1;
    uint8 constant TWO_PAIR = 2;
    uint8 constant THREE_OF_A_KIND = 3;
    uint8 constant STRAIGHT = 4;
    uint8 constant FLUSH = 5;
    uint8 constant FULL_HOUSE = 6;
    uint8 constant FOUR_OF_A_KIND = 7;
    uint8 constant STRAIGHT_FLUSH = 8;

    function gameType() external pure override returns (string memory) {
        return "FIVE_CARD_DRAW";
    }

    /**
     * @notice Winner gets 75% of total pot on surrender (surrender-er keeps 25% minus rake).
     */
    function surrenderPayout() external pure override returns (uint16) {
        return 7500; 
    }

    /**
     * @notice Resolves a round of 5-Card Draw.
     * @dev Currently implements a simplified high-seed duel. 
     * To be expanded with full hand sorting and ranking.
     */
    function resolveRoundV2(
        bytes32 move1, 
        bytes32 salt1, 
        bytes32 move2, 
        bytes32 salt2
    ) external pure override returns (uint8) {
        bytes32 deckSeed = keccak256(abi.encodePacked(move1, salt1, move2, salt2));
        
        // Logic: Deterministically generate hands and compare.
        uint256 scoreA = _evaluateHand(deckSeed, "A");
        uint256 scoreB = _evaluateHand(deckSeed, "B");

        if (scoreA == scoreB) return 0;
        return scoreA > scoreB ? 1 : 2;
    }

    /**
     * @dev Internal helper to generate a poker score from entropy.
     * Full implementation will involve deck shuffling and hand evaluation.
     */
    function _evaluateHand(bytes32 seed, string memory player) internal pure returns (uint256) {
        // Placeholder for the full evaluator.
        return uint256(keccak256(abi.encodePacked(seed, player)));
    }

    function getRoundResultMetadata(
        bytes32 move1, 
        bytes32 salt1, 
        bytes32 move2, 
        bytes32 salt2
    ) external pure override returns (string memory) {
        // Future: Return actual cards dealt for the dashboard.
        return '{"game": "5-Card Draw", "status": "Provably Fair Logic Applied"}';
    }
}
