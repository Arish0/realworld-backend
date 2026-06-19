import { test } from '../../fixtures/lenderFixture';

test.describe('Lending', () => {
  test.skip('lends on a loan request', async ({ lendingService }) => {
    await lendingService.lend('1000');
  });
});

