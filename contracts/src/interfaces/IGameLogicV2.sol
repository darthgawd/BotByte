// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title IGameLogicV2
 * @notice Enhanced interface for games requiring higher entropy or complex move types.
 */
interface IGameLogicV2 {
    /**
     * @notice Resolves a round using full move and salt data for high-entropy games (like Poker).
     * @param move1 The move (or seed) from player 1.
     * @param salt1 The salt from player 1.
     * @param move2 The move (or seed) from player 2.
     * @param salt2 The salt from player 2.
     * @return winner The winner (0=Draw, 1=PlayerA, 2=PlayerB).
     */
    function resolveRoundV2(
        bytes32 move1, 
        bytes32 salt1, 
        bytes32 move2, 
        bytes32 salt2
    ) external pure returns (uint8 winner);

    function gameType() external view returns (string memory);
    
    /**
     * @notice Returns metadata about the game (e.g. card board, dice results) 
     * based on the revealed seeds. Useful for dashboard replay.
     */
    function getRoundResultMetadata(
        bytes32 move1, 
        bytes32 salt1, 
        bytes32 move2, 
        bytes32 salt2
    ) external pure returns (string memory jsonMetadata);

    /**
     * @notice Returns the payout multiplier for a surrender action.
     * @return winnerShareBps The basis points of the total pot awarded to the winner (e.g. 7500 = 75%).
     */
    function surrenderPayout() external pure returns (uint16 winnerShareBps);

    /**
     * @notice Whether this game requires a discard/draw phase after reveal.
     */
    function requiresDiscard() external view returns (bool);

    /**
     * @notice Resolves a round after the discard/draw phase.
     * @param seed Combined entropy seed for dealing.
     * @param discardMaskA 5-bit bitmask of cards player A discards.
     * @param discardMaskB 5-bit bitmask of cards player B discards.
     * @return winner 0=Draw, 1=PlayerA, 2=PlayerB.
     */
    function resolveDraw(bytes32 seed, uint8 discardMaskA, uint8 discardMaskB) external pure returns (uint8 winner);

    /**
     * @notice Returns metadata about the draw phase result.
     */
    function getDrawResultMetadata(bytes32 seed, uint8 discardMaskA, uint8 discardMaskB) external pure returns (string memory);
}
