// Activate verbose mode by setting env var `export DEBUG=ck`
const debug = require("debug")("ck");
const BigNumber = require("bignumber.js");

const ETH_STRING = web3.toWei(1, "ether");
const FINNEY_STRING = web3.toWei(1, "finney");
const ETH_BN = new BigNumber(ETH_STRING);
const FINNEY_BN = new BigNumber(FINNEY_STRING);
const NULL_ADDRESS = "0x0000000000000000000000000000000000000000";

const util = require("./util.js");
// add test wrapper to make tests possible
const Random = artifacts.require('./Random.sol');
const SnakeCore = artifacts.require("./SnakeCoreTest.sol");
// A dummy implementation
const GeneScienceMock = artifacts.require(
  "./test/contracts/GeneScienceMock.sol"
);
const SaleClockAuction = artifacts.require("./SaleClockAuction.sol");
const SiringClockAuction = artifacts.require("./SiringClockAuction.sol");

contract("SnakeCore", function(accounts) {
  // This only runs once across all test suites
  before(() => util.measureGas(accounts));
  after(() => util.measureGas(accounts));
  if (util.isNotFocusTest("core")) return;
  const eq = assert.equal.bind(assert);
  const coo = accounts[0];
  const user1 = accounts[1];
  const user2 = accounts[2];
  const user3 = accounts[3];
  const ceo = accounts[4];
  const cfo = accounts[5];
  const gasPrice = 1e11;
  let coreC;
  let geneScienceContract;
  const logEvents = [];
  const pastEvents = [];
  // timers we get from Snake contract
  let cooldowns, autoBirthPrice;

  async function deployContract() {
    debug("deploying contract");

    const rand = await Random.new();

    coreC = await SnakeCore.new();
    await coreC.setRandom(rand.address);
    // the deployer is the original CEO and can appoint a new one
    await coreC.setCEO(ceo);
    // only need to create external contracts once
    if (geneScienceContract === undefined) {
      geneScienceContract = await GeneScienceMock.new();
    }
    await coreC.setGeneScienceAddress(geneScienceContract.address, {
      from: ceo
    });
    // initialize some mock auction contracts
    const siringAuctionContract = await SiringClockAuction.new(
      coreC.address,
      100
    );
    await coreC.setSiringAuctionAddress(siringAuctionContract.address, {
      from: ceo
    });
    const saleAuctionContract = await SaleClockAuction.new(coreC.address, 100);
    await coreC.setSaleAuctionAddress(saleAuctionContract.address, {
      from: ceo
    });
    if (!cooldowns) {
      cooldowns = [];
      for (var i = 0; i <= 13; i++) {
        cooldowns[i] = (await coreC.cooldowns.call(i)).toNumber();
      }
      debug("cooldowns", cooldowns);
    }
    if (!autoBirthPrice) {
      autoBirthPrice = await coreC.autoBirthFee();
    }
    await coreC.unpause({ from: ceo });
    const eventsWatch = coreC.allEvents();
    eventsWatch.watch((err, res) => {
      if (err) return;
      pastEvents.push(res);
      debug(">>", res.event, res.args);
    });
    logEvents.push(eventsWatch);
    coreC._getSnakeHelper = async function(id) {
      let attrs = await this.getSnake(id);
      return {
        isGestating: attrs[0],
        isReady: attrs[1],
        cooldownIndex: attrs[2].toNumber(),
        nextActionAt: attrs[3].toNumber(),
        siringWithId: attrs[4].toNumber(),
        birthTime: attrs[5].toNumber(),
        matronId: attrs[6].toNumber(),
        sireId: attrs[7].toNumber(),
        generation: attrs[8].toNumber(),
        genes: attrs[9]
      };
    };
  }

  after(function() {
    logEvents.forEach(ev => ev.stopWatching());
  });

  describe("Initial state", function() {
    before(deployContract);

    it("should own contract", async function() {
      const cooAddress = await coreC.cooAddress();
      eq(cooAddress, coo);

      const nSnakes = await coreC.totalSupply();
      eq(nSnakes.toNumber(), 0);
    });
  });

  describe("Snake creation:", function() {
    before(deployContract);

    it("create a promotional snakes", async function() {
      // snakes with arbitrary genes
      await coreC.createPromoSnake(1000, NULL_ADDRESS, { from: coo });
      await coreC.createPromoSnake(2000, "", { from: coo });
      await coreC.createPromoSnake(3000, "0x0", { from: coo });
      await coreC.createPromoSnake(4000, user2, { from: coo });
      // only coo
      await util.expectThrow(
        coreC.createPromoSnake(5000, user1, { from: user1 })
      );

      const nSnakes = await coreC.totalSupply();
      // 4 created
      eq(nSnakes.toNumber(), 4);

      eq(coo, await coreC.snakeIndexToOwner(1), "snake 1");
      eq(coo, await coreC.snakeIndexToOwner(2), "snake 2");
      eq(coo, await coreC.snakeIndexToOwner(3), "snake 3");
      eq(user2, await coreC.snakeIndexToOwner(4), "snake 4");
    });
  });

  describe("NonFungible, EIP-721", function() {
    let snakeA, snakeB, snakeC, snakeD;
    before(deployContract);

    it("create a few snakes", async function() {
      // breed 4 snakes
      await coreC.mintSnakes(10, 10);
      snakeA = 1;
      snakeB = 2;
      snakeC = 3;
      snakeD = 4;
      eq((await coreC.totalSupply()).toNumber(), 10);
    });

    it("approve + transferFrom + ownerOf", async function() {
      await coreC.approve(user1, snakeC);
      eq(await coreC.ownerOf(snakeC), coo);
      await coreC.transferFrom(coo, user1, snakeC, { from: user1 });
      eq(await coreC.ownerOf(snakeC), user1);
    });

    it("balanceOf", async function() {
      eq(await coreC.balanceOf(coo), 9);
      eq(await coreC.balanceOf(user1), 1);
      eq(await coreC.balanceOf(user2), 0);
    });

    it("tokensOfOwnerByIndex", async function() {
      eq(await coreC.tokensOfOwnerByIndex(coo, 0), snakeA);
      eq(await coreC.tokensOfOwnerByIndex(coo, 1), snakeB);
      eq(await coreC.tokensOfOwnerByIndex(coo, 2), snakeD);
      await util.expectThrow(coreC.tokensOfOwnerByIndex(coo, 10));
      eq(await coreC.tokensOfOwnerByIndex(user1, 0), snakeC);
      await util.expectThrow(coreC.tokensOfOwnerByIndex(user1, 1));
    });

    it.skip("tokenMetadata", async function() {
      debug(await coreC.website());
      eq(
        await coreC.tokenMetadata(snakeA),
        "https://www.cryptosnakes.co/snake/1"
      );
      eq(
        await coreC.tokenMetadata(10),
        "https://www.cryptosnakes.co/snake/10"
      );
      await util.expectThrow(coreC.tokenMetadata(11));
    });
  });

  describe("Siring", function() {
    let snakeA, snakeB, snakeC, snakeD, snakeE;
    before(deployContract);
    it("create a few snakes", async function() {
      // breed 4 snakes
      await coreC.mintSnakes(10, 4, { from: coo });
      snakeA = 1;
      snakeB = 2;
      snakeC = 3;
      snakeD = 4;
      // give snakeD to user1
      await coreC.transfer(user1, snakeD);
      eq(await coreC.snakeIndexToOwner(snakeD), user1);
    });

    it("snake cant sire itself", async function() {
      await util.expectThrow(coreC.breedWith(snakeA, snakeA));
    });

    it("siring is only allowed with due permissions", async function() {
      await util.expectThrow(coreC.breedWith(snakeD, snakeA), { from: user1 });
      let now = (await coreC.timeNow()).toNumber();
      let snakeAStats = await coreC._getSnakeHelper(snakeA);
      debug("A before breeding:", snakeAStats, now);
      assert(snakeAStats.nextActionAt <= now);
      eq(snakeAStats.isReady, true);

      // owner of snakeA approves it to sire D
      await coreC.approveSiring(user1, snakeA);
      await coreC.breedWith(snakeD, snakeA, { from: user1 });

      // check snakeA stats afterwards
      now = (await coreC.timeNow()).toNumber();
      snakeAStats = await coreC._getSnakeHelper(snakeA);
      debug("snakeA after breeding:", snakeAStats);
      eq(snakeAStats.cooldownIndex, 1);
      assert(snakeAStats.nextActionAt > now);
      eq(snakeAStats.isReady, false);

      // check snakeD
      const snakeDStats = await coreC._getSnakeHelper(snakeD);
      debug("D:", snakeDStats);
      eq(snakeDStats.cooldownIndex, 1);
    });

    it("pregnant snake cant sire", async function() {
      await coreC.approveSiring(coo, snakeD, { from: user1 });
      await util.expectThrow(coreC.breedWith(snakeB, snakeD));
    });

    it("sire has cooldown after siring", async function() {
      await util.expectThrow(coreC.breedWith(snakeB, snakeA));
      await util.expectThrow(coreC.breedWith(snakeA, snakeB));
    });

    it("allowed user cant re-use the same sire permission", async function() {
      await util.forwardEVMTime(cooldowns[0]);

      // Can't re-use the same sire permission again
      await util.expectThrow(coreC.breedWith(snakeD, snakeA, { from: user1 }));

      // B from A works because they share the same owner
      await coreC.breedWith(snakeB, snakeA);
    });
  });

  describe("Snake Breeding:", function() {
    let snakeA, snakeB, snakeC, snakeD, snakeE, snakeF;
    before(deployContract);

    it("create some snakes", async function() {
      // breed 3 genetically diff snakes
      await coreC.mintSnakes(10, 1, { from: coo });
      snakeA = 1;
      await coreC.mintSnakes(100, 1, { from: coo });
      snakeB = 2;
      await coreC.mintSnakes(1000, 1, { from: coo });
      snakeC = 3;
    });

    it("snakeA gets pregnant from snakeB", async function() {
      // works because they have the same owner
      await coreC.breedWith(snakeA, snakeB);

      const attr = await coreC._getSnakeHelper(snakeA);
      eq(attr.isGestating, true);
      assert(attr.nextActionAt != 0);
    });

    it("tries and fails to get snakeA pregnant again", async function() {
      await util.expectThrow(coreC.breedWith(snakeA, snakeC));
    });

    it("wait snakeA be ready to give birth", async function() {
      await util.expectThrow(coreC.giveBirth(snakeA));
      await util.forwardEVMTime(cooldowns[0]);
    });

    it("have snakeA give birth to snakeD", async function() {
      await coreC.giveBirth(snakeA);
      // will be the last snake
      snakeD = (await coreC.totalSupply()).toNumber();
      let attr = await coreC._getSnakeHelper(snakeD);
      debug("snakeD was born:", attr);
      eq(attr.isGestating, false);
      eq(attr.cooldownIndex, 0);
      eq(attr.nextActionAt, 0);
      eq(attr.siringWithId, 0);
      eq(attr.matronId, 1);
      eq(attr.sireId, 2);
      eq(attr.generation, 1);
      // equation: mom's 10 + sire's 100 / 2 + 1
      eq(attr.genes.toNumber(), 56);
      const snakeDOwner = await coreC.snakeIndexToOwner(snakeD);
      eq(snakeDOwner, coo);
    });

    it("snakeD can breed right after being born", async function() {
      debug("snakeD::", await coreC._getSnakeHelper(snakeD));
      snakeDcanBreed = await coreC.isReadyToBreed(snakeD);
      eq(snakeDcanBreed, true);
    });

    it("snakeD can't breed with either parent, but can breed with snakeC, who is unrelated", async function() {
      await util.expectThrow(coreC.breedWith(snakeD, snakeA));
      await util.expectThrow(coreC.breedWith(snakeD, snakeB));
      await util.expectThrow(coreC.breedWith(snakeA, snakeD));
      await util.expectThrow(coreC.breedWith(snakeB, snakeD));
      await coreC.breedWith(snakeD, snakeC);

      const attr = await coreC._getSnakeHelper(snakeD);
      eq(attr.isGestating, true);
      assert(attr.nextActionAt != 0);
    });

    it("test that siblings cant breed", async function() {
      await util.forwardEVMTime(cooldowns[0]);
      await coreC.giveBirth(snakeD);
      // snakeF is children of D with C (we are not testing it)
      const snakeE = snakeD + 1;
      // A & B have another child
      await coreC.breedWith(snakeB, snakeA);
      await util.forwardEVMTime(cooldowns[1]);
      await coreC.giveBirth(snakeB);
      // snakeE is children of B & A (just like D)
      snakeF = snakeE + 1;
      // test the sibling thing
      const canFdoD = await coreC.canBreedWith(snakeF, snakeD);
      eq(canFdoD, false);
      canDdoF = await coreC.canBreedWith(snakeD, snakeF);
      eq(canDdoF, false);
      await util.expectThrow(coreC.breedWith(snakeF, snakeD));
      await util.expectThrow(coreC.breedWith(snakeD, snakeF));
      // just make sure new snake can do fine with new
    });

    it("test breedWithAuto still retains the same requirements", async function() {
      await util.forwardEVMTime(cooldowns[1]);

      await util.expectThrow(coreC.breedWith(snakeF, snakeD));
      await util.expectThrow(coreC.breedWith(snakeD, snakeF));
    });

    it("make breedWithAuto happen and check event", async function() {
      // too low fee
      await util.expectThrow(coreC.breedWithAuto(snakeB, snakeA), {
        value: autoBirthPrice.sub(10)
      });

      await coreC.breedWithAuto(snakeB, snakeA, { value: autoBirthPrice });
      await util.sleep(500);

      // event order is not certain, might be any of the last 2
      let ev = pastEvents.pop();
      if (ev.event !== "AutoBirth") {
        ev = pastEvents.pop();
      }
      debug("last event ", ev);
      eq(ev.event, "AutoBirth");
      eq(ev.args.matronId.toNumber(), snakeB);
      debug(
        ev.args.time,
        cooldowns[2],
        (await coreC.timeNow()).add(cooldowns[2])
      );
      eq(
        ev.args.cooldownEndTime.toString(),
        (await coreC.timeNow()).add(cooldowns[2]).toString()
      );
    });

    it("test that anyone can give birth to a snake", async function() {
      await util.forwardEVMTime(cooldowns[2]);
      await coreC.giveBirth(snakeB, { from: user3 });
    });
  });

  describe("Cooldowns progression", function() {
    let snakeA, snakeB;
    before(deployContract);

    it("create some snakes", async function() {
      // breed 2 genetically diff snakes
      await coreC.mintSnakes(32, 2, { from: coo });
      snakeA = 1;
      snakeB = 2;
    });

    it("Let them breed and give birth", async function() {
      await coreC.breedWith(snakeA, snakeB);
      await util.expectThrow(coreC.giveBirth(snakeA));
      await util.forwardEVMTime(cooldowns[0]);
      await coreC.giveBirth(snakeA);
    });

    it("SnakeA can breed again right away", async function() {
      await coreC.breedWith(snakeA, snakeB);
      // just advancing the first CD is not enough
      await util.forwardEVMTime(cooldowns[0]);
      await util.expectThrow(coreC.giveBirth(snakeA));
      await util.forwardEVMTime(cooldowns[1]);
      await coreC.giveBirth(snakeA);
    });

    it("SnakeB now will be the one pregnant", async function() {
      await coreC.breedWith(snakeB, snakeA);
      // just advancing the first CD is not enough
      await util.forwardEVMTime(cooldowns[1]);
      await util.expectThrow(coreC.giveBirth(snakeB));
      await util.forwardEVMTime(cooldowns[2]);
      await coreC.giveBirth(snakeB);
    });

    it("After reaching the limit it stops at max cooldown", async function() {
      await util.forwardEVMTime(cooldowns[3]);
      // go over the whole cooldown table
      for (var i = 4; i <= cooldowns.length + 1; i++) {
        let cooldownPosition = i;
        if (cooldownPosition > cooldowns.length - 1)
          cooldownPosition = cooldowns.length - 1;
        debug("i:", i, cooldownPosition, cooldowns[cooldownPosition]);
        await coreC.breedWith(snakeB, snakeA);
        await util.forwardEVMTime(cooldowns[cooldownPosition]);
        await coreC.giveBirth(snakeB);
      }
    });
  });

  describe("Roles: CEO + CFO", async function() {
    it("COO try to appoint another COO, but cant", async function() {
      // that is the case because we override OZ ownable function
      await util.expectThrow(coreC.setCOO(user2));
    });
    it("CEO can appoint a CFO", async function() {
      await util.expectThrow(coreC.setCFO(cfo));
      await coreC.setCFO(cfo, { from: ceo });
    });
    it("CEO can appoint another coo", async function() {
      await coreC.setCOO(user1, { from: ceo });
    });
    it("new coo can do things, old coo cant anymore", async function() {
      await util.expectThrow(coreC.mintSnakes(10, 1, { from: coo }));
      await coreC.mintSnakes(10, 1, { from: user1 });
    });
    it("CEO can appoint another CEO", async function() {
      await util.expectThrow(coreC.setCEO(user2, { from: coo }));
      await coreC.setCEO(user2, { from: ceo });
    });
    it("old CEO cant do anything since they were replaced", async function() {
      await util.expectThrow(coreC.setCEO(user3, { from: ceo }));
      await coreC.setCEO(ceo, { from: user2 });
    });
    it("CFO can drain funds", async function() {
      await coreC.fundMe({ value: web3.toWei(0.05, "ether") });
      const ctoBalance1 = web3.eth.getBalance(cfo);
      debug("cfo balance was", ctoBalance1);
      await coreC.withdrawBalance({ from: cfo });
      const ctoBalance2 = web3.eth.getBalance(cfo);
      debug("cfo balance is ", ctoBalance2);
      assert(ctoBalance2.gt(ctoBalance1));
    });
  });

  describe("Contract Upgrade", function() {
    before(async function redeployContract() {
      await deployContract();
      await coreC.mintSnakes(1000, 4, { from: coo });
      await coreC.mintSnakes(9000, 2, { from: coo });
      const nSnakes = await coreC.totalSupply();
      eq(nSnakes.toNumber(), 6);
      await coreC.transfer(user1, 5);
      // have snake 1 pregnant of snake 2
      await util.forwardEVMTime(cooldowns[0]);
      await coreC.breedWith(1, 2);
    });

    it("user2 fails to pause contract - not coo", async function() {
      await util.expectThrow(coreC.pause({ from: user2 }));
    });

    it("coo can pause the contract", async function() {
      await coreC.pause({ from: coo });
      const isPaused = await coreC.paused();
      eq(isPaused, true);
    });

    it("functions that alter state can't execute while paused", async function() {
      await util.expectThrow(coreC.transfer(user2, 6));
      await util.expectThrow(coreC.transfer(coo, 3, { from: user1 }));
      await util.expectThrow(coreC.breedWith(1, 2));
    });

    it("can read state of all snakes while paused", async function() {
      const nSnakes = await coreC.totalSupply();
      eq(nSnakes.toNumber(), 6);
      let attr = await coreC._getSnakeHelper(1);
      eq(attr.isGestating, true);
      eq(attr.cooldownIndex, 1);
      assert(attr.nextActionAt > 0);
      eq(attr.siringWithId, 2);
      eq(attr.matronId, 0);
      eq(attr.sireId, 0);
      eq(attr.generation, 0);
      eq(attr.genes.toNumber(), 1000);
    });

    it("unpause", async function() {
      await coreC.unpause({ from: ceo });
      const isPaused = await coreC.paused();
      eq(isPaused, false);
    });

    it("snake 1 give birth", async function() {
      await util.forwardEVMTime(cooldowns[0]);
      await coreC.giveBirth(1);
      const nSnakes = await coreC.totalSupply();
      eq(nSnakes.toNumber(), 7);
    });

    it("set new contract address", async function() {
      const coreC2 = await SnakeCore.new();
      await util.expectThrow(coreC.setNewAddress(coreC2.address));
      await coreC.pause({ from: ceo });
      // CEO can appoint a new COO even while paused
      await coreC.setCOO(ceo, { from: ceo });
      await coreC.setNewAddress(coreC2.address, { from: ceo });
      const newAddress = await coreC.newContractAddress();
      debug("new contract address is ", newAddress);
      eq(newAddress, coreC2.address);
      // cannot unpause if new contract address is set
      await util.expectThrow(coreC.unpause({ from: ceo }));
    });
  });

  describe("sub contracts", function() {
    before(deployContract);

    it("can't assign an address that isnt Breeding to breeding", async function() {
      await util.expectThrow(coreC.setGeneScienceAddress(NULL_ADDRESS));
    });

    it("can't assign an address that isnt Breeding to breeding 2", async function() {
      await util.expectThrow(coreC.setGeneScienceAddress(user2));
    });

    it("can't assign an address that isnt Breeding to breeding 3", async function() {
      await util.expectThrow(coreC.setGeneScienceAddress(coreC.address));
    });

    it("can set a valid breeding contract", async function() {
      await coreC.mintSnakes(777, 8);
      // forward time by 1 minute
      await util.forwardEVMTime(cooldowns[0]);

      geneScienceContract = await GeneScienceMock.new();
      await coreC.setGeneScienceAddress(geneScienceContract.address, {
        from: ceo
      });
    });

    it("everything still works with new breeding contract", async function() {
      await coreC.mintSnakes(9999, 2, { from: coo });
      await coreC.breedWith(1, 2);
      const snakeA = await coreC._getSnakeHelper(1);
      eq(snakeA.isGestating, true);
      eq(snakeA.cooldownIndex, 1);
    });
  });

  describe("Rescue lost snakes", function() {
    const snakeId1 = 1,
      snakeId2 = 2;
    before(async function() {
      await deployContract();
      await coreC.mintSnakes(999, 2, { from: coo });
      await coreC.transfer(coreC.address, snakeId1, { from: coo });
    });

    it("should fail to rescue snakes that aren't owned by the contract", async function() {
      await util.expectThrow(
        coreC.rescueLostSnake(snakeId2, user1, { from: coo })
      );
    });
    it("should fail to rescue snakes if not coo", async function() {
      await util.expectThrow(
        coreC.rescueLostSnake(snakeId1, user1, { from: user1 })
      );
    });
    it("should be able to rescue snakes that are owned by the contract", async function() {
      await coreC.rescueLostSnake(snakeId1, user1, { from: coo });
      const snake1Owner = await coreC.snakeIndexToOwner(snakeId1);
      eq(snake1Owner, user1);
    });
  });

  describe("Auction wrapper", function() {
    let saleAuction, siringAuction;
    const snakeId1 = 1,
      snakeId2 = 2,
      snakeId3 = 3;

    before(async function() {
      await deployContract();
      saleAuction = await SaleClockAuction.new(coreC.address, 0);
      siringAuction = await SiringClockAuction.new(coreC.address, 0);
      await coreC.mintSnakes(999, 3, { from: coo });
      await coreC.transfer(user1, snakeId2, { from: coo });
      await coreC.transfer(user1, snakeId3, { from: coo });
    });

    it("non-CEO should fail to set auction addresses", async function() {
      await util.expectThrow(
        coreC.setSaleAuctionAddress(saleAuction.address, { from: user1 })
      );
      await util.expectThrow(
        coreC.setSiringAuctionAddress(siringAuction.address, { from: user1 })
      );
    });
    it("CEO should be able to set auction addresses", async function() {
      await coreC.setSaleAuctionAddress(saleAuction.address, { from: ceo });
      await coreC.setSiringAuctionAddress(siringAuction.address, {
        from: ceo
      });
    });
    it("should fail to create sale auction if not cat owner", async function() {
      await util.expectThrow(
        coreC.createSaleAuction(snakeId1, 100, 200, 60, { from: user1 })
      );
    });
    it("should be able to create sale auction", async function() {
      await coreC.createSaleAuction(snakeId1, 100, 200, 60, { from: coo });
      const snake1Owner = await coreC.ownerOf(snakeId1);
      eq(snake1Owner, saleAuction.address);
    });
    it("should fail to breed if sire is on sale auction", async function() {
      await util.expectThrow(
        coreC.breedWith(snakeId2, snakeId1, { from: user1 })
      );
    });
    it("should be able to bid on sale auction", async function() {
      const cooBal1 = await web3.eth.getBalance(coo);
      await saleAuction.bid(snakeId1, { from: user1, value: 200 });
      const cooBal2 = await web3.eth.getBalance(coo);
      const snake1Owner = await coreC.ownerOf(snakeId1);
      eq(snake1Owner, user1);
      assert(cooBal2.gt(cooBal1));
      // Transfer the snake back to coo for the rest of the tests
      await coreC.transfer(coo, snakeId1, { from: user1 });
    });
    it("should fail to create siring auction if not cat owner", async function() {
      await util.expectThrow(
        coreC.createSiringAuction(snakeId1, 100, 200, 60, { from: user1 })
      );
    });
    it("should be able to create siring auction", async function() {
      await coreC.createSiringAuction(snakeId1, 100, 200, 60, { from: coo });
      const snake1Owner = await coreC.ownerOf(snakeId1);
      eq(snake1Owner, siringAuction.address);
    });
    it("should fail to breed if sire is on siring auction", async function() {
      await util.expectThrow(
        coreC.breedWith(snakeId2, snakeId1, { from: user1 })
      );
    });
    it("should fail to bid on siring auction if matron is in cooldown", async function() {
      // Breed, putting snake 2 into cooldown
      await coreC.breedWith(snakeId3, snakeId2, { from: user1 });
      await util.expectThrow(
        coreC.bidOnSiringAuction(snakeId1, snakeId2, {
          from: user1,
          value: 200
        })
      );
      // Forward time so cooldowns end before next test
      await util.forwardEVMTime(60 * 60);
    });
    it("should be able to bid on siring auction", async function() {
      const cooBal1 = await web3.eth.getBalance(coo);
      await coreC.bidOnSiringAuction(snakeId1, snakeId2, {
        from: user1,
        value: 200
      });
      const cooBal2 = await web3.eth.getBalance(coo);
      const snake1Owner = await coreC.ownerOf(snakeId1);
      const snake2Owner = await coreC.ownerOf(snakeId2);
      eq(snake1Owner, coo);
      eq(snake2Owner, user1);
      assert(cooBal2.gt(cooBal1));
      // Forward time so cooldowns end before next test
      await util.forwardEVMTime(60 * 60);
      await coreC.giveBirth(snakeId2, { from: user1 });
    });
    it("should be able to cancel a sale auction", async function() {
      await coreC.createSaleAuction(snakeId1, 100, 200, 60, { from: coo });
      await saleAuction.cancelAuction(snakeId1, { from: coo });
      const snake1Owner = await coreC.ownerOf(snakeId1);
      eq(snake1Owner, coo);
    });
    it("should be able to cancel a siring auction", async function() {
      await coreC.createSiringAuction(snakeId1, 100, 200, 60, { from: coo });
      await siringAuction.cancelAuction(snakeId1, { from: coo });
      const snake1Owner = await coreC.ownerOf(snakeId1);
      eq(snake1Owner, coo);
    });
    it("should be able to bid on siring auction with autobirth", function(
      done
    ) {
      const events = coreC.AutoBirth();
      coreC.autoBirthFee().then(autoBirthFee => {
        coreC
          .createSiringAuction(snakeId1, 100, 200, 60, { from: coo })
          .then(() => {
            coreC
              .bidOnSiringAuction(snakeId1, snakeId2, {
                from: user1,
                value: autoBirthFee.add(200)
              })
              .then(() => {
                events.get((err, res) => {
                  assert(!err);
                  eq(res[0].event, "AutoBirth");
                  assert(res[0].args.matronId.eq(snakeId2));
                  done();
                });
              });
          });
      });
    });
  });

  describe("Gen0 Auction", function() {
    let saleAuction, siringAuction;
    const snakeId1 = 1,
      snakeId2 = 2;
    const startingPrice = FINNEY_BN.mul(10);

    before(async function() {
      await deployContract();
      saleAuction = await SaleClockAuction.new(coreC.address, 0);
      siringAuction = await SiringClockAuction.new(coreC.address, 0);
      await coreC.setSaleAuctionAddress(saleAuction.address, { from: ceo });
      await coreC.setSiringAuctionAddress(siringAuction.address, {
        from: ceo
      });
    });

    it("should fail to create gen0 auction if not coo", async function() {
      await util.expectThrow(coreC.createGen0Auction(1, { from: user1 }));
    });
    it("should start aveSalePrice at 0", async function() {
      const avePrice = await saleAuction.averageGen0SalePrice();
      assert(avePrice.eq(0));
    });
    it("should be able to create gen0 auction", async function() {
      await coreC.createGen0Auction(1, { from: coo });
      const auction = await saleAuction.getAuction(snakeId1);
      eq(auction[0], coreC.address);
      assert(auction[1].eq(startingPrice));
      assert(auction[2].eq(0));
      const gen0CreatedCount = await coreC.gen0CreatedCount();
      eq(gen0CreatedCount, 1);
    });
    it("avePrice should be unchanged (no sale yet)", async function() {
      const avePrice = await saleAuction.averageGen0SalePrice();
      assert(avePrice.eq(0));
      const auction = await saleAuction.getAuction(snakeId1);
    });
    it("should be able to bid on gen0 auction", async function() {
      await saleAuction.bid(snakeId1, { from: user1, value: startingPrice });
      const snake1Owner = await coreC.ownerOf(snakeId1);
      eq(snake1Owner, user1);
    });
    it("avePrice should be about 1/5 starting price after first sale", async function() {
      const avePrice = await saleAuction.averageGen0SalePrice();
      assert(avePrice.gt(0));
      assert(avePrice.lt(startingPrice.div(4)));
    });
    it("avePrice should not be influenced by regular auctions", async function() {
      const avePrice1 = await saleAuction.averageGen0SalePrice();
      await coreC.createSaleAuction(
        snakeId1,
        FINNEY_BN.mul(50),
        FINNEY_BN.mul(50),
        10000,
        { from: user1 }
      );
      await saleAuction.bid(snakeId1, {
        from: user2,
        value: FINNEY_BN.mul(50)
      });
      const avePrice2 = await saleAuction.averageGen0SalePrice();
      assert(avePrice1.eq(avePrice2));
    });
    it("next 3 gen0 auctions should be startingPrice", async function() {
      // Create snakes 2-4, all these auctions should have
      // starting price of 10 finney because avePrice*1.5 is
      // still less than starting price
      // (3/5)(3/2)p = (9/10)p < p
      for (let id = 2; id < 5; id++) {
        await coreC.createGen0AuctionRandom({ from: coo });
        const auction = await saleAuction.getAuction(id);
        assert(auction[1].eq(FINNEY_BN.mul(10)));
        await saleAuction.bid(id, { from: user1, value: FINNEY_BN.mul(10) });
        const avePrice = await saleAuction.averageGen0SalePrice();
      }
    });
    it("gen0 auctions should compute price based on previous sales", async function() {
      // The 5th should have starting price of > startingPrice
      // (4/5)(3/2)p = (12/10)p > p
      await coreC.createGen0Auction(1, { from: coo });
      const auction = await saleAuction.getAuction(5);
      assert(auction[1].gt(startingPrice));
    });
  });

  describe("auction withdrawals", function() {
    beforeEach(async function() {
      await deployContract();
      saleAuction = await SaleClockAuction.new(coreC.address, 1000);
      siringAuction = await SiringClockAuction.new(coreC.address, 1000);
      await coreC.setSaleAuctionAddress(saleAuction.address, { from: ceo });
      await coreC.setSiringAuctionAddress(siringAuction.address, {
        from: ceo
      });
      await coreC.setCFO(cfo, { from: ceo });
      // Get some Ether into both sale and siring auctions
      await coreC.mintSnakes(1, 2, { from: coo });
      await coreC.createSaleAuction(1, 100000, 200000, 100, { from: coo });
      await saleAuction.bid(1, { from: user1, value: 200000 });
      await coreC.createSiringAuction(1, 100000, 200000, 100, { from: user1 });
      await coreC.bidOnSiringAuction(1, 2, { from: coo, value: 200000 });
    });

    it("should fail to withdraw as non-coo", async function() {
      util.expectThrow(saleAuction.withdrawBalance({ from: user1 }));
      util.expectThrow(siringAuction.withdrawBalance({ from: user1 }));
    });
    it("should be able to withdraw as coo", async function() {
      const saleBal1 = web3.eth.getBalance(saleAuction.address);
      const sireBal1 = web3.eth.getBalance(siringAuction.address);
      const coreBal1 = web3.eth.getBalance(coreC.address);
      await saleAuction.withdrawBalance({ from: coo });
      await siringAuction.withdrawBalance({ from: coo });
      const saleBal2 = web3.eth.getBalance(saleAuction.address);
      const sireBal2 = web3.eth.getBalance(siringAuction.address);
      const coreBal2 = web3.eth.getBalance(coreC.address);
      assert(
        coreBal1
          .add(saleBal1)
          .add(sireBal1)
          .eq(coreBal2)
      );
      assert(saleBal2.eq(0));
      assert(sireBal2.eq(0));
    });
    it("should fail to withdraw via core as non-COO", async function() {
      util.expectThrow(coreC.withdrawAuctionBalances({ from: cfo }));
    });
    it("should be able to withdraw via core as COO", async function() {
      const saleBal1 = web3.eth.getBalance(saleAuction.address);
      const sireBal1 = web3.eth.getBalance(siringAuction.address);
      const coreBal1 = web3.eth.getBalance(coreC.address);
      await coreC.withdrawAuctionBalances({ from: coo });
      const saleBal2 = web3.eth.getBalance(saleAuction.address);
      const sireBal2 = web3.eth.getBalance(siringAuction.address);
      const coreBal2 = web3.eth.getBalance(coreC.address);
      assert(
        coreBal1
          .add(saleBal1)
          .add(sireBal1)
          .eq(coreBal2)
      );
      assert(saleBal2.eq(0));
      assert(sireBal2.eq(0));
    });
  });
});
