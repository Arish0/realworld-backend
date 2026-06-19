import { expect, test } from '../../fixtures/testFixture';
import { borrowerData } from '../../config/testData/borrowerData';
import { BorrowService } from '../../services/borrower/BorrowService';
import { expectBorrowableNft, loginAndOpenWallet } from '../../services/borrower/BorrowerWorkflowService';

test.describe('Borrow request lifecycle', () => {
  test.setTimeout(360000);

  test('requests a default loan, cancels it, then requests again with edited fields', async ({
    loginPage,
    walletPage,
    page,
  }) => {
    const defaultScenario =
      borrowerData.loanRequestScenarios.find((item) => item.submitDefaultValues) ?? borrowerData.loanRequestScenarios[0];
    const editedScenario = borrowerData.loanRequestScenarios.find((item) => !item.submitDefaultValues);
    expect(editedScenario, 'Expected a custom loan scenario in borrowerData.json').toBeTruthy();

    await loginAndOpenWallet(loginPage, walletPage, page);

    const borrowService = new BorrowService(page);
    if ((await walletPage.borrowableNftCount()) === 0) {
      await borrowService.cancelFirstWalletLoanRequestIfPresent(walletPage);
      await walletPage.openAvailableAssets();
    }

    await expectBorrowableNft(walletPage);
    const assetName = await borrowService.requestDefaultLoanFromWalletAndReturnAssetName(
      walletPage,
      defaultScenario.assetIndex,
    );

    await borrowService.cancelWalletLoanRequest(walletPage, assetName);
    await borrowService.requestEditedLoanFromWallet(walletPage, assetName, editedScenario!);
  });
});
