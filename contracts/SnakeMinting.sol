pragma solidity ^0.4.18;

// Auction wrapper functions
import "./SnakeAuction.sol";

/// @title all functions related to creating snakes
contract SnakeMinting is SnakeAuction {

    // Limits the number of cats the contract owner can ever create.
    uint256 public promoCreationLimit = 5000;
    uint256 public gen0CreationLimit = 50000;

    // Constants for gen0 auctions.
    uint256 public gen0StartingPrice = 10 finney;
    uint256 public gen0AuctionDuration = 1 days;

    // Counts the number of cats the contract owner has created.
    uint256 public promoCreatedCount;
    uint256 public gen0CreatedCount;

    /// @dev we can create promo snakes, up to a limit. Only callable by COO
    /// @param _genes the encoded genes of the snakes to be created, any value is accepted
    /// @param _owner the future owner of the created snakes. Default to contract COO
    function createPromoSnake(uint256 _genes, address _owner) public onlyCOO {
        if (_owner == address(0)) {
             _owner = cooAddress;
        }
        require(promoCreatedCount < promoCreationLimit);
        require(gen0CreatedCount < gen0CreationLimit);

        promoCreatedCount++;
        gen0CreatedCount++;
        _createSnake(0, 0, 0, _genes, _owner);
    }

    /// @dev Creates a new gen0 snake with the given genes and
    ///  creates an auction for it.
    function createGen0Auction(uint256 _genes) public onlyCOO {
        require(gen0CreatedCount < gen0CreationLimit);

        uint256 snakeId = _createSnake(0, 0, 0, _genes, address(this));
        _approve(snakeId, saleAuction);

        saleAuction.createAuction(
            snakeId,
            _computeNextGen0Price(),
            0,
            gen0AuctionDuration,
            address(this)
        );

        gen0CreatedCount++;
    }

    /// @dev Computes the next gen0 auction starting price, given
    ///  the average of the past 5 prices + 50%.
    function _computeNextGen0Price() internal view returns (uint256) {
        uint256 avePrice = saleAuction.averageGen0SalePrice();

        // sanity check to ensure we don't overflow arithmetic (this big number is 2^128-1).
        require(avePrice < 340282366920938463463374607431768211455);

        uint256 nextPrice = avePrice + (avePrice / 2);

        // We never auction for less than starting price
        if (nextPrice < gen0StartingPrice) {
            nextPrice = gen0StartingPrice;
        }

        return nextPrice;
    }
}
