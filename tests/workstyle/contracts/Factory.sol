// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

contract Child {
    uint256 public immutable value;
    constructor(uint256 value_) {
        value = value_;
    }
}

contract Factory {
    address[] public children;

    event ChildCreated(address indexed child, uint256 value);

    function createChild(uint256 value) external returns (address) {
        Child child = new Child(value);
        children.push(address(child));
        emit ChildCreated(address(child), value);
        return address(child);
    }

    function childCount() external view returns (uint256) {
        return children.length;
    }
}
