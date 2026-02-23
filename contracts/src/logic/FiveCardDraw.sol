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
    uint8 constant ROYAL_FLUSH = 9;

    function gameType() external pure virtual override returns (string memory) {
        return "FIVE_CARD_DRAW";
    }

    /**
     * @notice Winner gets 75% of total pot on surrender (surrender-er keeps 25% minus rake).
     */
    function surrenderPayout() external pure override returns (uint16) {
        return 7500;
    }

    function requiresDiscard() external pure virtual override returns (bool) {
        return false;
    }

    function resolveDraw(bytes32, uint8, uint8) external pure virtual override returns (uint8) {
        revert("No discard");
    }

    function getDrawResultMetadata(bytes32, uint8, uint8) external pure virtual override returns (string memory) {
        revert("No discard");
    }

    /**
     * @notice Resolves a round of 5-Card Draw.
     */
    function resolveRoundV2(
        bytes32 move1,
        bytes32 salt1,
        bytes32 move2,
        bytes32 salt2
    ) external pure virtual override returns (uint8) {
        bytes32 deckSeed = keccak256(abi.encodePacked(move1, salt1, move2, salt2));

        uint256 scoreA = _evaluateHand(deckSeed, "A");
        uint256 scoreB = _evaluateHand(deckSeed, "B");

        if (scoreA == scoreB) return 0;
        return scoreA > scoreB ? 1 : 2;
    }

    /**
     * @dev Deal 5 unique cards deterministically from entropy.
     * Each card is 0-51. Collisions are resolved by incrementing mod 52.
     */
    function _dealCards(bytes32 seed, string memory player) internal pure virtual returns (uint8[5] memory cards) {
        for (uint256 i = 0; i < 5; i++) {
            uint8 card = uint8(uint256(keccak256(abi.encodePacked(seed, player, i))) % 52);
            // Resolve collisions
            bool collision = true;
            while (collision) {
                collision = false;
                for (uint256 j = 0; j < i; j++) {
                    if (cards[j] == card) {
                        card = uint8((uint256(card) + 1) % 52);
                        collision = true;
                        break;
                    }
                }
            }
            cards[i] = card;
        }
    }

    /**
     * @dev Sort 5 ranks descending using insertion sort.
     */
    function _sortDesc(uint8[5] memory arr) internal pure {
        for (uint256 i = 1; i < 5; i++) {
            uint8 key = arr[i];
            uint256 j = i;
            while (j > 0 && arr[j - 1] < key) {
                arr[j] = arr[j - 1];
                j--;
            }
            arr[j] = key;
        }
    }

    /**
     * @dev Evaluate a poker hand and return a comparable score.
     * Score format: handRank << 20 | kicker bits (20 bits for 5 x 4-bit ranks).
     */
    function _evaluateHand(bytes32 seed, string memory player) internal pure virtual returns (uint256) {
        uint8[5] memory cards = _dealCards(seed, player);
        return _evaluateCards(cards);
    }

    /**
     * @dev Evaluate 5 cards and return a comparable score.
     */
    function _evaluateCards(uint8[5] memory cards) internal pure virtual returns (uint256) {
        // Extract ranks and suits
        uint8[5] memory ranks;
        uint8[5] memory suits;
        for (uint256 i = 0; i < 5; i++) {
            ranks[i] = cards[i] / 4;  // 0-12 (2..Ace)
            suits[i] = cards[i] % 4;  // 0-3
        }

        // Sort ranks descending
        _sortDesc(ranks);

        // Check flush
        bool isFlush = (suits[0] == suits[1]) && (suits[1] == suits[2]) && (suits[2] == suits[3]) && (suits[3] == suits[4]);

        // Check straight
        bool isStraight = false;
        bool isWheel = false;
        // Normal straight: consecutive descending ranks
        if (ranks[0] - ranks[4] == 4 &&
            ranks[0] != ranks[1] && ranks[1] != ranks[2] && ranks[2] != ranks[3] && ranks[3] != ranks[4]) {
            isStraight = true;
        }
        // Wheel: A-2-3-4-5 → sorted as [12, 3, 2, 1, 0]
        if (ranks[0] == 12 && ranks[1] == 3 && ranks[2] == 2 && ranks[3] == 1 && ranks[4] == 0) {
            isStraight = true;
            isWheel = true;
        }

        // Count rank frequencies
        uint8[13] memory freq;
        for (uint256 i = 0; i < 5; i++) {
            freq[ranks[i]]++;
        }

        uint8 pairs = 0;
        uint8 threes = 0;
        uint8 fours = 0;
        for (uint256 i = 0; i < 13; i++) {
            if (freq[i] == 2) pairs++;
            else if (freq[i] == 3) threes++;
            else if (freq[i] == 4) fours++;
        }

        // Classify hand
        uint8 handRank;
        if (isFlush && isStraight) {
            if (!isWheel && ranks[0] == 12 && ranks[1] == 11) {
                handRank = ROYAL_FLUSH;
            } else {
                handRank = STRAIGHT_FLUSH;
            }
        } else if (fours == 1) {
            handRank = FOUR_OF_A_KIND;
        } else if (threes == 1 && pairs == 1) {
            handRank = FULL_HOUSE;
        } else if (isFlush) {
            handRank = FLUSH;
        } else if (isStraight) {
            handRank = STRAIGHT;
        } else if (threes == 1) {
            handRank = THREE_OF_A_KIND;
        } else if (pairs == 2) {
            handRank = TWO_PAIR;
        } else if (pairs == 1) {
            handRank = PAIR;
        } else {
            handRank = HIGH_CARD;
        }

        // Build kicker bits: for wheel straights, rearrange to [3,2,1,0,12] (5-high)
        uint256 kickers = 0;
        if (isWheel) {
            // 5-high straight: kickers are 3,2,1,0 (the 5 is high card of the straight)
            kickers = (uint256(3) << 16) | (uint256(2) << 12) | (uint256(1) << 8) | (uint256(0) << 4) | uint256(12);
        } else {
            for (uint256 i = 0; i < 5; i++) {
                kickers |= uint256(ranks[i]) << (4 * (4 - i));
            }
        }

        return (uint256(handRank) << 20) | kickers;
    }

    function getRoundResultMetadata(
        bytes32 move1,
        bytes32 salt1,
        bytes32 move2,
        bytes32 salt2
    ) external pure virtual override returns (string memory) {
        bytes32 deckSeed = keccak256(abi.encodePacked(move1, salt1, move2, salt2));

        uint8[5] memory cardsA = _dealCards(deckSeed, "A");
        uint8[5] memory cardsB = _dealCards(deckSeed, "B");

        uint256 scoreA = _evaluateHand(deckSeed, "A");
        uint256 scoreB = _evaluateHand(deckSeed, "B");

        uint8 rankA = uint8(scoreA >> 20);
        uint8 rankB = uint8(scoreB >> 20);

        uint8 winner;
        if (scoreA == scoreB) winner = 0;
        else if (scoreA > scoreB) winner = 1;
        else winner = 2;

        return string(abi.encodePacked(
            '{"game":"5-Card Draw","playerA":{"cards":"',
            _cardsToString(cardsA),
            '","handRank":', _uint8ToString(rankA),
            '},"playerB":{"cards":"',
            _cardsToString(cardsB),
            '","handRank":', _uint8ToString(rankB),
            '},"winner":', _uint8ToString(winner),
            '}'
        ));
    }

    function _cardsToString(uint8[5] memory cards) internal pure returns (string memory) {
        bytes memory result = "";
        bytes memory rankChars = "23456789TJQKA";
        bytes memory suitChars = "SHDC";
        for (uint256 i = 0; i < 5; i++) {
            if (i > 0) result = abi.encodePacked(result, ",");
            uint8 rank = cards[i] / 4;
            uint8 suit = cards[i] % 4;
            result = abi.encodePacked(result, rankChars[rank], suitChars[suit]);
        }
        return string(result);
    }

    function _uint8ToString(uint8 v) internal pure returns (string memory) {
        if (v == 0) return "0";
        uint8 temp = v;
        uint8 digits;
        while (temp != 0) {
            digits++;
            temp /= 10;
        }
        bytes memory buffer = new bytes(digits);
        while (v != 0) {
            digits--;
            buffer[digits] = bytes1(uint8(48 + v % 10));
            v /= 10;
        }
        return string(buffer);
    }
}
