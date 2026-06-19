import { test } from '../../fixtures/testFixture';
import { borrowerData } from '../../config/testData/borrowerData';
import { RefinanceRequestPage } from '../../pages/borrower/RefinanceRequestPage';
import { loginAndOpenWallet } from '../../services/borrower/BorrowerWorkflowService';

test.describe('Active collateral loan update', () => {
  test.setTimeout(360000);

  test('updates the same active collateral NFT loan across multiple field scenarios', async ({
    loginPage,
    walletPage,
    page,
  }) => {
    await loginAndOpenWallet(loginPage, walletPage, page);

    const refinancePage = new RefinanceRequestPage(page);
    await refinancePage.openFirstActiveCollateral();

    for (const scenario of borrowerData.activeCollateralUpdateScenarios) {
      await test.step(`Update loan terms: ${scenario.name}`, async () => {
        await refinancePage.updateAndConfirm(scenario);
      });
    }
  });
});
