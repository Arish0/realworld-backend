import { test } from '../../fixtures/testFixture';
import { borrowerData } from '../../config/testData/borrowerData';
import { BorrowRequestPage } from '../../pages/borrower/BorrowRequestPage';
import { expectBorrowableNft, loginAndOpenWallet } from '../../services/borrower/BorrowerWorkflowService';

test.describe('Borrow request field validation', () => {
  for (const edgeCase of borrowerData.edgeCases) {
    test(`validates ${edgeCase.name}`, async ({ loginPage, walletPage, page }) => {
      await loginAndOpenWallet(loginPage, walletPage, page);
      await expectBorrowableNft(walletPage);
      await walletPage.requestLoanForNft(edgeCase.assetIndex);

      const borrowRequestPage = new BorrowRequestPage(page);
      await borrowRequestPage.waitForLoanForm();
      await borrowRequestPage.applyLoanRequestOptions(edgeCase);
      await borrowRequestPage.expectSubmitEnabled(edgeCase.expectedSubmitEnabled);
    });
  }
});
