// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

contract PayableVault {
    mapping(address => uint256) public deposits;

    event Deposited(address indexed from, uint256 amount);
    event Withdrawn(address indexed to, uint256 amount);

    function deposit() external payable {
        require(msg.value > 0, "PayableVault: zero deposit");
        deposits[msg.sender] += msg.value;
        emit Deposited(msg.sender, msg.value);
    }

    receive() external payable {
        deposits[msg.sender] += msg.value;
        emit Deposited(msg.sender, msg.value);
    }

    function withdraw(uint256 amount) external {
        require(deposits[msg.sender] >= amount, "PayableVault: insufficient deposit");
        deposits[msg.sender] -= amount;
        (bool ok, ) = msg.sender.call{value: amount}("");
        require(ok, "PayableVault: transfer failed");
        emit Withdrawn(msg.sender, amount);
    }
}
