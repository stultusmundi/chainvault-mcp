// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

contract GasHog {
    mapping(uint256 => uint256) public slots;

    function waste(uint256 iterations) external {
        for (uint256 i = 0; i < iterations; i++) {
            slots[i] = i + 1; // cold SSTOREs — expensive on purpose
        }
    }
}
