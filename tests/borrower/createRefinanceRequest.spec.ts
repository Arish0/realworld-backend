import { test } from '../../fixtures/borrowerFixture';

test.describe('Refinance request', () => {
  test.skip('creates a refinance request', async ({ refinanceService }) => {
    await refinanceService.createRefinanceRequest('800');
  });
});

