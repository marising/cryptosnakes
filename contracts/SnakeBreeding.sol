pragma solidity ^0.4.18;

import './ExternalInterfaces/GeneScienceInterface.sol';
import './SnakeOwnership.sol';


/// @title A facet of SnakeCore that manages Snake siring, gestation, and birth.
/// @author Axiom Zen (https://www.axiomzen.co)
/// @dev See the SnakeCore contract documentation to understand how the various contract facets are arranged.
contract SnakeBreeding is SnakeOwnership {

    /// @dev The Pregnant event is fired when two cats successfully breed and the pregnancy
    ///  timer begins for the matron.
    event Pregnant(address owner, uint256 matronId, uint256 sireId);

    /// @dev The AutoBirth event is fired when a cat becomes pregant via the breedWithAuto()
    ///  function. This is used to notify the auto-birth daemon that this breeding action
    ///  included a pre-payment of the gas required to call the giveBirth() function.
    event AutoBirth(uint256 matronId, uint256 cooldownEndTime);

    /// @notice The minimum payment required to use breedWithAuto(). This fee goes towards
    ///  the gas cost paid by the auto-birth daemon, and can be dynamically updated by
    ///  the COO role as the gas price changes.
    uint256 public autoBirthFee = 1000000 * 1000000000; // (1M * 1 gwei)

    /// @dev The address of the sibling contract that is used to implement the sooper-sekret
    ///  genetic combination algorithm.
    GeneScienceInterface public geneScience;

    /// @dev Update the address of the genetic contract, can only be called by the CEO.
    /// @param _address An address of a GeneScience contract instance to be used from this point forward.
    function setGeneScienceAddress(address _address) public onlyCEO {
        GeneScienceInterface candidateContract = GeneScienceInterface(_address);

        // NOTE: verify that a contract is what we expect - https://github.com/Lunyr/crowdsale-contracts/blob/cfadd15986c30521d8ba7d5b6f57b4fefcc7ac38/contracts/LunyrToken.sol#L117
        require(candidateContract.isGeneScience());

        // Set the new contract address
        geneScience = candidateContract;
    }

    /// @dev Checks that a given snake is able to breed. Requires that the
    ///  current cooldown is finished (for sires) and also checks that there is
    ///  no pending pregnancy.
    function _isReadyToBreed(Snake _snake) internal view returns (bool) {
        // In addition to checking the cooldownEndTime, we also need to check to see if
        // the cat has a pending birth; there can be some period of time between the end
        // of the pregnacy timer and the birth event.
        return (_snake.siringWithId == 0) && (_snake.cooldownEndTime <= now);
    }

    /// @dev Check if a sire has authorized breeding with this matron. True if both sire
    ///  and matron have the same owner, or if the sire has given siring permission to
    ///  the matron's owner (via approveSiring()).
    function _isSiringPermitted(uint256 _sireId, uint256 _matronId) internal view returns (bool) {
        address matronOwner = snakeIndexToOwner[_matronId];
        address sireOwner = snakeIndexToOwner[_sireId];

        // Siring is okay if they have same owner, or if the matron's owner was given
        // permission to breed with this sire.
        return (matronOwner == sireOwner || sireAllowedToAddress[_sireId] == matronOwner);
    }

    /// @dev Set the cooldownEndTime for the given Snake, based on its current cooldownIndex.
    ///  Also increments the cooldownIndex (unless it has hit the cap).
    /// @param _snake A reference to the Snake in storage which needs its timer started.
    function _triggerCooldown(Snake storage _snake) internal {
        // Compute the end of the cooldown time (based on current cooldownIndex)
        _snake.cooldownEndTime = uint64(now + cooldowns[_snake.cooldownIndex]);

        // Increment the breeding count, clamping it at 13, which is the length of the
        // cooldowns array. We could check the array size dynamically, but hard-coding
        // this as a constant saves gas. Yay, Solidity!
        if (_snake.cooldownIndex < 13) {
            _snake.cooldownIndex += 1;
        }
    }

    /// @notice Grants approval to another user to sire with one of your Snakes.
    /// @param _addr The address that will be able to sire with your Snake. Set to
    ///  address(0) to clear all siring approvals for this Snake.
    /// @param _sireId A Snake that you own that _addr will now be able to sire with.
    function approveSiring(address _addr, uint256 _sireId)
        public
        whenNotPaused
    {
        require(_owns(msg.sender, _sireId));
        sireAllowedToAddress[_sireId] = _addr;
    }

    /// @dev Updates the minimum payment required for calling giveBirthAuto(). Can only
    ///  be called by the COO address. (This fee is used to offset the gas cost incurred
    ///  by the autobirth daemon).
    function setAutoBirthFee(uint256 val) public onlyCOO {
        autoBirthFee = val;
    }

    /// @dev Checks to see if a given Snake is pregnant and (if so) if the gestation
    ///  period has passed.
    function _isReadyToGiveBirth(Snake _matron) private view returns (bool) {
        return (_matron.siringWithId != 0) && (_matron.cooldownEndTime <= now);
    }

    /// @notice Checks that a given snake is able to breed (i.e. it is not pregnant or
    ///  in the middle of a siring cooldown).
    /// @param _snakeId reference the id of the snake, any user can inquire about it
    function isReadyToBreed(uint256 _snakeId)
        public
        view
        returns (bool)
    {
        require(_snakeId > 0);
        Snake storage snake = snakes[_snakeId];
        return _isReadyToBreed(snake);
    }

    /// @dev Internal check to see if a given sire and matron are a valid mating pair. DOES NOT
    ///  check ownership permissions (that is up to the caller).
    /// @param _matron A reference to the Snake struct of the potential matron.
    /// @param _matronId The matron's ID.
    /// @param _sire A reference to the Snake struct of the potential sire.
    /// @param _sireId The sire's ID
    function _isValidMatingPair(
        Snake storage _matron,
        uint256 _matronId,
        Snake storage _sire,
        uint256 _sireId
    )
        private
        view
        returns(bool)
    {
        // A Snake can't breed with itself!
        if (_matronId == _sireId) {
            return false;
        }

        // Snakes can't breed with their parents.
        if (_matron.matronId == _sireId || _matron.sireId == _sireId) {
            return false;
        }
        if (_sire.matronId == _matronId || _sire.sireId == _matronId) {
            return false;
        }

        // We can short circuit the sibling check (below) if either cat is
        // gen zero (has a matron ID of zero).
        if (_sire.matronId == 0 || _matron.matronId == 0) {
            return true;
        }

        // Snakes can't breed with full or half siblings.
        if (_sire.matronId == _matron.matronId || _sire.matronId == _matron.sireId) {
            return false;
        }
        if (_sire.sireId == _matron.matronId || _sire.sireId == _matron.sireId) {
            return false;
        }

        // Everything seems cool! Let's get DTF.
        return true;
    }

    /// @dev Internal check to see if a given sire and matron are a valid mating pair for
    ///  breeding via auction (i.e. skips ownership and siring approval checks).
    function _canBreedWithViaAuction(uint256 _matronId, uint256 _sireId)
        internal
        view
        returns (bool)
    {
        Snake storage matron = snakes[_matronId];
        Snake storage sire = snakes[_sireId];
        return _isValidMatingPair(matron, _matronId, sire, _sireId);
    }

    /// @notice Checks to see if two cats can breed together, including checks for
    ///  ownership and siring approvals. Does NOT check that both cats are ready for
    ///  breeding (i.e. breedWith could still fail until the cooldowns are finished).
    ///  TODO: Shouldn't this check pregnancy and cooldowns?!?
    /// @param _matronId The ID of the proposed matron.
    /// @param _sireId The ID of the proposed sire.
    function canBreedWith(uint256 _matronId, uint256 _sireId)
        public
        view
        returns(bool)
    {
        require(_matronId > 0);
        require(_sireId > 0);
        Snake storage matron = snakes[_matronId];
        Snake storage sire = snakes[_sireId];
        return _isValidMatingPair(matron, _matronId, sire, _sireId) &&
            _isSiringPermitted(_sireId, _matronId);
    }

    /// @notice Breed a Snake you own (as matron) with a sire that you own, or for which you
    ///  have previously been given Siring approval. Will either make your cat pregnant, or will
    ///  fail entirely.
    /// @param _matronId The ID of the Snake acting as matron (will end up pregnant if successful)
    /// @param _sireId The ID of the Snake acting as sire (will begin its siring cooldown if successful)
    function breedWith(uint256 _matronId, uint256 _sireId) public whenNotPaused {
        // Caller must own the matron.
        require(_owns(msg.sender, _matronId));

        // Neither sire nor matron are allowed to be on auction during a normal
        // breeding operation, but we don't need to check that explicitly.
        // For matron: The caller of this function can't be the owner of the matron
        //   because the owner of a Snake on auction is the auction house, and the
        //   auction house will never call breedWith().
        // For sire: Similarly, a sire on auction will be owned by the auction house
        //   and the act of transferring ownership will have cleared any oustanding
        //   siring approval.
        // Thus we don't need to spend gas explicitly checking to see if either cat
        // is on auction.

        // Check that matron and sire are both owned by caller, or that the sire
        // has given siring permission to caller (i.e. matron's owner).
        // Will fail for _sireId = 0
        require(_isSiringPermitted(_sireId, _matronId));

        // Grab a reference to the potential matron
        Snake storage matron = snakes[_matronId];

        // Make sure matron isn't pregnant, or in the middle of a siring cooldown
        require(_isReadyToBreed(matron));

        // Grab a reference to the potential sire
        Snake storage sire = snakes[_sireId];

        // Make sure sire isn't pregnant, or in the middle of a siring cooldown
        require(_isReadyToBreed(sire));

        // Test that these cats are a valid mating pair.
        require(_isValidMatingPair(
            matron,
            _matronId,
            sire,
            _sireId
        ));

        // All checks passed, snake gets pregnant!
        _breedWith(_matronId, _sireId);
    }

    /// @dev Internal utility function to initiate breeding, assumes that all breeding
    ///  requirements have been checked.
    function _breedWith(uint256 _matronId, uint256 _sireId) internal {
        // Grab a reference to the Snakes from storage.
        Snake storage sire = snakes[_sireId];
        Snake storage matron = snakes[_matronId];

        // Mark the matron as pregnant, keeping track of who the sire is.
        matron.siringWithId = uint32(_sireId);

        // Trigger the cooldown for both parents.
        _triggerCooldown(sire);
        _triggerCooldown(matron);

        // Clear siring permission for both parents. This may not be strictly necessary
        // but it's likely to avoid confusion!
        delete sireAllowedToAddress[_matronId];
        delete sireAllowedToAddress[_sireId];

        // Emit the pregnancy event.
        Pregnant(snakeIndexToOwner[_matronId], _matronId, _sireId);
    }

    /// @notice Works like breedWith(), but includes a pre-payment of the gas required to call
    ///  the giveBirth() function when gestation is over. This will allow our autobirth daemon
    ///  to call giveBirth() as soon as the gestation timer finishes. The required payment is given
    ///  by autoBirthFee().
    /// @param _matronId The ID of the Snake acting as matron (will end up pregnant if successful)
    /// @param _sireId The ID of the Snake acting as sire (will begin its siring cooldown if successful)
    function breedWithAuto(uint256 _matronId, uint256 _sireId)
        public
        payable
        whenNotPaused
    {
        // Check for payment
        require(msg.value >= autoBirthFee);

        // Call through the normal breeding flow
        breedWith(_matronId, _sireId);

        // Emit an AutoBirth message so the autobirth daemon knows when and for what cat to call
        // giveBirth().
        Snake storage matron = snakes[_matronId];
        AutoBirth(_matronId, matron.cooldownEndTime);
    }

    /// @notice Have a pregnant Snake give birth!
    /// @param _matronId A Snake ready to give birth.
    /// @return The Snake ID of the new snake.
    /// @dev Looks at a given Snake and, if pregnant and if the gestation period has passed,
    ///  combines the genes of the two parents to create a new snake. The new Snake is assigned
    ///  to the current owner of the matron. Upon successful completion, both the matron and the
    ///  new snake will be ready to breed again. Note that anyone can call this function (if they
    ///  are willing to pay the gas!), but the new snake always goes to the mother's owner.
    function giveBirth(uint256 _matronId)
        public
        whenNotPaused
        returns(uint256)
    {
        // Grab a reference to the matron in storage.
        Snake storage matron = snakes[_matronId];

        // Check that the matron is a valid cat.
        require(matron.birthTime != 0);

        // Check that the matron is pregnant, and that its time has come!
        require(_isReadyToGiveBirth(matron));

        // Grab a reference to the sire in storage.
        uint256 sireId = matron.siringWithId;
        Snake storage sire = snakes[sireId];

        // Determine the higher generation number of the two parents
        uint16 parentGen = matron.generation;
        if (sire.generation > matron.generation) {
            parentGen = sire.generation;
        }

        // Call the sooper-sekret, sooper-expensive, gene mixing operation.
        uint256 childGenes = geneScience.mixGenes(matron.genes, sire.genes);

        // Make the new snake!
        address owner = snakeIndexToOwner[_matronId];
        uint256 snakeId = _createSnake(_matronId, matron.siringWithId, parentGen + 1, childGenes, owner);

        // Clear the reference to sire from the matron (REQUIRED! Having siringWithId
        // set is what marks a matron as being pregnant.)
        delete matron.siringWithId;

        // return the new snake's ID
        return snakeId;
    }
}
