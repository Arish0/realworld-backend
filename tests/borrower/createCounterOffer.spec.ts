import { test } from '../../fixtures/borrowerFixture';

test.describe('Borrower counter offer', () => {
  test.skip('creates a counter offer', async ({ borrowerCounterOfferService }) => {
    await borrowerCounterOfferService.createCounterOffer('900');
  });
});

