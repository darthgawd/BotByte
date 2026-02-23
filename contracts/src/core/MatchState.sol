// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../interfaces/IGameLogicV2.sol";

/**
 * @title MatchState
 * @notice Base state for BotByte Arena to manage complex mappings and reduce main contract stack pressure.
 */
abstract contract MatchState {
    enum MatchStatus { OPEN, ACTIVE, SETTLED, VOIDED }
    enum Phase       { COMMIT, REVEAL, DISCARD }

    struct Match {
        address  playerA;
        address  playerB;
        uint256  stake;
        address  gameLogic;
        uint8    winsA;
        uint8    winsB;
        uint8    currentRound;
        Phase    phase;
        MatchStatus status;
        uint256  commitDeadline;
        uint256  revealDeadline;
        address  invitedPlayer;
        uint256  discardDeadline;
    }

    struct RoundCommit {
        bytes32  commitHash;
        bytes32  move;
        bytes32  salt;
        bool     revealed;
    }

    struct DiscardSubmission {
        uint8 discardMask;
        bool submitted;
    }

    uint256 public matchCounter;
    mapping(uint256 => Match) public matches;
    mapping(uint256 => mapping(uint8 => mapping(address => RoundCommit))) public roundCommits;
    mapping(uint256 => mapping(uint8 => mapping(address => DiscardSubmission))) public discardSubmissions;
}
