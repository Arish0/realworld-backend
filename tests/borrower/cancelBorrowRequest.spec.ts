import { test, expect } from '../../fixtures/testFixture';
import { BorrowRequestPage } from '../../pages/borrower/BorrowRequestPage';
import { loginAndOpenWallet } from '../../services/borrower/BorrowerWorkflowService';

test.describe('Cancel borrow request', () => {
  test.setTimeout(180000);

  test('cancels the first existing wallet loan request', async ({ loginPage, walletPage, page }) => {
    await loginAndOpenWallet(loginPage, walletPage, page);

    await walletPage.openNftCard(0);
    await expect(page.getByText('Collateral', { exact: true })).toBeVisible();

    const borrowRequestPage = new BorrowRequestPage(page);
    await borrowRequestPage.cancelLoanRequest();
    await borrowRequestPage.waitForLoanCancelledSuccess();
    await borrowRequestPage.closeLoanCancelledSuccess();

    await expect(page).toHaveURL(/\/my-wallet/, { timeout: 30000 });
  });
});
