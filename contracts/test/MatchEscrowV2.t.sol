// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/core/MatchEscrowV2.sol";
import "../src/logic/FiveCardDraw.sol";
import "../src/logic/FiveCardDrawWithDiscard.sol";

/// @dev Harness that forces _evaluateHand to return a constant, enabling draw coverage.
contract FiveCardDrawHarness is FiveCardDraw {
    function _evaluateHand(bytes32, string memory) internal pure override returns (uint256) {
        return 42; // Both players get the same score → draw
    }
}

/// @dev Harness that forces player A to always win for metadata coverage.
contract FiveCardDrawMetaHarness is FiveCardDraw {
    function _evaluateHand(bytes32, string memory player) internal pure override returns (uint256) {
        if (keccak256(abi.encodePacked(player)) == keccak256("A")) return 200;
        return 100;
    }
}

contract FiveCardDrawDrawHarness is FiveCardDraw {
    function _evaluateHand(bytes32, string memory) internal pure override returns (uint256) {
        return 42;
    }
}

/// @dev Harness that exposes internal functions for direct hand-evaluation testing.
contract FiveCardDrawTestHarness is FiveCardDraw {
    function exposedDealCards(bytes32 seed, string memory player) external pure returns (uint8[5] memory) {
        return _dealCards(seed, player);
    }

    function exposedEvaluateHand(bytes32 seed, string memory player) external pure returns (uint256) {
        return _evaluateHand(seed, player);
    }
}

/// @dev Harness that injects specific cards for testing hand classification.
/// Cards are encoded into seed bytes so _dealCards remains pure.
contract FiveCardDrawFixedHand is FiveCardDraw {
    function _dealCards(bytes32 seed, string memory) internal pure override returns (uint8[5] memory cards) {
        // Decode 5 cards from the first 5 bytes of seed
        cards[0] = uint8(seed[0]);
        cards[1] = uint8(seed[1]);
        cards[2] = uint8(seed[2]);
        cards[3] = uint8(seed[3]);
        cards[4] = uint8(seed[4]);
    }

    function packCards(uint8[5] memory cards) external pure returns (bytes32) {
        return bytes32(abi.encodePacked(cards[0], cards[1], cards[2], cards[3], cards[4], bytes27(0)));
    }

    function evaluate(bytes32 seed, string memory player) external pure returns (uint256) {
        return _evaluateHand(seed, player);
    }

    function handRankOf(bytes32 seed, string memory player) external pure returns (uint8) {
        return uint8(_evaluateHand(seed, player) >> 20);
    }
}

contract SimpleReceiver {
    bool public accept = true;
    receive() external payable {
        require(accept, "Rejected");
    }
    function setAccept(bool _accept) external {
        accept = _accept;
    }
}

contract MatchEscrowV2Harness is MatchEscrowV2 {
    constructor(address _treasury) MatchEscrowV2(_treasury) {}
    function exposedSafeTransfer(address to, uint256 amount) external {
        _safeTransfer(to, amount);
    }
}

