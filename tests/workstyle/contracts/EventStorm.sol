// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

contract EventStorm {
    event Ping(address indexed sender, uint256 indexed index, uint256 value);

    function emitMany(uint256 count) external {
        for (uint256 i = 0; i < count; i++) {
            emit Ping(msg.sender, i, i * 2);
        }
    }
}
