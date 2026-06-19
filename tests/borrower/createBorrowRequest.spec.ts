import { test } from '../../fixtures/testFixture';
import { borrowerData } from '../../config/testData/borrowerData';
import { BorrowService } from '../../services/borrower/BorrowService';
import { expectBorrowableNft, loginAndOpenWallet } from '../../services/borrower/BorrowerWorkflowService';

test.describe('Borrow request', () => {
  test.setTimeout(240000);

  test('creates a loan request for the first available wallet NFT using default values', async ({
    loginPage,
    walletPage,
    page,
  }) => {
    const scenario =
      borrowerData.loanRequestScenarios.find((item) => item.submitDefaultValues) ?? borrowerData.loanRequestScenarios[0];

    await loginAndOpenWallet(loginPage, walletPage, page);
    await expectBorrowableNft(walletPage);

    const borrowService = new BorrowService(page);
    await borrowService.requestDefaultLoanFromWallet(walletPage, scenario.assetIndex);
  });
});