contract MatchEscrowV2Test is Test {
    MatchEscrowV2 public escrow;
    FiveCardDraw public poker;
    address public treasury = address(0x123);
    address public playerA = address(0x111);
    address public playerB = address(0x222);
    address public stranger = address(0x333);

    uint256 public constant STAKE = 1 ether;

    function setUp() public {
        escrow = new MatchEscrowV2(treasury);
        poker = new FiveCardDraw();
        escrow.approveGameLogic(address(poker), true);
        vm.deal(playerA, 10 ether);
        vm.deal(playerB, 10 ether);
        vm.deal(stranger, 10 ether);
    }

    function testFullPokerLoop() public {
        vm.prank(playerA);
        escrow.createMatch{value: STAKE}(STAKE, address(poker));
        vm.prank(playerB);
        escrow.joinMatch{value: STAKE}(1);

        bytes32 moveA = bytes32(uint256(0xAAA));
        bytes32 saltA = bytes32(uint256(1));
        bytes32 hashA = keccak256(abi.encodePacked(uint256(1), uint8(1), playerA, moveA, saltA));

        bytes32 moveB = bytes32(uint256(0xBBB));
        bytes32 saltB = bytes32(uint256(2));
        bytes32 hashB = keccak256(abi.encodePacked(uint256(1), uint8(1), playerB, moveB, saltB));

        vm.prank(playerA);
        escrow.commitMove(1, hashA);
        vm.prank(playerB);
        escrow.commitMove(1, hashB);

        vm.prank(playerA);
        escrow.revealMove(1, moveA, saltA);
        vm.prank(playerB);
        escrow.revealMove(1, moveB, saltB);

        MatchEscrowV2.Match memory m = escrow.getMatch(1);
        assertTrue(m.winsA == 1 || m.winsB == 1);
    }

    function testSurrender() public {
        vm.prank(playerA);
        escrow.createMatch{value: STAKE}(STAKE, address(poker));
        vm.prank(playerB);
        escrow.joinMatch{value: STAKE}(1);

        uint256 balanceABefore = playerA.balance;
        uint256 balanceBBefore = playerB.balance;

        vm.prank(playerA);
        escrow.surrender(1);

        assertEq(playerB.balance, balanceBBefore + 1.425 ether);
        assertEq(playerA.balance, balanceABefore + 0.475 ether);
    }

    function testCancelMatch() public {
        vm.prank(playerA);
        escrow.createMatch{value: STAKE}(STAKE, address(poker));

        vm.prank(playerA);
        escrow.cancelMatch(1);

        MatchEscrowV2.Match memory m = escrow.getMatch(1);
        assertEq(uint(m.status), uint(MatchState.MatchStatus.VOIDED));
    }

    function testClaimTimeoutA() public {
        vm.prank(playerA);
        escrow.createMatch{value: STAKE}(STAKE, address(poker));
        vm.prank(playerB);
        escrow.joinMatch{value: STAKE}(1);

        bytes32 hashA = keccak256(abi.encodePacked(uint256(1), uint8(1), playerA, bytes32(0), bytes32(0)));
        vm.prank(playerA);
        escrow.commitMove(1, hashA);

        vm.warp(block.timestamp + 2 hours);
        vm.prank(playerA);
        escrow.claimTimeout(1);
        assertEq(escrow.getMatch(1).winsA, 3);
    }

    function testClaimTimeoutB() public {
        vm.prank(playerA);
        escrow.createMatch{value: STAKE}(STAKE, address(poker));
        vm.prank(playerB);
        escrow.joinMatch{value: STAKE}(1);

        bytes32 hashB = keccak256(abi.encodePacked(uint256(1), uint8(1), playerB, bytes32(0), bytes32(0)));
        vm.prank(playerB);
        escrow.commitMove(1, hashB);

        vm.warp(block.timestamp + 2 hours);
        vm.prank(playerB);
        escrow.claimTimeout(1);
        assertEq(escrow.getMatch(1).winsB, 3);
    }

    function testMutualTimeout() public {
        vm.prank(playerA);
        escrow.createMatch{value: STAKE}(STAKE, address(poker));
        vm.prank(playerB);
        escrow.joinMatch{value: STAKE}(1);

        vm.warp(block.timestamp + 2 hours);
        vm.prank(playerA);
        escrow.mutualTimeout(1);
        assertEq(uint(escrow.getMatch(1).status), uint(MatchState.MatchStatus.VOIDED));
    }

    function testMutualTimeoutReveal() public {
        vm.prank(playerA);
        escrow.createMatch{value: STAKE}(STAKE, address(poker));
        vm.prank(playerB);
        escrow.joinMatch{value: STAKE}(1);

        vm.prank(playerA);
        escrow.commitMove(1, keccak256("A"));
        vm.prank(playerB);
        escrow.commitMove(1, keccak256("B"));

        vm.warp(block.timestamp + 2 hours);
        vm.prank(playerA);
        escrow.mutualTimeout(1);
        assertEq(uint(escrow.getMatch(1).status), uint(MatchState.MatchStatus.VOIDED));
    }

    function testWithdraw() public {
        SimpleReceiver receiver = new SimpleReceiver();
        vm.deal(address(receiver), 10 ether);

        vm.prank(address(receiver));
        escrow.createMatch{value: STAKE}(STAKE, address(poker));
        vm.prank(playerB);
        escrow.joinMatch{value: STAKE}(1);

        receiver.setAccept(false);
        escrow.adminVoidMatch(1);

        receiver.setAccept(true);
        vm.prank(address(receiver));
        escrow.withdraw();
        assertEq(escrow.pendingWithdrawals(address(receiver)), 0);
    }

    function testAdminVoid() public {
        vm.prank(playerA);
        escrow.createMatch{value: STAKE}(STAKE, address(poker));
        escrow.adminVoidMatch(1);
        assertEq(uint(escrow.getMatch(1).status), uint(MatchState.MatchStatus.VOIDED));
    }

    function testSettleMatchDraw() public {
        FiveCardDrawDrawHarness drawLogic = new FiveCardDrawDrawHarness();
        escrow.approveGameLogic(address(drawLogic), true);

        vm.prank(playerA);
        escrow.createMatch{value: STAKE}(STAKE, address(drawLogic));
        vm.prank(playerB);
        escrow.joinMatch{value: STAKE}(1);

        // Play 5 rounds of draws
        for (uint8 r = 1; r <= 5; r++) {
            vm.prank(playerA);
            escrow.commitMove(1, keccak256(abi.encodePacked(uint256(1), r, playerA, bytes32(0), bytes32(0))));
            vm.prank(playerB);
            escrow.commitMove(1, keccak256(abi.encodePacked(uint256(1), r, playerB, bytes32(0), bytes32(0))));
            
            vm.prank(playerA);
            escrow.revealMove(1, bytes32(0), bytes32(0));
            vm.prank(playerB);
            escrow.revealMove(1, bytes32(0), bytes32(0));
        }

        MatchEscrowV2.Match memory m = escrow.getMatch(1);
        assertEq(uint(m.status), uint(MatchState.MatchStatus.SETTLED));
        assertEq(m.winsA, 0);
        assertEq(m.winsB, 0);
    }

    function test_SettleMatchWinB() public {
        MockPlayerBWinsLogic bWinsLogic = new MockPlayerBWinsLogic();
        escrow.approveGameLogic(address(bWinsLogic), true);

        vm.prank(playerA);
        escrow.createMatch{value: STAKE}(STAKE, address(bWinsLogic));
        vm.prank(playerB);
        escrow.joinMatch{value: STAKE}(1);

        for (uint8 r = 1; r <= 3; r++) {
            _playRound(1, r, bytes32(uint256(r)), bytes32(0), bytes32(uint256(r)), bytes32(0));
        }

        MatchEscrowV2.Match memory m = escrow.getMatch(1);
        assertEq(uint(m.status), uint(MatchState.MatchStatus.SETTLED));
        assertEq(m.winsB, 3);
    }

    function test_RevertIf_TreasuryFail() public {
        SimpleReceiver badTreasury = new SimpleReceiver();
        badTreasury.setAccept(false);
        
        MatchEscrowV2 escrowWithBadTreasury = new MatchEscrowV2(address(badTreasury));
        escrowWithBadTreasury.approveGameLogic(address(poker), true);

        vm.deal(playerA, 10 ether);
        vm.deal(playerB, 10 ether);

        vm.prank(playerA);
        escrowWithBadTreasury.createMatch{value: STAKE}(STAKE, address(poker));
        vm.prank(playerB);
        escrowWithBadTreasury.joinMatch{value: STAKE}(1);

        vm.prank(playerA);
        escrowWithBadTreasury.surrender(1);

        // Check that treasury payout is queued
        assertEq(escrowWithBadTreasury.pendingWithdrawals(address(badTreasury)), 0.1 ether);
    }

    function test_RevertIf_CommitMoveUnauthorizedPlayer() public {
        vm.prank(playerA);
        escrow.createMatch{value: STAKE}(STAKE, address(poker));
        vm.prank(playerB);
        escrow.joinMatch{value: STAKE}(1);
        
        vm.prank(stranger);
        vm.expectRevert("Unauthorized");
        escrow.commitMove(1, bytes32(0));
    }

    function test_RevertIf_MutualTimeoutNotMutualCommitV2() public {
        vm.prank(playerA);
        escrow.createMatch{value: STAKE}(STAKE, address(poker));
        vm.prank(playerB);
        escrow.joinMatch{value: STAKE}(1);
        
        vm.prank(playerA);
        escrow.commitMove(1, keccak256("A"));
        
        vm.warp(block.timestamp + 2 hours);
        vm.prank(playerA); // Participant calling
        vm.expectRevert("Not a mutual timeout");
        escrow.mutualTimeout(1);
    }

    function test_RevertIf_MutualTimeoutNotMutualRevealV2() public {
        vm.prank(playerA);
        escrow.createMatch{value: STAKE}(STAKE, address(poker));
        vm.prank(playerB);
        escrow.joinMatch{value: STAKE}(1);
        
        bytes32 moveA = bytes32(uint256(1));
        bytes32 saltA = bytes32(uint256(2));
        bytes32 hashA = keccak256(abi.encodePacked(uint256(1), uint8(1), playerA, moveA, saltA));
        
        vm.prank(playerA);
        escrow.commitMove(1, hashA);
        vm.prank(playerB);
        escrow.commitMove(1, keccak256("B"));
        
        vm.prank(playerA);
        escrow.revealMove(1, moveA, saltA);
        
        vm.warp(block.timestamp + 2 hours);
        vm.prank(playerA); // Participant calling
        vm.expectRevert("Not a mutual timeout");
        escrow.mutualTimeout(1);
    }

    function test_SafeTransferZeroAmount() public {
        MatchEscrowV2Harness h = new MatchEscrowV2Harness(treasury);
        h.exposedSafeTransfer(address(0x1), 0);
        
        // Also hit the adminVoidMatch branch where playerB is 0
        vm.prank(playerA);
        escrow.createMatch{value: STAKE}(STAKE, address(poker));
        escrow.adminVoidMatch(1);
    }

    function testAdminVoidActive() public {
        vm.prank(playerA);
        escrow.createMatch{value: STAKE}(STAKE, address(poker));
        vm.prank(playerB);
        escrow.joinMatch{value: STAKE}(1);
        escrow.adminVoidMatch(1);
        assertEq(uint(escrow.getMatch(1).status), uint(MatchState.MatchStatus.VOIDED));
    }

    function testAdminVoidZeroAddresses() public {
        vm.prank(playerA);
        escrow.createMatch{value: STAKE}(STAKE, address(poker));

        bytes32 slot = keccak256(abi.encode(uint256(1), uint256(3))); // matches[1]
        vm.store(address(escrow), slot, bytes32(0)); // Set playerA to address(0)

        escrow.adminVoidMatch(1);
    }

    function testPause() public {
        escrow.pause();
        vm.prank(playerA);
        vm.expectRevert(abi.encodeWithSignature("EnforcedPause()"));
        escrow.createMatch{value: STAKE}(STAKE, address(poker));
        escrow.unpause();
    }

    function testSetTreasury() public {
        escrow.setTreasury(address(0x456));
        assertEq(escrow.treasury(), address(0x456));
    }

    function testOddWeiRefund() public {
        uint256 oddStake = 1 ether + 1;
        vm.prank(playerA);
        escrow.createMatch{value: oddStake}(oddStake, address(poker));
        vm.prank(playerB);
        escrow.joinMatch{value: oddStake}(1);
        vm.warp(block.timestamp + 2 hours);
        vm.prank(playerA);
        escrow.mutualTimeout(1);
    }

    function testFiveCardDrawSpecifics() public {
        uint8 winner = poker.resolveRoundV2(bytes32(uint256(1)), bytes32(uint256(1)), bytes32(uint256(2)), bytes32(uint256(2)));
        assertTrue(winner == 0 || winner == 1 || winner == 2);

        assertEq(poker.surrenderPayout(), 7500);
        assertEq(poker.gameType(), "FIVE_CARD_DRAW");
        assertFalse(poker.requiresDiscard());

        string memory meta = poker.getRoundResultMetadata(bytes32(uint256(1)), bytes32(uint256(1)), bytes32(uint256(2)), bytes32(uint256(2)));
        assertTrue(bytes(meta).length > 0);
        bytes memory metaBytes = bytes(meta);
        assertEq(uint8(metaBytes[0]), uint8(bytes1("{")));

        // Test draw path in metadata for coverage
        FiveCardDrawDrawHarness drawH = new FiveCardDrawDrawHarness();
        string memory drawMeta = drawH.getRoundResultMetadata(bytes32(0), bytes32(0), bytes32(0), bytes32(0));
        assertTrue(bytes(drawMeta).length > 0);

        // Test player A wins path in metadata for coverage
        FiveCardDrawMetaHarness winH = new FiveCardDrawMetaHarness();
        string memory winMeta = winH.getRoundResultMetadata(bytes32(0), bytes32(0), bytes32(0), bytes32(0));
        assertTrue(bytes(winMeta).length > 0);

        // Test reverting functions for 100% coverage
        vm.expectRevert("No discard");
        poker.resolveDraw(bytes32(0), 0, 0);

        vm.expectRevert("No discard");
        poker.getDrawResultMetadata(bytes32(0), 0, 0);
    }

    // --- Revert Cases ---

    function test_RevertIf_MutualTimeoutNotMet() public {
        vm.prank(playerA);
        escrow.createMatch{value: STAKE}(STAKE, address(poker));
        vm.prank(playerB);
        escrow.joinMatch{value: STAKE}(1);
        vm.prank(playerA);
        vm.expectRevert("Deadline not passed");
        escrow.mutualTimeout(1);
    }

    function test_RevertIf_JoinMatchSelf() public {
        vm.prank(playerA);
        escrow.createMatch{value: STAKE}(STAKE, address(poker));
        vm.prank(playerA);
        vm.expectRevert("Self-play not allowed");
        escrow.joinMatch{value: STAKE}(1);
    }

    function testSurrenderTreasuryFailGraceful() public {
        SimpleReceiver badTreasury = new SimpleReceiver();
        badTreasury.setAccept(false);
        escrow.setTreasury(address(badTreasury));
        vm.prank(playerA);
        escrow.createMatch{value: STAKE}(STAKE, address(poker));
        vm.prank(playerB);
        escrow.joinMatch{value: STAKE}(1);
        vm.prank(playerA);
        escrow.surrender(1);
        assertTrue(escrow.pendingWithdrawals(address(badTreasury)) > 0);
    }

    function test_RevertIf_ClaimTimeoutUnauthorized() public {
        vm.prank(playerA);
        escrow.createMatch{value: STAKE}(STAKE, address(poker));
        vm.prank(playerB);
        escrow.joinMatch{value: STAKE}(1);
        vm.prank(stranger);
        vm.expectRevert("Unauthorized");
        escrow.claimTimeout(1);
    }

    function test_RevertIf_ClaimTimeoutOpponentCommitted() public {
        vm.prank(playerA);
        escrow.createMatch{value: STAKE}(STAKE, address(poker));
        vm.prank(playerB);
        escrow.joinMatch{value: STAKE}(1);
        vm.prank(playerB);
        escrow.commitMove(1, keccak256("B"));
        vm.warp(block.timestamp + 2 hours);
        vm.prank(playerA);
        vm.expectRevert("Opponent committed");
        escrow.claimTimeout(1);
    }

    function test_RevertIf_ClaimTimeoutOpponentRevealed() public {
        vm.prank(playerA);
        escrow.createMatch{value: STAKE}(STAKE, address(poker));
        vm.prank(playerB);
        escrow.joinMatch{value: STAKE}(1);

        bytes32 moveB = bytes32(uint256(2));
        bytes32 saltB = bytes32(uint256(2));
        bytes32 hashB = keccak256(abi.encodePacked(uint256(1), uint8(1), playerB, moveB, saltB));

        vm.prank(playerA);
        escrow.commitMove(1, keccak256("A"));
        vm.prank(playerB);
        escrow.commitMove(1, hashB);
        vm.prank(playerB);
        escrow.revealMove(1, moveB, saltB);

        vm.warp(block.timestamp + 2 hours);
        vm.prank(playerA);
        vm.expectRevert("Opponent revealed");
        escrow.claimTimeout(1);
    }

    // =====================================================
    // FiveCardDraw: Draw branch coverage
    // =====================================================

    function testFiveCardDrawDraw() public {
        FiveCardDrawHarness harness = new FiveCardDrawHarness();
        uint8 result = harness.resolveRoundV2(bytes32(uint256(1)), bytes32(uint256(2)), bytes32(uint256(3)), bytes32(uint256(4)));
        assertEq(result, 0); // Draw
    }

    // =====================================================
    // MatchEscrowV2: Missing branch coverage
    // =====================================================

    // --- Constructor ---
    function test_RevertIf_ConstructorZeroTreasury() public {
        vm.expectRevert("Invalid treasury");
        new MatchEscrowV2(address(0));
    }

    // --- createMatch reverts ---
    function test_RevertIf_CreateMatchZeroStake() public {
        vm.prank(playerA);
        vm.expectRevert("Stake must be non-zero");
        escrow.createMatch{value: 0}(0, address(poker));
    }

    function test_RevertIf_CreateMatchWrongValue() public {
        vm.prank(playerA);
        vm.expectRevert("Incorrect stake amount");
        escrow.createMatch{value: 0.5 ether}(STAKE, address(poker));
    }

    function test_RevertIf_CreateMatchUnapprovedLogic() public {
        vm.prank(playerA);
        vm.expectRevert("Game logic not approved");
        escrow.createMatch{value: STAKE}(STAKE, address(0x999));
    }

    // --- cancelMatch reverts ---
    function test_RevertIf_CancelMatchNotOpen() public {
        vm.prank(playerA);
        escrow.createMatch{value: STAKE}(STAKE, address(poker));
        vm.prank(playerB);
        escrow.joinMatch{value: STAKE}(1);
        vm.prank(playerA);
        vm.expectRevert("Match not open");
        escrow.cancelMatch(1);
    }

    function test_RevertIf_CancelMatchNotCreator() public {
        vm.prank(playerA);
        escrow.createMatch{value: STAKE}(STAKE, address(poker));
        vm.prank(playerB);
        vm.expectRevert("Not match creator");
        escrow.cancelMatch(1);
    }

    // --- joinMatch reverts ---
    function test_RevertIf_JoinMatchNotOpen() public {
        vm.prank(playerA);
        escrow.createMatch{value: STAKE}(STAKE, address(poker));
        vm.prank(playerB);
        escrow.joinMatch{value: STAKE}(1);
        vm.prank(stranger);
        vm.expectRevert("Match not open");
        escrow.joinMatch{value: STAKE}(1);
    }

    function test_RevertIf_JoinMatchWrongStake() public {
        vm.prank(playerA);
        escrow.createMatch{value: STAKE}(STAKE, address(poker));
        vm.prank(playerB);
        vm.expectRevert("Incorrect stake amount");
        escrow.joinMatch{value: 0.5 ether}(1);
    }

    // --- Invite-only matches ---
    function testCreateMatchWithInvite() public {
        vm.prank(playerA);
        escrow.createMatch{value: STAKE}(STAKE, address(poker), playerB);
        vm.prank(playerB);
        escrow.joinMatch{value: STAKE}(1);
        assertEq(uint(escrow.getMatch(1).status), uint(MatchState.MatchStatus.ACTIVE));
    }

    function test_RevertIf_JoinMatchNotInvited() public {
        vm.prank(playerA);
        escrow.createMatch{value: STAKE}(STAKE, address(poker), playerB);
        vm.prank(stranger);
        vm.expectRevert("Not invited");
        escrow.joinMatch{value: STAKE}(1);
    }

    // --- commitMove reverts ---
    function test_RevertIf_CommitMoveNotActive() public {
        vm.prank(playerA);
        escrow.createMatch{value: STAKE}(STAKE, address(poker));
        vm.prank(playerA);
        vm.expectRevert("Not active");
        escrow.commitMove(1, keccak256("A"));
    }

    function test_RevertIf_CommitMoveNotInCommit() public {
        vm.prank(playerA);
        escrow.createMatch{value: STAKE}(STAKE, address(poker));
        vm.prank(playerB);
        escrow.joinMatch{value: STAKE}(1);

        vm.prank(playerA);
        escrow.commitMove(1, keccak256("A"));
        vm.prank(playerB);
        escrow.commitMove(1, keccak256("B"));
        // Now in REVEAL phase
        vm.prank(playerA);
        vm.expectRevert("Not in commit");
        escrow.commitMove(1, keccak256("C"));
    }

    function test_RevertIf_CommitMoveExpired() public {
        vm.prank(playerA);
        escrow.createMatch{value: STAKE}(STAKE, address(poker));
        vm.prank(playerB);
        escrow.joinMatch{value: STAKE}(1);
        vm.warp(block.timestamp + 2 hours);
        vm.prank(playerA);
        vm.expectRevert("Expired");
        escrow.commitMove(1, keccak256("A"));
    }

    function test_RevertIf_CommitMoveUnauthorized() public {
        vm.prank(playerA);
        escrow.createMatch{value: STAKE}(STAKE, address(poker));
        vm.prank(playerB);
        escrow.joinMatch{value: STAKE}(1);
        vm.prank(stranger);
        vm.expectRevert("Unauthorized");
        escrow.commitMove(1, keccak256("X"));
    }

    function test_RevertIf_CommitMoveAlreadyCommitted() public {
        vm.prank(playerA);
        escrow.createMatch{value: STAKE}(STAKE, address(poker));
        vm.prank(playerB);
        escrow.joinMatch{value: STAKE}(1);
        vm.prank(playerA);
        escrow.commitMove(1, keccak256("A"));
        vm.prank(playerA);
        vm.expectRevert("Already committed");
        escrow.commitMove(1, keccak256("A2"));
    }

    // --- revealMove reverts ---
    function test_RevertIf_RevealMoveNotActive() public {
        vm.prank(playerA);
        escrow.createMatch{value: STAKE}(STAKE, address(poker));
        vm.prank(playerA);
        vm.expectRevert("Not active");
        escrow.revealMove(1, bytes32(0), bytes32(0));
    }

    function test_RevertIf_RevealMoveNotInReveal() public {
        vm.prank(playerA);
        escrow.createMatch{value: STAKE}(STAKE, address(poker));
        vm.prank(playerB);
        escrow.joinMatch{value: STAKE}(1);
        vm.prank(playerA);
        vm.expectRevert("Not in reveal");
        escrow.revealMove(1, bytes32(0), bytes32(0));
    }

    function test_RevertIf_RevealMoveExpired() public {
        vm.prank(playerA);
        escrow.createMatch{value: STAKE}(STAKE, address(poker));
        vm.prank(playerB);
        escrow.joinMatch{value: STAKE}(1);
        vm.prank(playerA);
        escrow.commitMove(1, keccak256("A"));
        vm.prank(playerB);
        escrow.commitMove(1, keccak256("B"));
        vm.warp(block.timestamp + 2 hours);
        vm.prank(playerA);
        vm.expectRevert("Expired");
        escrow.revealMove(1, bytes32(0), bytes32(0));
    }

    function test_RevertIf_RevealMoveAlreadyRevealed() public {
        vm.prank(playerA);
        escrow.createMatch{value: STAKE}(STAKE, address(poker));
        vm.prank(playerB);
        escrow.joinMatch{value: STAKE}(1);

        bytes32 moveA = bytes32(uint256(0xA));
        bytes32 saltA = bytes32(uint256(1));
        bytes32 hashA = keccak256(abi.encodePacked(uint256(1), uint8(1), playerA, moveA, saltA));

        vm.prank(playerA);
        escrow.commitMove(1, hashA);
        vm.prank(playerB);
        escrow.commitMove(1, keccak256("B"));

        vm.prank(playerA);
        escrow.revealMove(1, moveA, saltA);
        vm.prank(playerA);
        vm.expectRevert("Already revealed");
        escrow.revealMove(1, moveA, saltA);
    }

    function test_RevertIf_RevealMoveInvalidHash() public {
        vm.prank(playerA);
        escrow.createMatch{value: STAKE}(STAKE, address(poker));
        vm.prank(playerB);
        escrow.joinMatch{value: STAKE}(1);

        vm.prank(playerA);
        escrow.commitMove(1, keccak256("A"));
        vm.prank(playerB);
        escrow.commitMove(1, keccak256("B"));

        vm.prank(playerA);
        vm.expectRevert("Invalid reveal");
        escrow.revealMove(1, bytes32(uint256(999)), bytes32(uint256(999)));
    }

    // --- surrender reverts ---
    function test_RevertIf_SurrenderNotActive() public {
        vm.prank(playerA);
        escrow.createMatch{value: STAKE}(STAKE, address(poker));
        vm.prank(playerA);
        vm.expectRevert("Match not active");
        escrow.surrender(1);
    }

    function test_RevertIf_SurrenderNotParticipant() public {
        vm.prank(playerA);
        escrow.createMatch{value: STAKE}(STAKE, address(poker));
        vm.prank(playerB);
        escrow.joinMatch{value: STAKE}(1);
        vm.prank(stranger);
        vm.expectRevert("Not a participant");
        escrow.surrender(1);
    }

    function testSurrenderByPlayerB() public {
        vm.prank(playerA);
        escrow.createMatch{value: STAKE}(STAKE, address(poker));
        vm.prank(playerB);
        escrow.joinMatch{value: STAKE}(1);

        uint256 balanceABefore = playerA.balance;
        uint256 balanceBBefore = playerB.balance;

        vm.prank(playerB);
        escrow.surrender(1);

        assertEq(playerA.balance, balanceABefore + 1.425 ether);
        assertEq(playerB.balance, balanceBBefore + 0.475 ether);
    }

    // --- claimTimeout reverts ---
    function test_RevertIf_ClaimTimeoutNotActive() public {
        vm.prank(playerA);
        escrow.createMatch{value: STAKE}(STAKE, address(poker));
        vm.prank(playerA);
        vm.expectRevert("Match not active");
        escrow.claimTimeout(1);
    }

    function test_RevertIf_ClaimTimeoutDeadlineNotPassedCommit() public {
        vm.prank(playerA);
        escrow.createMatch{value: STAKE}(STAKE, address(poker));
        vm.prank(playerB);
        escrow.joinMatch{value: STAKE}(1);

        vm.prank(playerA);
        escrow.commitMove(1, keccak256("A"));

        vm.prank(playerA);
        vm.expectRevert("Deadline not passed");
        escrow.claimTimeout(1);
    }

    function test_RevertIf_ClaimTimeoutDeadlineNotPassedReveal() public {
        vm.prank(playerA);
        escrow.createMatch{value: STAKE}(STAKE, address(poker));
        vm.prank(playerB);
        escrow.joinMatch{value: STAKE}(1);

        vm.prank(playerA);
        escrow.commitMove(1, keccak256("A"));
        vm.prank(playerB);
        escrow.commitMove(1, keccak256("B"));

        vm.prank(playerA);
        vm.expectRevert("Deadline not passed");
        escrow.claimTimeout(1);
    }

    // --- mutualTimeout reverts ---
    function test_RevertIf_MutualTimeoutNotActive() public {
        vm.prank(playerA);
        escrow.createMatch{value: STAKE}(STAKE, address(poker));
        vm.prank(playerA);
        vm.expectRevert("Match not active");
        escrow.mutualTimeout(1);
    }

    function test_RevertIf_MutualTimeoutNotParticipant() public {
        vm.prank(playerA);
        escrow.createMatch{value: STAKE}(STAKE, address(poker));
        vm.prank(playerB);
        escrow.joinMatch{value: STAKE}(1);
        vm.warp(block.timestamp + 2 hours);
        vm.prank(stranger);
        vm.expectRevert("Not a participant");
        escrow.mutualTimeout(1);
    }

    function test_RevertIf_MutualTimeoutNotMutualCommit() public {
        vm.prank(playerA);
        escrow.createMatch{value: STAKE}(STAKE, address(poker));
        vm.prank(playerB);
        escrow.joinMatch{value: STAKE}(1);

        vm.prank(playerA);
        escrow.commitMove(1, keccak256("A"));

        vm.warp(block.timestamp + 2 hours);
        vm.prank(playerB);
        vm.expectRevert("Not a mutual timeout");
        escrow.mutualTimeout(1);
    }

    function test_RevertIf_MutualTimeoutNotMutualReveal() public {
        vm.prank(playerA);
        escrow.createMatch{value: STAKE}(STAKE, address(poker));
        vm.prank(playerB);
        escrow.joinMatch{value: STAKE}(1);

        bytes32 moveA = bytes32(uint256(0xA));
        bytes32 saltA = bytes32(uint256(1));
        bytes32 hashA = keccak256(abi.encodePacked(uint256(1), uint8(1), playerA, moveA, saltA));

        vm.prank(playerA);
        escrow.commitMove(1, hashA);
        vm.prank(playerB);
        escrow.commitMove(1, keccak256("B"));

        vm.prank(playerA);
        escrow.revealMove(1, moveA, saltA);

        vm.warp(block.timestamp + 2 hours);
        vm.prank(playerB);
        vm.expectRevert("Not a mutual timeout");
        escrow.mutualTimeout(1);
    }

    function test_RevertIf_MutualTimeoutRevealDeadlineNotPassed() public {
        vm.prank(playerA);
        escrow.createMatch{value: STAKE}(STAKE, address(poker));
        vm.prank(playerB);
        escrow.joinMatch{value: STAKE}(1);

        vm.prank(playerA);
        escrow.commitMove(1, keccak256("A"));
        vm.prank(playerB);
        escrow.commitMove(1, keccak256("B"));

        vm.prank(playerA);
        vm.expectRevert("Deadline not passed");
        escrow.mutualTimeout(1);
    }

    // --- setTreasury revert ---
    function test_RevertIf_SetTreasuryZero() public {
        vm.expectRevert("Invalid treasury");
        escrow.setTreasury(address(0));
    }

    function test_RevertIf_SetTreasuryNotOwner() public {
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSignature("OwnableUnauthorizedAccount(address)", stranger));
        escrow.setTreasury(address(0x456));
    }

    // --- adminVoidMatch reverts ---
    function test_RevertIf_AdminVoidNotVoidable() public {
        vm.prank(playerA);
        escrow.createMatch{value: STAKE}(STAKE, address(poker));
        vm.prank(playerB);
        escrow.joinMatch{value: STAKE}(1);

        vm.prank(playerA);
        escrow.surrender(1);

        vm.expectRevert("Not voidable");
        escrow.adminVoidMatch(1);
    }

    function test_RevertIf_AdminVoidNotOwner() public {
        vm.prank(playerA);
        escrow.createMatch{value: STAKE}(STAKE, address(poker));
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSignature("OwnableUnauthorizedAccount(address)", stranger));
        escrow.adminVoidMatch(1);
    }

    // --- withdraw reverts ---
    function test_RevertIf_WithdrawZeroBalance() public {
        vm.prank(playerA);
        vm.expectRevert("Zero balance");
        escrow.withdraw();
    }

    function test_RevertIf_WithdrawFailed() public {
        SimpleReceiver receiver = new SimpleReceiver();
        vm.deal(address(receiver), 10 ether);

        vm.prank(address(receiver));
        escrow.createMatch{value: STAKE}(STAKE, address(poker));
        vm.prank(playerB);
        escrow.joinMatch{value: STAKE}(1);

        receiver.setAccept(false);
        escrow.adminVoidMatch(1);

        vm.prank(address(receiver));
        vm.expectRevert("Withdrawal failed");
        escrow.withdraw();
    }

    // --- pause reverts ---
    function test_RevertIf_PauseNotOwner() public {
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSignature("OwnableUnauthorizedAccount(address)", stranger));
        escrow.pause();
    }

    function test_RevertIf_UnpauseNotOwner() public {
        escrow.pause();
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSignature("OwnableUnauthorizedAccount(address)", stranger));
        escrow.unpause();
    }

    function test_RevertIf_JoinMatchPaused() public {
        vm.prank(playerA);
        escrow.createMatch{value: STAKE}(STAKE, address(poker));
        escrow.pause();
        vm.prank(playerB);
        vm.expectRevert(abi.encodeWithSignature("EnforcedPause()"));
        escrow.joinMatch{value: STAKE}(1);
        escrow.unpause();
    }

    // --- _safeTransfer: amount == 0 branch ---
    // --- approveGameLogic revert ---
    function test_RevertIf_ApproveGameLogicNotOwner() public {
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSignature("OwnableUnauthorizedAccount(address)", stranger));
        escrow.approveGameLogic(address(0x999), true);
    }

    // --- Multi-round: settle after 5 rounds (currentRound >= 5 path) ---
    function _playRound(uint256 matchId, uint8 round, bytes32 moveA, bytes32 saltA, bytes32 moveB, bytes32 saltB) internal {
        bytes32 hashA = keccak256(abi.encodePacked(matchId, round, playerA, moveA, saltA));
        bytes32 hashB = keccak256(abi.encodePacked(matchId, round, playerB, moveB, saltB));

        vm.prank(playerA);
        escrow.commitMove(matchId, hashA);
        vm.prank(playerB);
        escrow.commitMove(matchId, hashB);
        vm.prank(playerA);
        escrow.revealMove(matchId, moveA, saltA);
        vm.prank(playerB);
        escrow.revealMove(matchId, moveB, saltB);
    }

    function testMultiRoundBestOf5_PlayerAWins3() public {
        MockPlayerAWinsLogic aWinsLogic = new MockPlayerAWinsLogic();
        escrow.approveGameLogic(address(aWinsLogic), true);

        vm.prank(playerA);
        escrow.createMatch{value: STAKE}(STAKE, address(aWinsLogic));
        vm.prank(playerB);
        escrow.joinMatch{value: STAKE}(1);

        for (uint8 r = 1; r <= 3; r++) {
            bytes32 moveA = bytes32(uint256(r));
            bytes32 saltA = bytes32(uint256(r + 10));
            bytes32 moveB = bytes32(uint256(r + 20));
            bytes32 saltB = bytes32(uint256(r + 30));
            bytes32 hashA = keccak256(abi.encodePacked(uint256(1), r, playerA, moveA, saltA));
            bytes32 hashB = keccak256(abi.encodePacked(uint256(1), r, playerB, moveB, saltB));

            vm.prank(playerA);
            escrow.commitMove(1, hashA);
            vm.prank(playerB);
            escrow.commitMove(1, hashB);
            vm.prank(playerA);
            escrow.revealMove(1, moveA, saltA);
            vm.prank(playerB);
            escrow.revealMove(1, moveB, saltB);
        }

        MatchEscrowV2.Match memory finalM = escrow.getMatch(1);
        assertEq(uint(finalM.status), uint(MatchState.MatchStatus.SETTLED));
        assertEq(finalM.winsA, 3);
    }

    // --- _resolveRound: winner == 0 (draw round, no one wins) ---
    function testRoundDraw() public {
        MockDrawRoundGameLogic drawRoundLogic = new MockDrawRoundGameLogic();
        escrow.approveGameLogic(address(drawRoundLogic), true);

        vm.prank(playerA);
        escrow.createMatch{value: STAKE}(STAKE, address(drawRoundLogic));
        vm.prank(playerB);
        escrow.joinMatch{value: STAKE}(1);

        bytes32 moveA = bytes32(uint256(1));
        bytes32 saltA = bytes32(uint256(2));
        bytes32 moveB = bytes32(uint256(3));
        bytes32 saltB = bytes32(uint256(4));
        _playRound(1, 1, moveA, saltA, moveB, saltB);

        MatchEscrowV2.Match memory m = escrow.getMatch(1);
        assertEq(m.winsA, 0);
        assertEq(m.winsB, 0);
        assertEq(m.currentRound, 2);
    }

    // --- _settleMatch via _resolveRound treasury fail graceful ---
    function testSettleMatchTreasuryFailGraceful() public {
        SimpleReceiver badTreasury = new SimpleReceiver();
        badTreasury.setAccept(false);
        escrow.setTreasury(address(badTreasury));

        vm.prank(playerA);
        escrow.createMatch{value: STAKE}(STAKE, address(poker));
        vm.prank(playerB);
        escrow.joinMatch{value: STAKE}(1);

        bytes32 hashA = keccak256(abi.encodePacked(uint256(1), uint8(1), playerA, bytes32(0), bytes32(0)));
        vm.prank(playerA);
        escrow.commitMove(1, hashA);
        vm.warp(block.timestamp + 2 hours);

        vm.prank(playerA);
        escrow.claimTimeout(1);
        assertTrue(escrow.pendingWithdrawals(address(badTreasury)) > 0);
        assertEq(uint(escrow.getMatch(1).status), uint(MatchState.MatchStatus.SETTLED));
    }

    // --- claimTimeout in reveal phase ---
    function testClaimTimeoutRevealPhase() public {
        vm.prank(playerA);
        escrow.createMatch{value: STAKE}(STAKE, address(poker));
        vm.prank(playerB);
        escrow.joinMatch{value: STAKE}(1);

        bytes32 moveA = bytes32(uint256(0xA));
        bytes32 saltA = bytes32(uint256(1));
        bytes32 hashA = keccak256(abi.encodePacked(uint256(1), uint8(1), playerA, moveA, saltA));

        vm.prank(playerA);
        escrow.commitMove(1, hashA);
        vm.prank(playerB);
        escrow.commitMove(1, keccak256("B"));

        vm.prank(playerA);
        escrow.revealMove(1, moveA, saltA);

        vm.warp(block.timestamp + 2 hours);
        vm.prank(playerA);
        escrow.claimTimeout(1);

        assertEq(escrow.getMatch(1).winsA, 3);
    }

    // --- claimTimeout by playerB in reveal phase ---
    function testClaimTimeoutRevealPhaseByB() public {
        vm.prank(playerA);
        escrow.createMatch{value: STAKE}(STAKE, address(poker));
        vm.prank(playerB);
        escrow.joinMatch{value: STAKE}(1);

        bytes32 moveB = bytes32(uint256(0xB));
        bytes32 saltB = bytes32(uint256(2));
        bytes32 hashB = keccak256(abi.encodePacked(uint256(1), uint8(1), playerB, moveB, saltB));

        vm.prank(playerA);
        escrow.commitMove(1, keccak256("A"));
        vm.prank(playerB);
        escrow.commitMove(1, hashB);

        vm.prank(playerB);
        escrow.revealMove(1, moveB, saltB);

        vm.warp(block.timestamp + 2 hours);
        vm.prank(playerB);
        escrow.claimTimeout(1);

        assertEq(escrow.getMatch(1).winsB, 3);
    }

    // --- _resolveRound: winsB >= 3 path ---
    function testPlayerBWinsMatch() public {
        MockPlayerBWinsLogic bWinsLogic = new MockPlayerBWinsLogic();
        escrow.approveGameLogic(address(bWinsLogic), true);

        vm.prank(playerA);
        escrow.createMatch{value: STAKE}(STAKE, address(bWinsLogic));
        vm.prank(playerB);
        escrow.joinMatch{value: STAKE}(1);

        for (uint8 r = 1; r <= 3; r++) {
            bytes32 moveA = bytes32(uint256(r));
            bytes32 saltA = bytes32(uint256(r + 10));
            bytes32 moveB = bytes32(uint256(r + 20));
            bytes32 saltB = bytes32(uint256(r + 30));
            bytes32 hashA = keccak256(abi.encodePacked(uint256(1), r, playerA, moveA, saltA));
            bytes32 hashB = keccak256(abi.encodePacked(uint256(1), r, playerB, moveB, saltB));

            vm.prank(playerA);
            escrow.commitMove(1, hashA);
            vm.prank(playerB);
            escrow.commitMove(1, hashB);
            vm.prank(playerA);
            escrow.revealMove(1, moveA, saltA);
            vm.prank(playerB);
            escrow.revealMove(1, moveB, saltB);
        }

        MatchEscrowV2.Match memory m = escrow.getMatch(1);
        assertEq(uint(m.status), uint(MatchState.MatchStatus.SETTLED));
        assertEq(m.winsB, 3);
    }
    // =====================================================
    // FiveCardDraw: Hand ranking tests
    // =====================================================

    function testDealCardsUnique() public {
        FiveCardDrawTestHarness h = new FiveCardDrawTestHarness();
        uint8[5] memory cards = h.exposedDealCards(bytes32(uint256(42)), "A");
        for (uint256 i = 0; i < 5; i++) {
            assertTrue(cards[i] < 52);
            for (uint256 j = i + 1; j < 5; j++) {
                assertTrue(cards[i] != cards[j]);
            }
        }
    }

    function testHandRankExtraction() public {
        FiveCardDrawTestHarness h = new FiveCardDrawTestHarness();
        for (uint256 i = 1; i <= 20; i++) {
            uint256 score = h.exposedEvaluateHand(bytes32(i), "A");
            uint8 handRank = uint8(score >> 20);
            assertTrue(handRank <= 9);
        }
    }

    function testMetadataContainsCards() public {
        string memory meta = poker.getRoundResultMetadata(
            bytes32(uint256(100)), bytes32(uint256(200)),
            bytes32(uint256(300)), bytes32(uint256(400))
        );
        assertTrue(bytes(meta).length > 50);
    }

    function testResolveRoundDeterministic() public {
        uint8 r1 = poker.resolveRoundV2(bytes32(uint256(1)), bytes32(uint256(2)), bytes32(uint256(3)), bytes32(uint256(4)));
        uint8 r2 = poker.resolveRoundV2(bytes32(uint256(1)), bytes32(uint256(2)), bytes32(uint256(3)), bytes32(uint256(4)));
        assertEq(r1, r2);
    }

    function testMultipleSeedsProduceVariedHands() public {
        FiveCardDrawTestHarness h = new FiveCardDrawTestHarness();
        uint256 prevScore = 0;
        uint256 diffCount = 0;
        for (uint256 i = 1; i <= 30; i++) {
            uint256 score = h.exposedEvaluateHand(bytes32(i), "A");
            if (score != prevScore) diffCount++;
            prevScore = score;
        }
        assertTrue(diffCount > 5);
    }

    function testHandRankOrdering() public {
        uint256 royalBase = uint256(9) << 20;
        uint256 sfBase = uint256(8) << 20;
        uint256 fourBase = uint256(7) << 20;
        uint256 highBase = uint256(0) << 20;

        assertTrue(royalBase > sfBase);
        assertTrue(sfBase > fourBase);
        assertTrue(fourBase > highBase);
    }

    function _card(uint8 rank, uint8 suit) internal pure returns (uint8) {
        return rank * 4 + suit;
    }

    function testRoyalFlush() public {
        FiveCardDrawFixedHand fh = new FiveCardDrawFixedHand();
        uint8[5] memory cards = [_card(12,0), _card(11,0), _card(10,0), _card(9,0), _card(8,0)];
        bytes32 seed = fh.packCards(cards);
        assertEq(fh.handRankOf(seed, "A"), 9);
    }

    function testStraightFlush() public {
        FiveCardDrawFixedHand fh = new FiveCardDrawFixedHand();
        uint8[5] memory cards = [_card(7,1), _card(6,1), _card(5,1), _card(4,1), _card(3,1)];
        bytes32 seed = fh.packCards(cards);
        assertEq(fh.handRankOf(seed, "A"), 8);
    }

    function testStraightFlushWheel() public {
        FiveCardDrawFixedHand fh = new FiveCardDrawFixedHand();
        uint8[5] memory cards = [_card(12,2), _card(0,2), _card(1,2), _card(2,2), _card(3,2)];
        bytes32 seed = fh.packCards(cards);
        assertEq(fh.handRankOf(seed, "A"), 8);
    }

    function testFourOfAKind() public {
        FiveCardDrawFixedHand fh = new FiveCardDrawFixedHand();
        uint8[5] memory cards = [_card(12,0), _card(12,1), _card(12,2), _card(12,3), _card(11,0)];
        bytes32 seed = fh.packCards(cards);
        assertEq(fh.handRankOf(seed, "A"), 7);
    }

    function testFullHouse() public {
        FiveCardDrawFixedHand fh = new FiveCardDrawFixedHand();
        uint8[5] memory cards = [_card(11,0), _card(11,1), _card(11,2), _card(10,0), _card(10,1)];
        bytes32 seed = fh.packCards(cards);
        assertEq(fh.handRankOf(seed, "A"), 6);
    }

    function testFlush() public {
        FiveCardDrawFixedHand fh = new FiveCardDrawFixedHand();
        uint8[5] memory cards = [_card(12,3), _card(10,3), _card(7,3), _card(4,3), _card(1,3)];
        bytes32 seed = fh.packCards(cards);
        assertEq(fh.handRankOf(seed, "A"), 5);
    }

    function testStraight() public {
        FiveCardDrawFixedHand fh = new FiveCardDrawFixedHand();
        uint8[5] memory cards = [_card(8,0), _card(7,1), _card(6,2), _card(5,3), _card(4,0)];
        bytes32 seed = fh.packCards(cards);
        assertEq(fh.handRankOf(seed, "A"), 4);
    }

    function testWheelStraight() public {
        FiveCardDrawFixedHand fh = new FiveCardDrawFixedHand();
        uint8[5] memory cards = [_card(12,0), _card(0,1), _card(1,2), _card(2,3), _card(3,0)];
        bytes32 seed = fh.packCards(cards);
        assertEq(fh.handRankOf(seed, "A"), 4);
    }

    function testThreeOfAKind() public {
        FiveCardDrawFixedHand fh = new FiveCardDrawFixedHand();
        uint8[5] memory cards = [_card(9,0), _card(9,1), _card(9,2), _card(5,3), _card(2,0)];
        bytes32 seed = fh.packCards(cards);
        assertEq(fh.handRankOf(seed, "A"), 3);
    }

    function testTwoPair() public {
        FiveCardDrawFixedHand fh = new FiveCardDrawFixedHand();
        uint8[5] memory cards = [_card(12,0), _card(12,1), _card(11,2), _card(11,3), _card(10,0)];
        bytes32 seed = fh.packCards(cards);
        assertEq(fh.handRankOf(seed, "A"), 2);
    }

    function testPair() public {
        FiveCardDrawFixedHand fh = new FiveCardDrawFixedHand();
        uint8[5] memory cards = [_card(6,0), _card(6,1), _card(10,2), _card(4,3), _card(1,0)];
        bytes32 seed = fh.packCards(cards);
        assertEq(fh.handRankOf(seed, "A"), 1);
    }

    function testHighCard() public {
        FiveCardDrawFixedHand fh = new FiveCardDrawFixedHand();
        uint8[5] memory cards = [_card(12,0), _card(9,1), _card(6,2), _card(3,3), _card(0,0)];
        bytes32 seed = fh.packCards(cards);
        assertEq(fh.handRankOf(seed, "A"), 0);
    }

    function testRoyalFlushBeatsStraightFlush() public {
        FiveCardDrawFixedHand fh = new FiveCardDrawFixedHand();

        uint8[5] memory royal = [_card(12,0), _card(11,0), _card(10,0), _card(9,0), _card(8,0)];
        uint256 royalScore = fh.evaluate(fh.packCards(royal), "A");

        uint8[5] memory sf = [_card(11,1), _card(10,1), _card(9,1), _card(8,1), _card(7,1)];
        uint256 sfScore = fh.evaluate(fh.packCards(sf), "A");

        assertTrue(royalScore > sfScore);
    }

    function testTieBreakingWithinSameRank() public {
        FiveCardDrawFixedHand fh = new FiveCardDrawFixedHand();

        uint8[5] memory pairAces = [_card(12,0), _card(12,1), _card(10,2), _card(5,3), _card(2,0)];
        uint256 scoreAces = fh.evaluate(fh.packCards(pairAces), "A");

        uint8[5] memory pairKings = [_card(11,0), _card(11,1), _card(10,2), _card(5,3), _card(2,0)];
        uint256 scoreKings = fh.evaluate(fh.packCards(pairKings), "A");

        assertTrue(scoreAces > scoreKings);
        assertEq(uint8(scoreAces >> 20), 1);
        assertEq(uint8(scoreKings >> 20), 1);
    }

    function testWheelLosesToHigherStraight() public {
        FiveCardDrawFixedHand fh = new FiveCardDrawFixedHand();

        uint8[5] memory wheel = [_card(12,0), _card(0,1), _card(1,2), _card(2,3), _card(3,0)];
        uint256 wheelScore = fh.evaluate(fh.packCards(wheel), "A");

        uint8[5] memory sixHigh = [_card(4,0), _card(3,1), _card(2,2), _card(1,3), _card(0,0)];
        uint256 sixHighScore = fh.evaluate(fh.packCards(sixHigh), "A");

        assertTrue(sixHighScore > wheelScore);
    }

    function testGetRoundResultMetadataFormat() public {
        string memory meta = poker.getRoundResultMetadata(bytes32(uint256(1)), bytes32(uint256(2)), bytes32(uint256(3)), bytes32(uint256(4)));
        assertTrue(bytes(meta).length > 0);
    }

    function testMetadataDrawPath() public {
        FiveCardDrawHarness drawHarness = new FiveCardDrawHarness();
        string memory meta = drawHarness.getRoundResultMetadata(bytes32(uint256(1)), bytes32(uint256(2)), bytes32(uint256(3)), bytes32(uint256(4)));
        assertTrue(bytes(meta).length > 0);
    }

    function testMetadataPlayerAWinsPath() public {
        FiveCardDrawMetaHarness mh = new FiveCardDrawMetaHarness();
        string memory meta = mh.getRoundResultMetadata(bytes32(0), bytes32(0), bytes32(0), bytes32(0));
        assertTrue(bytes(meta).length > 0);
    }

    // =====================================================
    // FiveCardDraw: New interface stub tests
    // =====================================================

    function testFiveCardDrawRequiresDiscardFalse() public {
        assertEq(poker.requiresDiscard(), false);
    }

    function test_RevertIf_FiveCardDrawResolveDraw() public {
        vm.expectRevert("No discard");
        poker.resolveDraw(bytes32(0), 0, 0);
    }

    function test_RevertIf_FiveCardDrawGetDrawResultMetadata() public {
        vm.expectRevert("No discard");
        poker.getDrawResultMetadata(bytes32(0), 0, 0);
    }

    // =====================================================
    // Non-discard game skips DISCARD phase
    // =====================================================

    function testNonDiscardGameSkipsDiscardPhase() public {
        // FiveCardDraw.requiresDiscard() returns false → after reveal, round resolves directly
        vm.prank(playerA);
        escrow.createMatch{value: STAKE}(STAKE, address(poker));
        vm.prank(playerB);
        escrow.joinMatch{value: STAKE}(1);

        bytes32 moveA = bytes32(uint256(0xAAA));
        bytes32 saltA = bytes32(uint256(1));
        bytes32 hashA = keccak256(abi.encodePacked(uint256(1), uint8(1), playerA, moveA, saltA));
        bytes32 moveB = bytes32(uint256(0xBBB));
        bytes32 saltB = bytes32(uint256(2));
        bytes32 hashB = keccak256(abi.encodePacked(uint256(1), uint8(1), playerB, moveB, saltB));

        vm.prank(playerA);
        escrow.commitMove(1, hashA);
        vm.prank(playerB);
        escrow.commitMove(1, hashB);
        vm.prank(playerA);
        escrow.revealMove(1, moveA, saltA);
        vm.prank(playerB);
        escrow.revealMove(1, moveB, saltB);

        MatchEscrowV2.Match memory m = escrow.getMatch(1);
        // Should have resolved the round (not stuck in DISCARD phase)
        assertTrue(m.winsA == 1 || m.winsB == 1 || m.currentRound == 2);
        assertTrue(m.phase == MatchState.Phase.COMMIT || m.status == MatchState.MatchStatus.SETTLED);
    }

    // =====================================================
    // DISCARD phase escrow tests
    // =====================================================

    /// @dev Helper to set up a discard match, commit, reveal, and get to DISCARD phase
    function _setupDiscardMatch() internal returns (
        MockDiscardGameLogic discardLogic,
        bytes32 moveA, bytes32 saltA, bytes32 moveB, bytes32 saltB
    ) {
        discardLogic = new MockDiscardGameLogic();
        escrow.approveGameLogic(address(discardLogic), true);

        vm.prank(playerA);
        escrow.createMatch{value: STAKE}(STAKE, address(discardLogic));
        vm.prank(playerB);
        escrow.joinMatch{value: STAKE}(1);

        moveA = bytes32(uint256(0xAAA));
        saltA = bytes32(uint256(1));
        moveB = bytes32(uint256(0xBBB));
        saltB = bytes32(uint256(2));

        bytes32 hashA = keccak256(abi.encodePacked(uint256(1), uint8(1), playerA, moveA, saltA));
        bytes32 hashB = keccak256(abi.encodePacked(uint256(1), uint8(1), playerB, moveB, saltB));

        vm.prank(playerA);
        escrow.commitMove(1, hashA);
        vm.prank(playerB);
        escrow.commitMove(1, hashB);
        vm.prank(playerA);
        escrow.revealMove(1, moveA, saltA);
        vm.prank(playerB);
        escrow.revealMove(1, moveB, saltB);
    }

    function testDiscardPhaseTransition() public {
        _setupDiscardMatch();

        MatchEscrowV2.Match memory m = escrow.getMatch(1);
        assertEq(uint(m.phase), uint(MatchState.Phase.DISCARD));
        assertTrue(m.discardDeadline > 0);
    }

    function testFullDiscardFlowHappyPath() public {
        _setupDiscardMatch();

        // Both players submit discards
        vm.prank(playerA);
        escrow.submitDiscard(1, 3); // discard cards 0 and 1
        vm.prank(playerB);
        escrow.submitDiscard(1, 0); // keep all cards

        MatchEscrowV2.Match memory m = escrow.getMatch(1);
        // Round should be resolved
        assertTrue(m.winsA == 1 || m.winsB == 1 || m.currentRound == 2);
    }

    function test_RevertIf_SubmitDiscardNotActive() public {
        vm.prank(playerA);
        escrow.createMatch{value: STAKE}(STAKE, address(poker));
        vm.prank(playerA);
        vm.expectRevert("Not active");
        escrow.submitDiscard(1, 0);
    }

    function test_RevertIf_SubmitDiscardWrongPhase() public {
        vm.prank(playerA);
        escrow.createMatch{value: STAKE}(STAKE, address(poker));
        vm.prank(playerB);
        escrow.joinMatch{value: STAKE}(1);
        // In COMMIT phase
        vm.prank(playerA);
        vm.expectRevert("Not in discard");
        escrow.submitDiscard(1, 0);
    }

    function test_RevertIf_SubmitDiscardExpired() public {
        _setupDiscardMatch();

        vm.warp(block.timestamp + 2 hours);
        vm.prank(playerA);
        vm.expectRevert("Expired");
        escrow.submitDiscard(1, 0);
    }

    function test_RevertIf_SubmitDiscardUnauthorized() public {
        _setupDiscardMatch();

        vm.prank(stranger);
        vm.expectRevert("Unauthorized");
        escrow.submitDiscard(1, 0);
    }

    function test_RevertIf_SubmitDiscardInvalidMask() public {
        _setupDiscardMatch();

        vm.prank(playerA);
        vm.expectRevert("Invalid mask");
        escrow.submitDiscard(1, 32); // > 31
    }

    function test_RevertIf_SubmitDiscardAlreadySubmitted() public {
        _setupDiscardMatch();

        vm.prank(playerA);
        escrow.submitDiscard(1, 5);
        vm.prank(playerA);
        vm.expectRevert("Already submitted");
        escrow.submitDiscard(1, 3);
    }

    function testClaimTimeoutDiscardPhaseByA() public {
        _setupDiscardMatch();

        // Only A submits
        vm.prank(playerA);
        escrow.submitDiscard(1, 0);

        vm.warp(block.timestamp + 2 hours);
        vm.prank(playerA);
        escrow.claimTimeout(1);

        assertEq(escrow.getMatch(1).winsA, 3);
        assertEq(uint(escrow.getMatch(1).status), uint(MatchState.MatchStatus.SETTLED));
    }

    function testClaimTimeoutDiscardPhaseByB() public {
        _setupDiscardMatch();

        // Only B submits
        vm.prank(playerB);
        escrow.submitDiscard(1, 0);

        vm.warp(block.timestamp + 2 hours);
        vm.prank(playerB);
        escrow.claimTimeout(1);

        assertEq(escrow.getMatch(1).winsB, 3);
        assertEq(uint(escrow.getMatch(1).status), uint(MatchState.MatchStatus.SETTLED));
    }

    function test_RevertIf_ClaimTimeoutDiscardOpponentSubmitted() public {
        _setupDiscardMatch();

        // Both submit (but let's test the case where opponent has submitted)
        vm.prank(playerB);
        escrow.submitDiscard(1, 0);

        vm.warp(block.timestamp + 2 hours);
        vm.prank(playerA);
        vm.expectRevert("Opponent submitted");
        escrow.claimTimeout(1);
    }

    function test_RevertIf_ClaimTimeoutDiscardDeadlineNotPassed() public {
        _setupDiscardMatch();

        vm.prank(playerA);
        escrow.submitDiscard(1, 0);

        // Deadline not passed
        vm.prank(playerA);
        vm.expectRevert("Deadline not passed");
        escrow.claimTimeout(1);
    }

    function testMutualTimeoutDiscardPhase() public {
        _setupDiscardMatch();

        // Neither submits
        vm.warp(block.timestamp + 2 hours);
        vm.prank(playerA);
        escrow.mutualTimeout(1);

        assertEq(uint(escrow.getMatch(1).status), uint(MatchState.MatchStatus.VOIDED));
    }

    function test_RevertIf_MutualTimeoutDiscardNotMutual() public {
        _setupDiscardMatch();

        // Only A submits
        vm.prank(playerA);
        escrow.submitDiscard(1, 0);

        vm.warp(block.timestamp + 2 hours);
        vm.prank(playerB);
        vm.expectRevert("Not a mutual timeout");
        escrow.mutualTimeout(1);
    }

    function test_RevertIf_MutualTimeoutDiscardDeadlineNotPassed() public {
        _setupDiscardMatch();

        vm.prank(playerA);
        vm.expectRevert("Deadline not passed");
        escrow.mutualTimeout(1);
    }

    function testMultiRoundMatchWithDiscard() public {
        MockDiscardPlayerAWinsLogic aWinsDiscard = new MockDiscardPlayerAWinsLogic();
        escrow.approveGameLogic(address(aWinsDiscard), true);

        vm.prank(playerA);
        escrow.createMatch{value: STAKE}(STAKE, address(aWinsDiscard));
        vm.prank(playerB);
        escrow.joinMatch{value: STAKE}(1);

        for (uint8 r = 1; r <= 3; r++) {
            bytes32 moveA = bytes32(uint256(r));
            bytes32 saltA = bytes32(uint256(r + 10));
            bytes32 moveB = bytes32(uint256(r + 20));
            bytes32 saltB = bytes32(uint256(r + 30));
            bytes32 hashA = keccak256(abi.encodePacked(uint256(1), r, playerA, moveA, saltA));
            bytes32 hashB = keccak256(abi.encodePacked(uint256(1), r, playerB, moveB, saltB));

            vm.prank(playerA);
            escrow.commitMove(1, hashA);
            vm.prank(playerB);
            escrow.commitMove(1, hashB);
            vm.prank(playerA);
            escrow.revealMove(1, moveA, saltA);
            vm.prank(playerB);
            escrow.revealMove(1, moveB, saltB);

            // Check if we're in discard phase
            MatchEscrowV2.Match memory m = escrow.getMatch(1);
            if (m.status == MatchState.MatchStatus.ACTIVE && m.phase == MatchState.Phase.DISCARD) {
                vm.prank(playerA);
                escrow.submitDiscard(1, 0);
                vm.prank(playerB);
                escrow.submitDiscard(1, 0);
            }
        }

        MatchEscrowV2.Match memory finalM = escrow.getMatch(1);
        assertEq(uint(finalM.status), uint(MatchState.MatchStatus.SETTLED));
        assertEq(finalM.winsA, 3);
    }

    // =====================================================
    // FiveCardDrawWithDiscard tests
    // =====================================================

    function testWithDiscardGameType() public {
        FiveCardDrawWithDiscard discardPoker = new FiveCardDrawWithDiscard();
        assertEq(discardPoker.gameType(), "FIVE_CARD_DRAW_WITH_DISCARD");
    }

    function testWithDiscardRequiresDiscard() public {
        FiveCardDrawWithDiscard discardPoker = new FiveCardDrawWithDiscard();
        assertEq(discardPoker.requiresDiscard(), true);
    }

    function testWithDiscardSurrenderPayout() public {
        FiveCardDrawWithDiscard discardPoker = new FiveCardDrawWithDiscard();
        assertEq(discardPoker.surrenderPayout(), 7500);
    }

    function testResolveDrawBasic() public {
        FiveCardDrawWithDiscard discardPoker = new FiveCardDrawWithDiscard();
        uint8 winner = discardPoker.resolveDraw(bytes32(uint256(42)), 0, 0);
        assertTrue(winner == 0 || winner == 1 || winner == 2);
    }

    function testResolveDrawDeterministic() public {
        FiveCardDrawWithDiscard discardPoker = new FiveCardDrawWithDiscard();
        bytes32 seed = bytes32(uint256(123));
        uint8 r1 = discardPoker.resolveDraw(seed, 3, 5);
        uint8 r2 = discardPoker.resolveDraw(seed, 3, 5);
        assertEq(r1, r2);
    }

    function testResolveDrawMaskZeroNoChange() public {
        FiveCardDrawWithDiscard discardPoker = new FiveCardDrawWithDiscard();
        bytes32 seed = bytes32(uint256(42));
        // mask=0 means no discards; should be equivalent to resolveRoundV2 with same seed
        uint8 winner = discardPoker.resolveDraw(seed, 0, 0);
        assertTrue(winner == 0 || winner == 1 || winner == 2);
    }

    function testResolveDrawMask31AllReplaced() public {
        FiveCardDrawWithDiscard discardPoker = new FiveCardDrawWithDiscard();
        bytes32 seed = bytes32(uint256(999));
        // mask=31 (0b11111) → all 5 cards replaced
        uint8 winner = discardPoker.resolveDraw(seed, 31, 31);
        assertTrue(winner == 0 || winner == 1 || winner == 2);
    }

    function testSharedDeckUniqueCards() public {
        FiveCardDrawWithDiscardHarness h = new FiveCardDrawWithDiscardHarness();
        bytes32 seed = bytes32(uint256(42));
        (uint8[5] memory cardsA, uint8[5] memory cardsB) = h.exposedDealSharedDeck(seed);

        // All 10 cards should be unique
        uint8[10] memory allCards;
        for (uint256 i = 0; i < 5; i++) {
            allCards[i] = cardsA[i];
            allCards[i + 5] = cardsB[i];
        }

        for (uint256 i = 0; i < 10; i++) {
            assertTrue(allCards[i] < 52);
            for (uint256 j = i + 1; j < 10; j++) {
                assertTrue(allCards[i] != allCards[j], "Duplicate card found in shared deck");
            }
        }
    }

    function testReplacementCardsUnique() public {
        FiveCardDrawWithDiscardHarness h = new FiveCardDrawWithDiscardHarness();
        bytes32 seed = bytes32(uint256(42));

        // Get initial deal and final hands after full replacement
        (uint8[5] memory startA, uint8[5] memory startB) = h.exposedDealSharedDeck(seed);
        (uint8[5] memory finalA, uint8[5] memory finalB) = h.exposedResolveDrawHands(seed, 31, 31);

        // Collect all unique cards (start + final)
        // With mask=31, all original cards should be replaced, but replacements
        // must not duplicate each other or the other player's cards
        for (uint256 i = 0; i < 5; i++) {
            assertTrue(finalA[i] < 52);
            assertTrue(finalB[i] < 52);
            // Final A cards should all be unique among themselves
            for (uint256 j = i + 1; j < 5; j++) {
                assertTrue(finalA[i] != finalA[j], "Duplicate in final A");
                assertTrue(finalB[i] != finalB[j], "Duplicate in final B");
            }
        }

        // Final A and final B should not overlap
        for (uint256 i = 0; i < 5; i++) {
            for (uint256 j = 0; j < 5; j++) {
                assertTrue(finalA[i] != finalB[j], "Cross-player duplicate in final hands");
            }
        }
    }

    function testGetDrawResultMetadataContainsFields() public {
        FiveCardDrawWithDiscard discardPoker = new FiveCardDrawWithDiscard();
        string memory meta = discardPoker.getDrawResultMetadata(bytes32(uint256(42)), 3, 5);
        assertTrue(bytes(meta).length > 50);
        // Verify it's valid JSON starting with {
        bytes memory metaBytes = bytes(meta);
        assertEq(uint8(metaBytes[0]), uint8(bytes1("{")));
    }

    function testWithDiscardResolveRoundV2() public {
        FiveCardDrawWithDiscard discardPoker = new FiveCardDrawWithDiscard();
        uint8 winner = discardPoker.resolveRoundV2(
            bytes32(uint256(1)), bytes32(uint256(2)),
            bytes32(uint256(3)), bytes32(uint256(4))
        );
        assertTrue(winner == 0 || winner == 1 || winner == 2);
    }

    function testWithDiscardGetRoundResultMetadata() public {
        FiveCardDrawWithDiscard discardPoker = new FiveCardDrawWithDiscard();
        string memory meta = discardPoker.getRoundResultMetadata(
            bytes32(uint256(1)), bytes32(uint256(2)),
            bytes32(uint256(3)), bytes32(uint256(4))
        );
        assertTrue(bytes(meta).length > 0);
        bytes memory metaBytes = bytes(meta);
        assertEq(uint8(metaBytes[0]), uint8(bytes1("{")));
    }

    function testWithDiscardResolveDrawConsistencyWithMaskZero() public {
        FiveCardDrawWithDiscard discardPoker = new FiveCardDrawWithDiscard();
        bytes32 seed = keccak256(abi.encodePacked(bytes32(uint256(1)), bytes32(uint256(2)), bytes32(uint256(3)), bytes32(uint256(4))));

        // resolveRoundV2 computes deckSeed internally the same way
        uint8 winnerRound = discardPoker.resolveRoundV2(bytes32(uint256(1)), bytes32(uint256(2)), bytes32(uint256(3)), bytes32(uint256(4)));
        uint8 winnerDraw = discardPoker.resolveDraw(seed, 0, 0);
        assertEq(winnerRound, winnerDraw);
    }
}

