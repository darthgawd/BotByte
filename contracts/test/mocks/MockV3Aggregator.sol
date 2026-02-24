// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract MockV3Aggregator {
    int256 private _price;
    uint8 public decimals;

    constructor(uint8 _decimals, int256 _initialPrice) {
        decimals = _decimals;
        _price = _initialPrice;
    }

    function updatePrice(int256 _newPrice) external {
        _price = _newPrice;
    }

    function latestRoundData()
        external
        view
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        )
    {
        return (0, _price, 0, block.timestamp, 0);
    }
}
