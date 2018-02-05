pragma solidity ^0.4.18;

import "./SnakeBase.sol";
import "./ERC721Draft.sol";

/// @title The facet of the CryptoSnakes core contract that manages ownership, ERC-721 (draft) compliant.
/// @author Axiom Zen (https://www.axiomzen.co)
/// @dev Ref: https://github.com/ethereum/EIPs/issues/721
///  See the SnakeCore contract documentation to understand how the various contract facets are arranged.
contract SnakeOwnership is SnakeBase, ERC721 {

    /// @notice Name and symbol of the non fungible token, as defined in ERC721.
    string public name = "CryptoSnakes";
    string public symbol = "CS";

    // bool public implementsERC721 = true;
    //
    function implementsERC721() public pure returns (bool)
    {
        return true;
    }
    
    // Internal utility functions: These functions all assume that their input arguments
    // are valid. We leave it to public methods to sanitize their inputs and follow
    // the required logic.

    /// @dev Checks if a given address is the current owner of a particular Snake.
    /// @param _claimant the address we are validating against.
    /// @param _tokenId snake id, only valid when > 0
    function _owns(address _claimant, uint256 _tokenId) internal view returns (bool) {
        return snakeIndexToOwner[_tokenId] == _claimant;
    }

    /// @dev Checks if a given address currently has transferApproval for a particular Snake.
    /// @param _claimant the address we are confirming snake is approved for.
    /// @param _tokenId snake id, only valid when > 0
    function _approvedFor(address _claimant, uint256 _tokenId) internal view returns (bool) {
        return snakeIndexToApproved[_tokenId] == _claimant;
    }

    /// @dev Marks an address as being approved for transferFrom(), overwriting any previous
    ///  approval. Setting _approved to address(0) clears all transfer approval.
    ///  NOTE: _approve() does NOT send the Approval event. This is intentional because
    ///  _approve() and transferFrom() are used together for putting Snakes on auction, and
    ///  there is no value in spamming the log with Approval events in that case.
    function _approve(uint256 _tokenId, address _approved) internal {
        snakeIndexToApproved[_tokenId] = _approved;
    }

    /// @dev Transfers a snake owned by this contract to the specified address.
    ///  Used to rescue lost snakes. (There is no "proper" flow where this contract
    ///  should be the owner of any Snake. This function exists for us to reassign
    ///  the ownership of Snakes that users may have accidentally sent to our address.)
    /// @param _snakeId - ID of snake
    /// @param _recipient - Address to send the cat to
    function rescueLostSnake(uint256 _snakeId, address _recipient) public onlyCOO whenNotPaused {
        require(_owns(this, _snakeId));
        _transfer(this, _recipient, _snakeId);
    }

    /// @notice Returns the number of Snakes owned by a specific address.
    /// @param _owner The owner address to check.
    /// @dev Required for ERC-721 compliance
    function balanceOf(address _owner) public view returns (uint256 count) {
        return ownershipTokenCount[_owner];
    }

    /// @notice Transfers a Snake to another address. If transferring to a smart
    ///  contract be VERY CAREFUL to ensure that it is aware of ERC-721 (or
    ///  CryptoSnakes specifically) or your Snake may be lost forever. Seriously.
    /// @param _to The address of the recipient, can be a user or contract.
    /// @param _tokenId The ID of the Snake to transfer.
    /// @dev Required for ERC-721 compliance.
    function transfer(
        address _to,
        uint256 _tokenId
    )
        public
        whenNotPaused
    {
        // Safety check to prevent against an unexpected 0x0 default.
        require(_to != address(0));
        // You can only send your own cat.
        require(_owns(msg.sender, _tokenId));

        // Reassign ownership, clear pending approvals, emit Transfer event.
        _transfer(msg.sender, _to, _tokenId);
    }

    /// @notice Grant another address the right to transfer a specific Snake via
    ///  transferFrom(). This is the preferred flow for transfering NFTs to contracts.
    /// @param _to The address to be granted transfer approval. Pass address(0) to
    ///  clear all approvals.
    /// @param _tokenId The ID of the Snake that can be transferred if this call succeeds.
    /// @dev Required for ERC-721 compliance.
    function approve(
        address _to,
        uint256 _tokenId
    )
        public
        whenNotPaused
    {
        // Only an owner can grant transfer approval.
        require(_owns(msg.sender, _tokenId));

        // Register the approval (replacing any previous approval).
        _approve(_tokenId, _to);

        // Emit approval event.
        Approval(msg.sender, _to, _tokenId);
    }

    /// @notice Transfer a Snake owned by another address, for which the calling address
    ///  has previously been granted transfer approval by the owner.
    /// @param _from The address that owns the Snake to be transfered.
    /// @param _to The address that should take ownership of the Snake. Can be any address,
    ///  including the caller.
    /// @param _tokenId The ID of the Snake to be transferred.
    /// @dev Required for ERC-721 compliance.
    function transferFrom(
        address _from,
        address _to,
        uint256 _tokenId
    )
        public
        whenNotPaused
    {
        // Check for approval and valid ownership
        require(_approvedFor(msg.sender, _tokenId));
        require(_owns(_from, _tokenId));

        // Reassign ownership (also clears pending approvals and emits Transfer event).
        _transfer(_from, _to, _tokenId);
    }

    /// @notice Returns the total number of Snakes currently in existence.
    /// @dev Required for ERC-721 compliance.
    function totalSupply() public view returns (uint) {
        return snakes.length - 1;
    }

    /// @notice Returns the address currently assigned ownership of a given Snake.
    /// @dev Required for ERC-721 compliance.
    function ownerOf(uint256 _tokenId)
        public
        view
        returns (address owner)
    {
        owner = snakeIndexToOwner[_tokenId];

        require(owner != address(0));
    }

    /// @notice Returns the nth Snake assigned to an address, with n specified by the
    ///  _index argument.
    /// @param _owner The owner whose Snakes we are interested in.
    /// @param _index The zero-based index of the cat within the owner's list of cats.
    ///  Must be less than balanceOf(_owner).
    /// @dev This method MUST NEVER be called by smart contract code. It will almost
    ///  certainly blow past the block gas limit once there are a large number of
    ///  Snakes in existence. Exists only to allow off-chain queries of ownership.
    ///  Optional method for ERC-721.
    function tokensOfOwnerByIndex(address _owner, uint256 _index)
        external
        view
        returns (uint256 tokenId)
    {
        uint256 count = 0;
        for (uint256 i = 1; i <= totalSupply(); i++) {
            if (snakeIndexToOwner[i] == _owner) {
                if (count == _index) {
                    return i;
                } else {
                    count++;
                }
            }
        }
        revert();
    }
}
