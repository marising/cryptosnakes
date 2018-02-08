pragma solidity ^0.4.0;

contract Random {
  uint256 public lastRand;

	function Random() public {
		lastRand = uint256(block.blockhash(block.number - 1));
	}

	function gen256() public returns (uint256) {
		lastRand =
			uint256(keccak256(
				lastRand ^ uint256(block.blockhash(block.number - 1)) ^ now
			));

		return lastRand;
	}
}