// =====================================================
// Mock game logic contracts for controlled test outcomes
// =====================================================

/// @dev Returns alternating winners based on move1 value: 1, 2, 1, 2, 0 for a 2-2 tie after 5 rounds
contract MockDrawGameLogic is IGameLogicV2 {
    function resolveRoundV2(bytes32 move1, bytes32, bytes32, bytes32) external pure override returns (uint8) {
        uint256 round = uint256(move1);
        if (round == 1 || round == 3) return 1;
        if (round == 2 || round == 4) return 2;
        return 0;
    }

    function gameType() external pure override returns (string memory) { return "MOCK_DRAW"; }
    function surrenderPayout() external pure override returns (uint16) { return 7500; }
    function getRoundResultMetadata(bytes32, bytes32, bytes32, bytes32) external pure override returns (string memory) { return ""; }
    function requiresDiscard() external pure override returns (bool) { return false; }
    function resolveDraw(bytes32, uint8, uint8) external pure override returns (uint8) { revert("No discard"); }
    function getDrawResultMetadata(bytes32, uint8, uint8) external pure override returns (string memory) { revert("No discard"); }
}

/// @dev Always returns 0 (draw) for each round
contract MockDrawRoundGameLogic is IGameLogicV2 {
    function resolveRoundV2(bytes32, bytes32, bytes32, bytes32) external pure override returns (uint8) {
        return 0;
    }
    function gameType() external pure override returns (string memory) { return "MOCK_DRAW_ROUND"; }
    function surrenderPayout() external pure override returns (uint16) { return 7500; }
    function getRoundResultMetadata(bytes32, bytes32, bytes32, bytes32) external pure override returns (string memory) { return ""; }
    function requiresDiscard() external pure override returns (bool) { return false; }
    function resolveDraw(bytes32, uint8, uint8) external pure override returns (uint8) { revert("No discard"); }
    function getDrawResultMetadata(bytes32, uint8, uint8) external pure override returns (string memory) { revert("No discard"); }
}

