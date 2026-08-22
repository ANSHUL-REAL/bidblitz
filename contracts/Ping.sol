// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// Throwaway pipeline test: compile -> deploy -> call -> see it on the explorer.
/// Deploy this BEFORE writing BidBlitz. If it doesn't work, the problem is the
/// toolchain, and you want to find that out at T+0:30, not T+4:00.
contract Ping {
    uint256 public n;
    event Bumped(address indexed by, uint256 n);

    function bump() external {
        emit Bumped(msg.sender, ++n);
    }
}
