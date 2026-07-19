// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// ERC-20 that burns a 2% fee on every transfer — the classic
/// fee-on-transfer integration hazard (received != sent).
contract FeeToken {
    string public constant name = "FeeToken";
    string public constant symbol = "FEE";
    uint8 public constant decimals = 18;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;

    event Transfer(address indexed from, address indexed to, uint256 value);

    constructor(uint256 initialSupply) {
        totalSupply = initialSupply;
        balanceOf[msg.sender] = initialSupply;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "FeeToken: insufficient");
        uint256 fee = amount / 50; // 2%
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount - fee;
        totalSupply -= fee; // burn
        emit Transfer(msg.sender, to, amount - fee);
        return true;
    }
}
