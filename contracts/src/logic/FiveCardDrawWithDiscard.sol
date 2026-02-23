// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./FiveCardDraw.sol";

/**
 * @title FiveCardDrawWithDiscard
 * @notice 5-Card Draw Poker with shared deck, discard, and replacement cards.
 * Inherits hand evaluation from FiveCardDraw and adds draw mechanics.
 *
 * Dealing uses a single shared 52-card deck so no two players can hold
 * the same card.  After the initial deal each player submits a 5-bit
 * discard mask; discarded cards are replaced from the remaining deck.
 *
 * Stack-depth note: uses uint256 bitfield (not bool[52]) and structs to
 * stay within EVM limits when compiled with via_ir.
 */
contract FiveCardDrawWithDiscard is FiveCardDraw {

    struct DrawResult {
        uint8[5] startA;
        uint8[5] startB;
        uint8[5] finalA;
        uint8[5] finalB;
    }

    struct InternalState {
        uint256 used;   // bitfield tracking which of 52 cards are in play
        uint256 idx;    // next entropy index for drawing cards
        uint8 card;     // scratch variable for current card
    }

    // ─── Overrides ────────────────────────────────────────────────────

    function gameType() external pure virtual override returns (string memory) {
        return "FIVE_CARD_DRAW_WITH_DISCARD";
    }

    function requiresDiscard() external pure virtual override returns (bool) {
        return true;
    }

    // ─── Core draw logic ──────────────────────────────────────────────

    /**
     * @dev Deal 10 unique cards from a shared deck, apply discard masks,
     *      draw replacements, and return full hand history.
     */
    function _resolveDrawFull(
        bytes32 seed,
        uint8 maskA,
        uint8 maskB
    ) internal pure virtual returns (DrawResult memory res) {
        InternalState memory s;

        // Deal 5 cards to player A
        for (uint256 i = 0; i < 5; i++) {
            s.card = uint8(uint256(keccak256(abi.encodePacked(seed, s.idx))) % 52);
            s.idx++;
            while (s.used & (1 << s.card) != 0) {
                s.card = uint8((uint256(s.card) + 1) % 52);
            }
            s.used |= (1 << s.card);
            res.startA[i] = s.card;
        }

        // Deal 5 cards to player B
        for (uint256 i = 0; i < 5; i++) {
            s.card = uint8(uint256(keccak256(abi.encodePacked(seed, s.idx))) % 52);
            s.idx++;
            while (s.used & (1 << s.card) != 0) {
                s.card = uint8((uint256(s.card) + 1) % 52);
            }
            s.used |= (1 << s.card);
            res.startB[i] = s.card;
        }

        // Copy starting hands to final
        for (uint256 i = 0; i < 5; i++) {
            res.finalA[i] = res.startA[i];
            res.finalB[i] = res.startB[i];
        }

        // Replace discarded cards for player A
        for (uint256 i = 0; i < 5; i++) {
            if (maskA & (1 << uint8(i)) != 0) {
                s.card = uint8(uint256(keccak256(abi.encodePacked(seed, s.idx))) % 52);
                s.idx++;
                while (s.used & (1 << s.card) != 0) {
                    s.card = uint8((uint256(s.card) + 1) % 52);
                }
                s.used |= (1 << s.card);
                res.finalA[i] = s.card;
            }
        }

        // Replace discarded cards for player B
        for (uint256 i = 0; i < 5; i++) {
            if (maskB & (1 << uint8(i)) != 0) {
                s.card = uint8(uint256(keccak256(abi.encodePacked(seed, s.idx))) % 52);
                s.idx++;
                while (s.used & (1 << s.card) != 0) {
                    s.card = uint8((uint256(s.card) + 1) % 52);
                }
                s.used |= (1 << s.card);
                res.finalB[i] = s.card;
            }
        }
    }

    /**
     * @dev Deal initial shared deck (no discards). Thin wrapper around _resolveDrawFull.
     */
    function _dealSharedDeck(bytes32 seed) internal pure virtual returns (
        uint8[5] memory cardsA,
        uint8[5] memory cardsB
    ) {
        DrawResult memory res = _resolveDrawFull(seed, 0, 0);
        return (res.startA, res.startB);
    }

    /**
     * @dev Evaluate two hands and return (winner, scoreA, scoreB).
     */
    function _computeWinner(
        uint8[5] memory handA,
        uint8[5] memory handB
    ) internal pure virtual returns (uint8 winner, uint256 scoreA, uint256 scoreB) {
        scoreA = _evaluateCards(handA);
        scoreB = _evaluateCards(handB);
        if (scoreA == scoreB) return (0, scoreA, scoreB);
        return (scoreA > scoreB ? 1 : 2, scoreA, scoreB);
    }

    // ─── External interface ───────────────────────────────────────────

    function resolveDraw(
        bytes32 seed,
        uint8 discardMaskA,
        uint8 discardMaskB
    ) external pure virtual override returns (uint8) {
        DrawResult memory res = _resolveDrawFull(seed, discardMaskA, discardMaskB);
        (uint8 winner,,) = _computeWinner(res.finalA, res.finalB);
        return winner;
    }

    function getDrawResultMetadata(
        bytes32 seed,
        uint8 discardMaskA,
        uint8 discardMaskB
    ) external pure virtual override returns (string memory) {
        DrawResult memory res = _resolveDrawFull(seed, discardMaskA, discardMaskB);
        (uint8 winner, uint256 scoreA, uint256 scoreB) = _computeWinner(res.finalA, res.finalB);
        uint8 rankA = uint8(scoreA >> 20);
        uint8 rankB = uint8(scoreB >> 20);

        return string(abi.encodePacked(
            _buildDrawMetaPartA(res, discardMaskA, rankA),
            _buildDrawMetaPartB(res, discardMaskB, rankB, winner)
        ));
    }

    function _buildDrawMetaPartA(
        DrawResult memory res,
        uint8 maskA,
        uint8 rankA
    ) internal pure returns (string memory) {
        return string(abi.encodePacked(
            '{"game":"5-Card Draw With Discard","phase":"draw","playerA":{"startingHand":"',
            _cardsToString(res.startA),
            '","discardMask":', _uint8ToString(maskA),
            ',"finalHand":"', _cardsToString(res.finalA),
            '","handRank":', _uint8ToString(rankA), '}'
        ));
    }

    function _buildDrawMetaPartB(
        DrawResult memory res,
        uint8 maskB,
        uint8 rankB,
        uint8 winner
    ) internal pure returns (string memory) {
        return string(abi.encodePacked(
            ',"playerB":{"startingHand":"',
            _cardsToString(res.startB),
            '","discardMask":', _uint8ToString(maskB),
            ',"finalHand":"', _cardsToString(res.finalB),
            '","handRank":', _uint8ToString(rankB),
            '},"winner":', _uint8ToString(winner), '}'
        ));
    }

    function resolveRoundV2(
        bytes32 move1,
        bytes32 salt1,
        bytes32 move2,
        bytes32 salt2
    ) external pure virtual override returns (uint8) {
        bytes32 deckSeed = keccak256(abi.encodePacked(move1, salt1, move2, salt2));
        DrawResult memory res = _resolveDrawFull(deckSeed, 0, 0);
        (uint8 winner,,) = _computeWinner(res.finalA, res.finalB);
        return winner;
    }

    function getRoundResultMetadata(
        bytes32 move1,
        bytes32 salt1,
        bytes32 move2,
        bytes32 salt2
    ) external pure virtual override returns (string memory) {
        bytes32 deckSeed = keccak256(abi.encodePacked(move1, salt1, move2, salt2));
        DrawResult memory res = _resolveDrawFull(deckSeed, 0, 0);
        (uint8 winner, uint256 scoreA, uint256 scoreB) = _computeWinner(res.finalA, res.finalB);
        uint8 rankA = uint8(scoreA >> 20);
        uint8 rankB = uint8(scoreB >> 20);

        return string(abi.encodePacked(
            _buildDrawMetaPartA(res, 0, rankA),
            _buildDrawMetaPartB(res, 0, rankB, winner)
        ));
    }
}
