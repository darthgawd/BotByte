// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "forge-std/Test.sol";
import "../src/core/FiseEscrow.sol";
import "../src/core/LogicRegistry.sol";
import "../src/core/PriceProvider.sol";
import "../lib/chainlink-brownie-contracts/contracts/src/v0.8/tests/MockV3Aggregator.sol";

contract FISETest is Test {
    FiseEscrow public escrow;
    LogicRegistry public registry;
    PriceProvider public priceProvider;
    MockV3Aggregator public mockOracle;

    address public owner = address(this);
    address public treasury = address(0x123);
    address public referee = address(0x456);
    address public playerA = address(0xAAA);
    address public playerB = address(0xBBB);
    address public developer = address(0x789);

    bytes32 public logicId;

    function setUp() public {
        mockOracle = new MockV3Aggregator(8, 2500 * 1e8);
        priceProvider = new PriceProvider(address(mockOracle), 2 ether);
        registry = new LogicRegistry();
        
        escrow = new FiseEscrow(
            treasury,
            address(priceProvider),
            address(registry),
            referee
        );

        logicId = registry.registerLogic("QmSFAH26ZaFKDAyja8YAbq9ndwousixPZwMTTWkeyfZnGa", developer);
    }

    function test_RegisterLogic_OnlyOwner() public {
        vm.prank(playerA);
        vm.expectRevert();
        registry.registerLogic("QmAnotherOne", developer);
    }

    function test_RegisterLogic_DuplicateReverts() public {
        vm.expectRevert("Logic already registered");
        registry.registerLogic("QmSFAH26ZaFKDAyja8YAbq9ndwousixPZwMTTWkeyfZnGa", developer);
    }

    function test_SetVerificationStatus() public {
        registry.setVerificationStatus(logicId, true);
        (,,bool isVerified,,) = registry.registry(logicId);
        assertTrue(isVerified);
    }

    function test_SetReferee_OnlyOwner() public {
        address newRef = address(0x999);
        escrow.setReferee(newRef);
        assertEq(escrow.referee(), newRef);

        vm.prank(playerA);
        vm.expectRevert(); 
        escrow.setReferee(playerA);
    }

    function test_CreateFiseMatch() public {
        vm.deal(playerA, 1 ether);
        vm.prank(playerA);
        escrow.createFiseMatch{value: 0.1 ether}(0.1 ether, logicId);
        assertEq(escrow.fiseMatches(1), logicId);
    }

    function test_SettleFiseMatch_RoyaltySplit() public {
        vm.deal(playerA, 1 ether);
        vm.deal(playerB, 1 ether);
        vm.prank(playerA);
        escrow.createFiseMatch{value: 1 ether}(1 ether, logicId);
        vm.prank(playerB);
        escrow.joinMatch{value: 1 ether}(1);

        uint256 initialTreasury = treasury.balance;
        uint256 initialDeveloper = developer.balance;
        uint256 initialPlayerA = playerA.balance;

        vm.prank(referee);
        escrow.settleFiseMatch(1, playerA);

        assertEq(playerA.balance, initialPlayerA + 1.9 ether);
        assertEq(treasury.balance, initialTreasury + 0.06 ether);
        assertEq(developer.balance, initialDeveloper + 0.04 ether);
    }

    function test_SettleFiseMatch_Draw() public {
        vm.deal(playerA, 1 ether);
        vm.deal(playerB, 1 ether);
        vm.prank(playerA);
        escrow.createFiseMatch{value: 1 ether}(1 ether, logicId);
        vm.prank(playerB);
        escrow.joinMatch{value: 1 ether}(1);

        uint256 initialPlayerA = playerA.balance;
        uint256 initialPlayerB = playerB.balance;

        vm.prank(referee);
        escrow.settleFiseMatch(1, address(0));

        assertEq(playerA.balance, initialPlayerA + 1 ether);
        assertEq(playerB.balance, initialPlayerB + 1 ether);
    }

    function test_RevertIf_NonRefereeSettles() public {
        vm.prank(playerA);
        vm.expectRevert("Only Referee can call");
        escrow.settleFiseMatch(1, playerA);
    }

    function test_RevertIf_InvalidWinner() public {
        vm.deal(playerA, 1 ether);
        vm.deal(playerB, 1 ether);
        vm.prank(playerA);
        escrow.createFiseMatch{value: 1 ether}(1 ether, logicId);
        vm.prank(playerB);
        escrow.joinMatch{value: 1 ether}(1);

        vm.prank(referee);
        vm.expectRevert("Invalid winner");
        escrow.settleFiseMatch(1, address(0xDEAD));
    }

    function test_RecordVolume() public {
        registry.recordVolume(logicId, 5 ether);
        (,,,,uint256 volume) = registry.registry(logicId);
        assertEq(volume, 5 ether);
    }

    // --- Additional Branch Coverage Tests ---

    function test_Constructor_ZeroLogicRegistry_Reverts() public {
        vm.expectRevert("Invalid registry");
        new FiseEscrow(
            treasury,
            address(priceProvider),
            address(0),
            referee
        );
    }

    function test_Constructor_ZeroReferee_Reverts() public {
        vm.expectRevert("Invalid referee");
        new FiseEscrow(
            treasury,
            address(priceProvider),
            address(registry),
            address(0)
        );
    }

    function test_SetReferee_Success_VerifiedBySettle() public {
        address newReferee = address(0x999);
        
        escrow.setReferee(newReferee);
        
        // Verify new referee works by settling a match
        vm.deal(playerA, 1 ether);
        vm.deal(playerB, 1 ether);
        vm.prank(playerA);
        escrow.createFiseMatch{value: 1 ether}(1 ether, logicId);
        vm.prank(playerB);
        escrow.joinMatch{value: 1 ether}(1);
        
        vm.prank(newReferee);
        escrow.settleFiseMatch(1, playerA);
        
        MatchEscrow.Match memory m = escrow.getMatch(1);
        assertEq(uint256(m.status), uint256(MatchEscrow.MatchStatus.SETTLED));
    }

    function test_SetVerificationStatus_TrueThenFalse() public {
        // Set to true
        registry.setVerificationStatus(logicId, true);
        (,,bool isVerified,,) = registry.registry(logicId);
        assertTrue(isVerified);
        
        // Set back to false
        registry.setVerificationStatus(logicId, false);
        (,,isVerified,,) = registry.registry(logicId);
        assertFalse(isVerified);
    }

    function test_GetRegistryCount() public {
        uint256 countBefore = registry.getRegistryCount();
        
        registry.registerLogic("QmNewTestHash", developer);
        
        uint256 countAfter = registry.getRegistryCount();
        assertEq(countAfter, countBefore + 1);
    }

    function test_RecordVolume_ThroughSettlement() public {
        vm.deal(playerA, 1 ether);
        vm.deal(playerB, 1 ether);
        vm.prank(playerA);
        escrow.createFiseMatch{value: 1 ether}(1 ether, logicId);
        vm.prank(playerB);
        escrow.joinMatch{value: 1 ether}(1);

        (,,,,uint256 volumeBefore) = registry.registry(logicId);
        
        vm.prank(referee);
        escrow.settleFiseMatch(1, playerA);
        
        (,,,,uint256 volumeAfter) = registry.registry(logicId);
        assertEq(volumeAfter, volumeBefore + 2 ether);
    }

    // --- Additional Branch Coverage Tests ---

    function test_SetReferee_ZeroAddress_Reverts() public {
        vm.expectRevert("Invalid referee");
        escrow.setReferee(address(0));
    }

    function test_CreateFiseMatch_WrongStake_Reverts() public {
        vm.deal(playerA, 1 ether);
        vm.prank(playerA);
        vm.expectRevert("Incorrect stake amount");
        escrow.createFiseMatch{value: 0.5 ether}(1 ether, logicId);
    }

    function test_CreateFiseMatch_UnregisteredLogic_Reverts() public {
        vm.deal(playerA, 1 ether);
        vm.prank(playerA);
        bytes32 fakeLogicId = keccak256("fake");
        vm.expectRevert("Logic ID not registered");
        escrow.createFiseMatch{value: 0.1 ether}(0.1 ether, fakeLogicId);
    }

    function test_CreateFiseMatch_BelowMinimum_Reverts() public {
        // Price is $2500, min $2 = 0.0008 ETH
        // 0.0001 ETH = $0.25 (Too low)
        uint256 tinyStake = 0.0001 ether;
        vm.deal(playerA, 1 ether);
        vm.prank(playerA);
        vm.expectRevert("Stake below minimum");
        escrow.createFiseMatch{value: tinyStake}(tinyStake, logicId);
    }

    function test_SettleFiseMatch_NotActive_Reverts() public {
        // Try to settle match that doesn't exist
        vm.prank(referee);
        vm.expectRevert("Match not active");
        escrow.settleFiseMatch(999, playerA);
    }

    function test_SettleFiseMatch_NotFiseMatch_Reverts() public {
        // Create a regular match (not FISE)
        MockGameLogic mockLogic = new MockGameLogic();
        escrow.approveGameLogic(address(mockLogic), true);
        
        vm.deal(playerA, 1 ether);
        vm.deal(playerB, 1 ether);
        vm.prank(playerA);
        escrow.createMatch{value: 1 ether}(1 ether, address(mockLogic));
        vm.prank(playerB);
        escrow.joinMatch{value: 1 ether}(1);
        
        // Try to settle as FISE match
        vm.prank(referee);
        vm.expectRevert("Not a FISE match");
        escrow.settleFiseMatch(1, playerA);
    }

    function test_SetVerificationStatus_LogicNotFound_Reverts() public {
        bytes32 fakeLogicId = keccak256("nonexistent");
        vm.expectRevert("Logic not found");
        registry.setVerificationStatus(fakeLogicId, true);
    }
}

// Helper contract that rejects ETH transfers
contract RejectETH {
    receive() external payable {
        revert("ETH rejected");
    }
    
    fallback() external payable {
        revert("ETH rejected");
    }
}

// Mock game logic for testing non-FISE match settlement revert
contract MockGameLogic is IGameLogic {
    function resolveRound(uint8 move1, uint8 move2) external pure returns (uint8) {
        if (move1 == move2) return 0;
        return move1 > move2 ? 1 : 2;
    }
    function moveName(uint8) external pure returns (string memory) { return "MOVE"; }
    function gameType() external pure returns (string memory) { return "MOCK"; }
    function isValidMove(uint8) external pure returns (bool) { return true; }
    function winsRequired() external pure returns (uint8) { return 3; }
}
