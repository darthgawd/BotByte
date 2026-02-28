// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "./MatchEscrow.sol";
import "./LogicRegistry.sol";

/**
 * @title FiseEscrow
 * @dev Extension of MatchEscrow to support the Falken Immutable Scripting Engine (FISE).
 * Allows match settlement via authorized off-chain Referees (Falken VM).
 */
contract FiseEscrow is MatchEscrow {
    
    LogicRegistry public immutable logicRegistry;
    address public referee;

    // Mapping from matchId to the FISE Logic ID (IPFS CID Hash)
    mapping(uint256 => bytes32) public fiseMatches;

    event FiseMatchCreated(uint256 indexed matchId, bytes32 indexed logicId);
    event RefereeChanged(address indexed oldReferee, address indexed newReferee);

    modifier onlyReferee() {
        require(msg.sender == referee, "Only Referee can call");
        _;
    }

    constructor(
        address initialTreasury, 
        address initialPriceProvider, 
        address initialLogicRegistry,
        address initialReferee
    ) MatchEscrow(initialTreasury, initialPriceProvider) {
        require(initialLogicRegistry != address(0), "Invalid registry");
        require(initialReferee != address(0), "Invalid referee");
        logicRegistry = LogicRegistry(initialLogicRegistry);
        referee = initialReferee;
    }

    /**
     * @dev Sets a new authorized referee address (Falken VM).
     */
    function setReferee(address newReferee) external onlyOwner {
        require(newReferee != address(0), "Invalid referee");
        emit RefereeChanged(referee, newReferee);
        referee = newReferee;
    }

    /**
     * @dev Creates a match using FISE JavaScript logic instead of a Solidity contract.
     * @param stake Entry stake in Wei.
     * @param logicId The registered ID from LogicRegistry.
     */
    function createFiseMatch(uint256 stake, bytes32 logicId) external payable nonReentrant whenNotPaused {
        require(msg.value == stake, "Incorrect stake amount");
        
        // 1. Verify Logic exists in Registry
        (string memory cid,,,,) = logicRegistry.registry(logicId);
        require(bytes(cid).length > 0, "Logic ID not registered");

        // 2. Validate USD floor
        uint256 usdValue = priceProvider.getUsdValue(stake);
        require(usdValue >= priceProvider.getMinStakeUsd(), "Stake below minimum");

        // 3. Initialize basic match state in parent
        uint256 matchId = ++matchCounter;

        // Note: We use address(this) as a sentinel for gameLogic to indicate FISE
        matches[matchId] = Match({
            playerA: msg.sender,
            playerB: address(0),
            stake: stake,
            gameLogic: address(this), 
            winsA: 0,
            winsB: 0,
            currentRound: 1,
            drawCounter: 0,
            phase: Phase.COMMIT,
            status: MatchStatus.OPEN,
            commitDeadline: 0,
            revealDeadline: 0
        });

        // 4. Map the match to its JS Logic
        fiseMatches[matchId] = logicId;

        emit MatchCreated(matchId, msg.sender, stake, address(this));
        emit FiseMatchCreated(matchId, logicId);
    }

    /**
     * @dev Override _resolveRound to prevent automatic resolution for FISE matches.
     * FISE matches are resolved off-chain by the Falken VM via settleFiseMatch.
     */
    function _resolveRound(uint256 matchId) internal override {
        Match storage m = matches[matchId];
        
        // If this is a FISE match (gameLogic == address(this)), skip on-chain resolution
        // The Falken VM will call settleFiseMatch() to settle the match
        if (m.gameLogic == address(this)) {
            // Mark both players as not revealed so they can play next round
            // or the referee can settle the match
            // For now, we just emit an event and wait for referee settlement
            emit RoundResolved(matchId, m.currentRound, 0); // 0 = pending/off-chain resolution
            return;
        }
        
        // For non-FISE matches, use the parent implementation
        super._resolveRound(matchId);
    }

    /**
     * @dev Settles a FISE match after off-chain validation by the Falken VM.
     * Only the authorized Referee can trigger the final payout.
     * Implements a 5% total rake: 3% to Treasury, 2% to Game Developer.
     */
    function settleFiseMatch(uint256 matchId, address winner) external onlyReferee nonReentrant {
        Match storage m = matches[matchId];
        require(m.status == MatchStatus.ACTIVE, "Match not active");
        require(m.gameLogic == address(this), "Not a FISE match");

        // --- EFFECTS (Update state before interactions) ---
        m.status = MatchStatus.SETTLED;
        m.phase = Phase.REVEAL; // Mark as finished

        bytes32 logicId = fiseMatches[matchId];
        uint256 totalPot = m.stake * 2;

        // 1. Get Developer Info from Registry
        (, address developer,,,) = logicRegistry.registry(logicId);

        // 2. Record volume in registry
        logicRegistry.recordVolume(logicId, totalPot);

        // --- INTERACTIONS ---
        if (winner == address(0)) {
            // Draw: Refund players
            _safeTransfer(m.playerA, m.stake);
            _safeTransfer(m.playerB, m.stake);
            emit MatchSettled(matchId, address(0), m.stake);
        } else {
            // Winner takes pot minus rake (5%)
            require(winner == m.playerA || winner == m.playerB, "Invalid winner");
            
            uint256 totalRake = (totalPot * RAKE_BPS) / 10000; // 5%
            uint256 royalty = (totalPot * 200) / 10000;        // 2% Royalty
            uint256 protocolFee = totalRake - royalty;         // 3% Protocol
            
            uint256 payout = totalPot - totalRake;

            // Three-Way Payout Execution
            _safeTransfer(treasury, protocolFee);
            _safeTransfer(developer, royalty);
            _safeTransfer(winner, payout);

            emit MatchSettled(matchId, winner, payout);
        }
    }
}
