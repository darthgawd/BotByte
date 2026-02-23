// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/core/MatchEscrowV2.sol";
import "../src/logic/FiveCardDraw.sol";

contract SimpleReceiver {
    bool public accept = true;
    receive() external payable {
        require(accept, "Rejected");
    }
    function setAccept(bool _accept) external {
        accept = _accept;
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
        assertEq(uint(m.status), uint(MatchEscrowV2.MatchStatus.VOIDED));
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
        escrow.mutualTimeout(1);
        assertEq(uint(escrow.getMatch(1).status), uint(MatchEscrowV2.MatchStatus.VOIDED));
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
        escrow.mutualTimeout(1);
        assertEq(uint(escrow.getMatch(1).status), uint(MatchEscrowV2.MatchStatus.VOIDED));
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
        assertEq(uint(escrow.getMatch(1).status), uint(MatchEscrowV2.MatchStatus.VOIDED));
    }

    function testAdminVoidActive() public {
        vm.prank(playerA);
        escrow.createMatch{value: STAKE}(STAKE, address(poker));
        vm.prank(playerB);
        escrow.joinMatch{value: STAKE}(1);
        escrow.adminVoidMatch(1);
        assertEq(uint(escrow.getMatch(1).status), uint(MatchEscrowV2.MatchStatus.VOIDED));
    }

    function testAdminVoidZeroAddresses() public {
        // Manually manipulate storage using cheatcodes to test the address(0) branches
        vm.prank(playerA);
        escrow.createMatch{value: STAKE}(STAKE, address(poker));
        
        // Match struct has playerA at offset 0. 
        // We'll set it to address(0) manually.
        // mapping(uint256 => Match) is at slot 0 (counter), 1 (rake), 2 (treasury), 3 (matches)
        // MatchEscrowV2 storage layout: counter(0), rake(1), treasury(2), matches(3), roundCommits(4)...
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
        escrow.mutualTimeout(1);
    }

    function testFiveCardDrawSpecifics() public {
        uint8 winner = poker.resolveRoundV2(bytes32(uint256(1)), bytes32(uint256(1)), bytes32(uint256(2)), bytes32(uint256(2)));
        assertTrue(winner == 1 || winner == 2);
        
        assertEq(poker.surrenderPayout(), 7500);
        assertEq(poker.gameType(), "FIVE_CARD_DRAW");

        string memory meta = poker.getRoundResultMetadata(bytes32(0), bytes32(0), bytes32(0), bytes32(0));
        assertEq(meta, '{"game": "5-Card Draw", "status": "Provably Fair Logic Applied"}');
    }

    // --- Revert Cases ---

    function test_RevertIf_MutualTimeoutNotMet() public {
        vm.prank(playerA);
        escrow.createMatch{value: STAKE}(STAKE, address(poker));
        vm.prank(playerB);
        escrow.joinMatch{value: STAKE}(1);
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

    function test_RevertIf_TreasuryFail() public {
        SimpleReceiver badTreasury = new SimpleReceiver();
        badTreasury.setAccept(false);
        escrow.setTreasury(address(badTreasury));
        vm.prank(playerA);
        escrow.createMatch{value: STAKE}(STAKE, address(poker));
        vm.prank(playerB);
        escrow.joinMatch{value: STAKE}(1);
        vm.expectRevert("Treasury fail");
        vm.prank(playerA);
        escrow.surrender(1);
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
}
