const Random = artifacts.require('./Random.sol');
const GeneScience = artifacts.require('./GeneScience.sol');

const SnakeCore = artifacts.require('./SnakeCoreTest.sol');
const SaleClockAuction = artifacts.require('./SaleClockAuction.sol');
const SiringClockAuction = artifacts.require('./SiringClockAuction.sol' );

module.exports = async function(deployer) {
  await deployer.deploy(Random);
  const random = await Random.deployed();

  await deployer.deploy(GeneScience, random.address);
  const genes = await GeneScience.deployed();

  await deployer.deploy(SnakeCore);
  const snakeCore = await SnakeCore.deployed();

  await snakeCore.setRandom(random.address);
  await snakeCore.setGeneScienceAddress(genes.address);

  await deployer.deploy(SaleClockAuction, snakeCore.address, 1);
  const saleClockAuction = await SaleClockAuction.deployed();
  await snakeCore.setSaleAuctionAddress(saleClockAuction.address);

  await deployer.deploy(SiringClockAuction, snakeCore.address, 1);
  const siringClockAuction = await SiringClockAuction.deployed();
  await snakeCore.setSiringAuctionAddress(siringClockAuction.address);
};
