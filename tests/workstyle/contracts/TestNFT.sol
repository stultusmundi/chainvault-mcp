// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

contract TestNFT {
    string public constant name = "TestNFT";
    string public constant symbol = "TNFT";
    uint256 public nextId;
    mapping(uint256 => address) public ownerOf;
    mapping(address => uint256) public balanceOf;

    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);

    function mint(address to) external returns (uint256 tokenId) {
        tokenId = nextId++;
        ownerOf[tokenId] = to;
        balanceOf[to] += 1;
        emit Transfer(address(0), to, tokenId);
    }

    function transferFrom(address from, address to, uint256 tokenId) external {
        require(ownerOf[tokenId] == from, "TestNFT: not owner");
        require(msg.sender == from, "TestNFT: not authorized");
        ownerOf[tokenId] = to;
        balanceOf[from] -= 1;
        balanceOf[to] += 1;
        emit Transfer(from, to, tokenId);
    }

    function tokenURI(uint256 tokenId) external pure returns (string memory) {
        require(tokenId < type(uint128).max, "TestNFT: bad id");
        return "ipfs://test-nft-metadata";
    }
}
