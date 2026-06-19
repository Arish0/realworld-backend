import { test, expect } from '../../fixtures/testFixture';
import { borrowerData } from '../../config/testData/borrowerData';
import { BorrowRequestPage } from '../../pages/borrower/BorrowRequestPage';
import { expectBorrowableNft, loginAndOpenWallet } from '../../services/borrower/BorrowerWorkflowService';

test.describe('Update borrow request fields', () => {
  test.setTimeout(120000);

  test('updates loan amount, duration, APR, and advanced options before requesting', async ({
    loginPage,
    walletPage,
    page,
  }) => {
    const scenario = borrowerData.loanRequestScenarios.find((item) => !item.submitDefaultValues);
    expect(scenario, 'Expected a custom loan scenario in borrowerData.json').toBeTruthy();

    await loginAndOpenWallet(loginPage, walletPage, page);
    await expectBorrowableNft(walletPage);
    await walletPage.requestLoanForNft(scenario!.assetIndex);

    const borrowRequestPage = new BorrowRequestPage(page);
    await borrowRequestPage.waitForLoanForm();
    await borrowRequestPage.applyLoanRequestOptions(scenario!);

    await expect(page.locator('#prinicipal')).toHaveValue(scenario!.loanAmount!);
    await expect(page.getByRole('button', { name: /Request loan/i })).toBeEnabled();
  });
});
