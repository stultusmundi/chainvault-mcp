// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

contract Reverter {
    error CustomFail(uint256 code, string reason);

    function succeed() external pure returns (bool) {
        return true;
    }

    function failRequire() external pure {
        require(false, "Reverter: require failed as requested");
    }

    function failCustomError() external pure {
        revert CustomFail(42, "custom error as requested");
    }

    function failPanic(uint256 denominator) external pure returns (uint256) {
        return 1 / denominator; // denominator = 0 -> panic 0x12
    }
}
