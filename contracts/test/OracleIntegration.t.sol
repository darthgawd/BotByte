// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/core/MatchEscrow.sol";
import "../src/games/RPS.sol";
import "./mocks/MockV3Aggregator.sol";

contract OracleIntegrationTest is Test {
    MatchEscrow public escrow;
    RPS public rps;
    MockV3Aggregator public priceFeed;
    
    address public playerA = address(0x1111);
    address public treasury = address(0x2222);

    // $2,500 ETH Price (with 8 decimals as per Chainlink)
    int256 public constant INITIAL_PRICE = 2500 * 1e8;

    function setUp() public {
        priceFeed = new MockV3Aggregator(8, INITIAL_PRICE);
        escrow = new MatchEscrow(treasury, address(priceFeed));
        rps = new RPS();
        
        vm.prank(escrow.owner());
        escrow.approveGameLogic(address(rps), true);
        
        vm.deal(playerA, 10 ether);
    }

    function test_GetEthAmount() public view {
        // Goal: $10 USD (18 decimals)
        uint256 usdAmount = 10 * 1e18;
        
        // At $2,500/ETH, $10 should be 0.004 ETH
        // Formula: (10 * 1e18 * 1e8) / (2500 * 1e8) = 0.004 * 1e18
        uint256 expectedEth = 0.004 ether;
        
        uint256 actualEth = escrow.getEthAmount(usdAmount);
        assertEq(actualEth, expectedEth, "Eth calculation mismatch");
    }

    function test_CreateMatchUSD_CorrectStake() public {
        uint256 usdAmount = 50 * 1e18; // $50
        // At $2,500/ETH, $50 = 0.02 ETH
        uint256 expectedEth = 0.02 ether;

        vm.prank(playerA);
        escrow.createMatchUSD{value: 0.02 ether}(usdAmount, address(rps));

        MatchEscrow.Match memory m = escrow.getMatch(1);
        assertEq(m.playerA, playerA);
        assertEq(m.stake, expectedEth);
    }

    event WithdrawalQueued(address indexed recipient, uint256 amount);

    function test_CreateMatchUSD_RefundExcess() public {
        uint256 usdAmount = 25 * 1e18; // $25
        // At $2,500/ETH, $25 = 0.01 ETH
        uint256 requiredEth = 0.01 ether;
        uint256 sentEth = 0.05 ether; // Send extra

        uint256 balBefore = playerA.balance;

        vm.prank(playerA);
        escrow.createMatchUSD{value: sentEth}(usdAmount, address(rps));

        uint256 balAfter = playerA.balance;
        uint256 pending = escrow.pendingWithdrawals(playerA);
        
        console.log("Required ETH:", requiredEth);
        console.log("Sent ETH:", sentEth);
        console.log("Balance Change:", balBefore - balAfter);
        console.log("Pending Withdrawal:", pending);

        // If direct transfer failed, it should be in pendingWithdrawals
        if (pending > 0) {
            assertEq(pending, sentEth - requiredEth, "Incorrect pending withdrawal amount");
        } else {
            assertEq(balBefore - balAfter, requiredEth, "Refund not handled correctly");
        }
        
        MatchEscrow.Match memory m = escrow.getMatch(1);
        assertEq(m.stake, requiredEth);
    }

    function test_CreateMatchUSD_PriceUpdate() public {
        uint256 usdAmount = 100 * 1e18; // $100
        
        // 1. Price drops to $2,000/ETH
        priceFeed.updatePrice(2000 * 1e8);
        // $100 / $2,000 = 0.05 ETH
        assertEq(escrow.getEthAmount(usdAmount), 0.05 ether);

        // 2. Price jumps to $4,000/ETH
        priceFeed.updatePrice(4000 * 1e8);
        // $100 / $4,000 = 0.025 ETH
        assertEq(escrow.getEthAmount(usdAmount), 0.025 ether);
    }

    function test_Fail_InsufficientEthForUSD() public {
        uint256 usdAmount = 100 * 1e18; // $100
        // At $2,500/ETH, $100 = 0.04 ETH
        
        vm.prank(playerA);
        vm.expectRevert("Insufficient ETH for USD stake");
        escrow.createMatchUSD{value: 0.01 ether}(usdAmount, address(rps));
    }
}
