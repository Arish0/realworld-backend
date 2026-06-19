import { expect, test } from '../../fixtures/testFixture';
import { borrowerData } from '../../config/testData/borrowerData';
import { lenderEmail, lenderPassword } from '../../config/testData/lenderData';
import { LoginPage } from '../../pages/common/LoginPage';
import { BorrowService } from '../../services/borrower/BorrowService';
import { loginAndOpenWallet } from '../../services/borrower/BorrowerWorkflowService';
import { LendingService } from '../../services/lender/LendingService';

test.describe('Borrow lend flow', () => {
  test.setTimeout(360000);

  test('borrower requests a loan and lender accepts it from lend opportunities', async ({
    browser,
    loginPage,
    walletPage,
    page,
  }) => {
    const defaultScenario =
      borrowerData.loanRequestScenarios.find((item) => item.submitDefaultValues) ?? borrowerData.loanRequestScenarios[0];

    await loginAndOpenWallet(loginPage, walletPage, page);

    const borrowService = new BorrowService(page);
    await walletPage.openAvailableAssets();
    await expect
      .poll(() => walletPage.borrowableNftCount(), {
        message: 'Brooklyn must have at least one available NFT before lender can accept a new loan request',
      })
      .toBeGreaterThan(0);
    await borrowService.requestDefaultLoanFromWallet(walletPage, defaultScenario.assetIndex);

    const lenderContext = await browser.newContext();
    try {
      const lenderPage = await lenderContext.newPage();
      const lenderLoginPage = new LoginPage(lenderPage);

      await lenderLoginPage.open();
      await lenderLoginPage.login(lenderEmail(), lenderPassword());
      await expect(lenderPage).toHaveURL(/\/(dashboard|my-wallet|lend)/, { timeout: 30000 });

      const lendingService = new LendingService(lenderPage);
      await lendingService.acceptFirstLoanOpportunity();
    } finally {
      await lenderContext.close();
    }
  });
});
