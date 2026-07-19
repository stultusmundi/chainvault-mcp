// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

// Minimal ERC1967-slot upgradeable counter: proxy + two implementations.
contract CounterProxy {
    // bytes32(uint256(keccak256("eip1967.proxy.implementation")) - 1)
    bytes32 private constant IMPL_SLOT =
        0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc;

    constructor(address implementation) {
        assembly { sstore(IMPL_SLOT, implementation) }
    }

    fallback() external payable {
        assembly {
            let impl := sload(IMPL_SLOT)
            calldatacopy(0, 0, calldatasize())
            let ok := delegatecall(gas(), impl, 0, calldatasize(), 0, 0)
            returndatacopy(0, 0, returndatasize())
            switch ok
            case 0 { revert(0, returndatasize()) }
            default { return(0, returndatasize()) }
        }
    }
}

contract CounterV1 {
    bytes32 private constant IMPL_SLOT =
        0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc;

    uint256 public count;

    function increment() external {
        count += 1;
    }

    function version() external pure returns (uint256) {
        return 1;
    }

    function upgradeTo(address newImplementation) external {
        assembly { sstore(IMPL_SLOT, newImplementation) }
    }
}

contract CounterV2 {
    bytes32 private constant IMPL_SLOT =
        0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc;

    uint256 public count;

    function increment() external {
        count += 2;
    }

    function version() external pure returns (uint256) {
        return 2;
    }

    function upgradeTo(address newImplementation) external {
        assembly { sstore(IMPL_SLOT, newImplementation) }
    }
}