/// @dev Always returns 1 (player A wins)
contract MockPlayerAWinsLogic is IGameLogicV2 {
    function resolveRoundV2(bytes32, bytes32, bytes32, bytes32) external pure override returns (uint8) {
        return 1;
    }
    function gameType() external pure override returns (string memory) { return "MOCK_A_WINS"; }
    function surrenderPayout() external pure override returns (uint16) { return 7500; }
    function getRoundResultMetadata(bytes32, bytes32, bytes32, bytes32) external pure override returns (string memory) { return ""; }
    function requiresDiscard() external pure override returns (bool) { return false; }
    function resolveDraw(bytes32, uint8, uint8) external pure override returns (uint8) { revert("No discard"); }
    function getDrawResultMetadata(bytes32, uint8, uint8) external pure override returns (string memory) { revert("No discard"); }
}

/// @dev Always returns 2 (player B wins)
contract MockPlayerBWinsLogic is IGameLogicV2 {
    function resolveRoundV2(bytes32, bytes32, bytes32, bytes32) external pure override returns (uint8) {
        return 2;
    }
    function gameType() external pure override returns (string memory) { return "MOCK_B_WINS"; }
    function surrenderPayout() external pure override returns (uint16) { return 7500; }
    function getRoundResultMetadata(bytes32, bytes32, bytes32, bytes32) external pure override returns (string memory) { return ""; }
    function requiresDiscard() external pure override returns (bool) { return false; }
    function resolveDraw(bytes32, uint8, uint8) external pure override returns (uint8) { revert("No discard"); }
    function getDrawResultMetadata(bytes32, uint8, uint8) external pure override returns (string memory) { revert("No discard"); }
}

