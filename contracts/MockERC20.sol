// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title MockERC20 — simple ERC20 pour tests locaux
contract MockERC20 is ERC20 {
    uint8 private _d;
    constructor(string memory name, string memory symbol, uint8 decimals_)
        ERC20(name, symbol) { _d = decimals_; }

    function decimals() public view override returns (uint8) { return _d; }
    function mint(address to, uint256 amount) external { _mint(to, amount); }
}
