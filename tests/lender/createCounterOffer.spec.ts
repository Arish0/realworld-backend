import { test } from '../../fixtures/lenderFixture';

test.describe('Lender counter offer', () => {
  test.skip('creates a counter offer', async ({ lenderCounterOfferService }) => {
    await lenderCounterOfferService.createCounterOffer('950');
  });
});