/// @dev Mock discard game: requiresDiscard()=true, resolveDraw returns 1 (A wins)
contract MockDiscardGameLogic is IGameLogicV2 {
    function resolveRoundV2(bytes32, bytes32, bytes32, bytes32) external pure override returns (uint8) {
        return 1;
    }
    function gameType() external pure override returns (string memory) { return "MOCK_DISCARD"; }
    function surrenderPayout() external pure override returns (uint16) { return 7500; }
    function getRoundResultMetadata(bytes32, bytes32, bytes32, bytes32) external pure override returns (string memory) { return ""; }
    function requiresDiscard() external pure override returns (bool) { return true; }
    function resolveDraw(bytes32, uint8, uint8) external pure override returns (uint8) { return 1; }
    function getDrawResultMetadata(bytes32, uint8, uint8) external pure override returns (string memory) { return "{}"; }
}

/// @dev Mock discard game where A always wins via resolveDraw (for multi-round testing)
contract MockDiscardPlayerAWinsLogic is IGameLogicV2 {
    function resolveRoundV2(bytes32, bytes32, bytes32, bytes32) external pure override returns (uint8) {
        return 1;
    }
    function gameType() external pure override returns (string memory) { return "MOCK_DISCARD_A_WINS"; }
    function surrenderPayout() external pure override returns (uint16) { return 7500; }
    function getRoundResultMetadata(bytes32, bytes32, bytes32, bytes32) external pure override returns (string memory) { return ""; }
    function requiresDiscard() external pure override returns (bool) { return true; }
    function resolveDraw(bytes32, uint8, uint8) external pure override returns (uint8) { return 1; }
    function getDrawResultMetadata(bytes32, uint8, uint8) external pure override returns (string memory) { return "{}"; }
}

/// @dev Harness to expose internal FiveCardDrawWithDiscard functions for testing
contract FiveCardDrawWithDiscardHarness is FiveCardDrawWithDiscard {
    function exposedDealSharedDeck(bytes32 seed) external pure returns (uint8[5] memory cardsA, uint8[5] memory cardsB) {
        (cardsA, cardsB) = _dealSharedDeck(seed);
    }

    function exposedResolveDrawHands(bytes32 seed, uint8 maskA, uint8 maskB) external pure returns (
        uint8[5] memory finalA, uint8[5] memory finalB
    ) {
        DrawResult memory res = _resolveDrawFull(seed, maskA, maskB);
        return (res.finalA, res.finalB);
    }
}
