pragma solidity ^0.4.12;

import "./Random.sol";

contract GeneScience {
    bool public isGeneScience = true;

    Random _random;

    function GeneScience(address randomAddr) public {
        _random = Random(randomAddr);
    }

    function mixGenes(uint256 genes1, uint256 genes2) public returns (uint256) {
        uint256 maskLow = 0x5555555555555555555555555555555555555555555555555555555555555555;
        uint256 maskHigh = 0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa;

        uint256 rand = _random.gen256();
        uint256 randR = ~rand;

        uint256 g1Low = genes1 & maskLow;
        uint256 g1High = (genes1 & maskHigh) >> 1;

        uint256 g2Low = (genes2 & maskLow) << 1;
        uint256 g2High = genes2 & maskHigh;

        return
            (g1Low & rand) |
            (g1High & randR) |
            (g2Low & rand) |
            (g2High & randR);
    }

    function couldBeParent(uint256 child, uint256 g) public pure returns (bool) {
        uint256 maskLow = 0x5555555555555555555555555555555555555555555555555555555555555555;
        uint256 maskHigh = 0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa;

        uint256 cLow = child & maskLow;
        uint256 cHigh = (child & maskHigh) >> 1;

        uint256 gLow = g & maskLow;
        uint256 gHigh = (g & maskHigh) >> 1;

        return
            ((cLow ^ gLow) | (cLow ^ gHigh) == gLow ^ gHigh) ||
            ((cHigh ^ gLow) | (cHigh ^ gHigh) == gLow ^ gHigh);
    }
}
