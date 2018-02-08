const Random = artifacts.require('./Random.sol');

contract('Random', function() {
  let random;

  before(async () => random = await Random.new());

  describe('Random', () => {
    it('should generate correct random.', async () => {
      const set = new Set();
      let lenSum = 0;

      for (let i = 0; i < 100; i++) {
        await random.gen256();

        const r = (await random.lastRand()).toString(16);
        lenSum += r.length;
        set.add(r);
      }

      assert.equal(set.size, 100);
      assert.equal(true, lenSum > 63 * 100);
    });
  });
});
