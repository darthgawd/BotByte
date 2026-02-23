// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "../interfaces/IGameLogicV2.sol";

/**
 * @title MatchEscrowV2
 * @notice Enhanced escrow for BotByte Arena supporting bytes32 moves and high-entropy games.
 */
contract MatchEscrowV2 is ReentrancyGuard, Ownable, Pausable {
    enum MatchStatus { OPEN, ACTIVE, SETTLED, VOIDED }
    enum Phase       { COMMIT, REVEAL }

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
    }

    struct RoundCommit {
        bytes32  commitHash;
        bytes32  move; // Enhanced from uint8 to bytes32
        bytes32  salt;
        bool     revealed;
    }

    uint256 public matchCounter;
    uint256 public rakeBps = 500; 
    address public treasury;

    mapping(uint256 => Match) public matches;
    mapping(uint256 => mapping(uint8 => mapping(address => RoundCommit))) public roundCommits;
    mapping(address => uint256) public pendingWithdrawals;
    mapping(address => bool) public approvedGameLogic;

    event MatchCreated(uint256 indexed matchId, address indexed playerA, uint256 stake, address gameLogic);
    event MatchJoined(uint256 indexed matchId, address indexed playerB);
    event RoundStarted(uint256 indexed matchId, uint8 roundNumber);
    event MoveCommitted(uint256 indexed matchId, uint8 roundNumber, address indexed player);
    event MoveRevealed(uint256 indexed matchId, uint8 roundNumber, address indexed player, bytes32 move);
    event RoundResolved(uint256 indexed matchId, uint8 roundNumber, uint8 winner);
    event MatchSettled(uint256 indexed matchId, address indexed winner, uint256 payout, bool isSurrender);
    event TimeoutClaimed(uint256 indexed matchId, uint8 roundNumber, address indexed claimer);
    event WithdrawalQueued(address indexed recipient, uint256 amount);
    event GameLogicApproved(address indexed logic, bool approved);

    uint256 public constant TIMEOUT_DURATION = 1 hours;

    constructor(address _treasury) Ownable(msg.sender) {
        require(_treasury != address(0), "Invalid treasury");
        treasury = _treasury;
    }

    function createMatch(uint256 _stake, address _gameLogic) external payable nonReentrant whenNotPaused {
        require(_stake > 0, "Stake must be non-zero");
        require(msg.value == _stake, "Incorrect stake amount");
        require(approvedGameLogic[_gameLogic], "Game logic not approved");

        uint256 matchId = ++matchCounter;
        matches[matchId] = Match({
            playerA: msg.sender,
            playerB: address(0),
            stake: _stake,
            gameLogic: _gameLogic,
            winsA: 0,
            winsB: 0,
            currentRound: 1,
            phase: Phase.COMMIT,
            status: MatchStatus.OPEN,
            commitDeadline: 0,
            revealDeadline: 0
        });

        emit MatchCreated(matchId, msg.sender, _stake, _gameLogic);
    }

    /**
     * @notice Allows playerA to cancel an unfilled match and withdraw stake.
     */
    function cancelMatch(uint256 _matchId) external nonReentrant {
        Match storage m = matches[_matchId];
        require(m.status == MatchStatus.OPEN, "Match not open");
        require(msg.sender == m.playerA, "Not match creator");

        m.status = MatchStatus.VOIDED;
        _safeTransfer(m.playerA, m.stake);

        emit MatchSettled(_matchId, address(0), 0, false);
    }

    function joinMatch(uint256 _matchId) external payable nonReentrant whenNotPaused {
        Match storage m = matches[_matchId];
        require(m.status == MatchStatus.OPEN, "Match not open");
        require(msg.value == m.stake, "Incorrect stake amount");
        require(msg.sender != m.playerA, "Self-play not allowed");

        m.playerB = msg.sender;
        m.status = MatchStatus.ACTIVE;
        m.commitDeadline = block.timestamp + TIMEOUT_DURATION;

        emit MatchJoined(_matchId, msg.sender);
        emit RoundStarted(_matchId, m.currentRound);
    }

    function commitMove(uint256 _matchId, bytes32 _commitHash) external nonReentrant {
        Match storage m = matches[_matchId];
        require(m.status == MatchStatus.ACTIVE, "Not active");
        require(m.phase == Phase.COMMIT, "Not in commit");
        require(block.timestamp <= m.commitDeadline, "Expired");
        require(msg.sender == m.playerA || msg.sender == m.playerB, "Unauthorized");

        RoundCommit storage rc = roundCommits[_matchId][m.currentRound][msg.sender];
        require(rc.commitHash == bytes32(0), "Already committed");

        rc.commitHash = _commitHash;
        emit MoveCommitted(_matchId, m.currentRound, msg.sender);

        if (roundCommits[_matchId][m.currentRound][m.playerA].commitHash != bytes32(0) &&
            roundCommits[_matchId][m.currentRound][m.playerB].commitHash != bytes32(0)) {
            m.phase = Phase.REVEAL;
            m.revealDeadline = block.timestamp + TIMEOUT_DURATION;
        }
    }

    function revealMove(uint256 _matchId, bytes32 _move, bytes32 _salt) external nonReentrant {
        Match storage m = matches[_matchId];
        require(m.status == MatchStatus.ACTIVE, "Not active");
        require(m.phase == Phase.REVEAL, "Not in reveal");
        require(block.timestamp <= m.revealDeadline, "Expired");

        RoundCommit storage rc = roundCommits[_matchId][m.currentRound][msg.sender];
        require(!rc.revealed, "Already revealed");

        // Use bytes32 move in hash verification
        bytes32 expectedHash = keccak256(abi.encodePacked(_matchId, m.currentRound, msg.sender, _move, _salt));
        require(rc.commitHash == expectedHash, "Invalid reveal");

        rc.move = _move;
        rc.salt = _salt;
        rc.revealed = true;

        emit MoveRevealed(_matchId, m.currentRound, msg.sender, _move);

        if (roundCommits[_matchId][m.currentRound][m.playerA].revealed &&
            roundCommits[_matchId][m.currentRound][m.playerB].revealed) {
            _resolveRound(_matchId);
        }
    }

    function _resolveRound(uint256 _matchId) internal {
        Match storage m = matches[_matchId];
        IGameLogicV2 logic = IGameLogicV2(m.gameLogic);

        RoundCommit storage rcA = roundCommits[_matchId][m.currentRound][m.playerA];
        RoundCommit storage rcB = roundCommits[_matchId][m.currentRound][m.playerB];

        uint8 winner = logic.resolveRoundV2(rcA.move, rcA.salt, rcB.move, rcB.salt);

        if (winner == 1) m.winsA++;
        else if (winner == 2) m.winsB++;

        emit RoundResolved(_matchId, m.currentRound, winner);

        // Poker matches are Best of 5 Rounds
        if (m.winsA >= 3 || m.winsB >= 3 || m.currentRound >= 5) {
            _settleMatch(_matchId);
        } else {
            m.currentRound++;
            m.phase = Phase.COMMIT;
            m.commitDeadline = block.timestamp + TIMEOUT_DURATION;
            emit RoundStarted(_matchId, m.currentRound);
        }
    }

    function claimTimeout(uint256 _matchId) external nonReentrant {
        Match storage m = matches[_matchId];
        require(m.status == MatchStatus.ACTIVE, "Match not active");
        require(msg.sender == m.playerA || msg.sender == m.playerB, "Unauthorized");

        address opponent = (msg.sender == m.playerA) ? m.playerB : m.playerA;

        if (m.phase == Phase.COMMIT) {
            require(block.timestamp > m.commitDeadline, "Deadline not passed");
            require(roundCommits[_matchId][m.currentRound][opponent].commitHash == bytes32(0), "Opponent committed");
        } else {
            require(block.timestamp > m.revealDeadline, "Deadline not passed");
            require(!roundCommits[_matchId][m.currentRound][opponent].revealed, "Opponent revealed");
        }

        emit TimeoutClaimed(_matchId, m.currentRound, msg.sender);

        if (msg.sender == m.playerA) m.winsA = 3;
        else m.winsB = 3;
        _settleMatch(_matchId);
    }

    function mutualTimeout(uint256 _matchId) external nonReentrant {
        Match storage m = matches[_matchId];
        require(m.status == MatchStatus.ACTIVE, "Match not active");

        if (m.phase == Phase.COMMIT) {
            require(block.timestamp > m.commitDeadline, "Deadline not passed");
            require(roundCommits[_matchId][m.currentRound][m.playerA].commitHash == bytes32(0) &&
                    roundCommits[_matchId][m.currentRound][m.playerB].commitHash == bytes32(0), "Not a mutual timeout");
        } else {
            require(block.timestamp > m.revealDeadline, "Deadline not passed");
            require(!roundCommits[_matchId][m.currentRound][m.playerA].revealed &&
                    !roundCommits[_matchId][m.currentRound][m.playerB].revealed, "Not a mutual timeout");
        }

        m.status = MatchStatus.VOIDED;
        uint256 penalty = (m.stake * 2 * 100) / 10000;
        uint256 totalRefund = (m.stake * 2) - penalty;
        uint256 refundA = totalRefund / 2;
        uint256 refundB = totalRefund - refundA;

        _safeTransfer(treasury, penalty);
        _safeTransfer(m.playerA, refundA);
        _safeTransfer(m.playerB, refundB);

        emit MatchSettled(_matchId, address(0), 0, false);
    }

    /**
     * @notice Allows a player to forfeit the match and reclaim a portion of their stake.
     * The remaining portion is awarded to the opponent.
     */
    function surrender(uint256 _matchId) external nonReentrant {
        Match storage m = matches[_matchId];
        require(m.status == MatchStatus.ACTIVE, "Match not active");
        require(msg.sender == m.playerA || msg.sender == m.playerB, "Not a participant");

        address winner = msg.sender == m.playerA ? m.playerB : m.playerA;
        uint16 winnerShareBps = IGameLogicV2(m.gameLogic).surrenderPayout();
        
        m.status = MatchStatus.SETTLED;

        uint256 totalPot = m.stake * 2;
        uint256 winnerAmount = (totalPot * winnerShareBps) / 10000;
        uint256 surrenderAmount = totalPot - winnerAmount;

        // Apply rake to both portions proportionally
        uint256 rakeWinner = (winnerAmount * rakeBps) / 10000;
        uint256 rakeSurrender = (surrenderAmount * rakeBps) / 10000;
        
        uint256 totalRake = rakeWinner + rakeSurrender;
        uint256 finalWinnerPayout = winnerAmount - rakeWinner;
        uint256 finalSurrenderPayout = surrenderAmount - rakeSurrender;

        (bool successRake, ) = payable(treasury).call{value: totalRake}("");
        require(successRake, "Treasury fail");

        _safeTransfer(winner, finalWinnerPayout);
        _safeTransfer(msg.sender, finalSurrenderPayout);

        emit MatchSettled(_matchId, winner, finalWinnerPayout, true);
    }

    function _settleMatch(uint256 _matchId) internal {
        Match storage m = matches[_matchId];
        m.status = MatchStatus.SETTLED;

        address winner;
        if (m.winsA > m.winsB) winner = m.playerA;
        else if (m.winsB > m.winsA) winner = m.playerB;
        else {
            _safeTransfer(m.playerA, m.stake);
            _safeTransfer(m.playerB, m.stake);
            emit MatchSettled(_matchId, address(0), m.stake, false);
            return;
        }

        uint256 totalPot = m.stake * 2;
        uint256 rake = (totalPot * rakeBps) / 10000;
        uint256 payout = totalPot - rake;

        (bool successRake, ) = payable(treasury).call{value: rake}("");
        require(successRake, "Treasury fail");

        _safeTransfer(winner, payout);
        emit MatchSettled(_matchId, winner, payout, false);
    }

    function setTreasury(address _treasury) external onlyOwner {
        require(_treasury != address(0), "Invalid treasury");
        treasury = _treasury;
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function adminVoidMatch(uint256 _matchId) external onlyOwner nonReentrant {
        Match storage m = matches[_matchId];
        require(m.status == MatchStatus.OPEN || m.status == MatchStatus.ACTIVE, "Not voidable");
        m.status = MatchStatus.VOIDED;
        if (m.playerA != address(0)) _safeTransfer(m.playerA, m.stake);
        if (m.playerB != address(0)) _safeTransfer(m.playerB, m.stake);
        emit MatchSettled(_matchId, address(0), 0, false);
    }

    function approveGameLogic(address _logic, bool _approved) external onlyOwner {
        approvedGameLogic[_logic] = _approved;
        emit GameLogicApproved(_logic, _approved);
    }

    /**
     * @notice Returns the full state of a match.
     */
    function getMatch(uint256 _matchId) external view returns (Match memory) {
        return matches[_matchId];
    }

    function _safeTransfer(address to, uint256 amount) internal {
        if (amount == 0) return;
        (bool success, ) = payable(to).call{value: amount}("");
        if (!success) pendingWithdrawals[to] += amount;
    }

    function withdraw() external nonReentrant {
        uint256 amount = pendingWithdrawals[msg.sender];
        require(amount > 0, "Zero balance");
        pendingWithdrawals[msg.sender] = 0;
        (bool success, ) = payable(msg.sender).call{value: amount}("");
        require(success, "Withdrawal failed");
    }
}
