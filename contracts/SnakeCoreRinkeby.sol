pragma solidity ^0.4.18;

import './SnakeCore.sol';


/// @title Kitty Core for Rinkeby
contract SnakeCoreRinkeby is SnakeCore {
    // https://ethereum.stackexchange.com/questions/16318/inherited-constructors
    function SnakeCoreRinkeby() public {
        cooldowns = [
            uint32(1 seconds),
            uint32(10 seconds),
            uint32(10 seconds),
            uint32(10 seconds),
            uint32(10 seconds),
            uint32(10 seconds),
            uint32(10 seconds),
            uint32(10 seconds),
            uint32(1 hours),
            uint32(1 hours),
            uint32(1 hours),
            uint32(1 hours),
            uint32(1 hours),
            uint32(1 hours)
        ];

        // make prices a bit higher for Rinkeby network to minimize abuse
        gen0StartingPrice = 1 ether;
    }

    /*** ANY RINKEBY-ONLY FUNCTION GO HERE: ***/

    /// @dev This function is not covered in the bounty program
    function destroyContract() public onlyCEO {
        selfdestruct(cooAddress);
    }
}
