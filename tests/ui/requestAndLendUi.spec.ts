import { test, expect } from '../../fixtures/testFixture';
import { LoginPage } from '../../pages/common/LoginPage';
import { WalletPage } from '../../pages/common/WalletPage';
import { BorrowerDetailPage } from '../../pages/borrower/BorrowerDetailPage';
import { LenderDetailPage } from '../../pages/lender/LenderDetailPage';
import { LendingPage } from '../../pages/lender/LendingPage';
import { expectBorrowableNft } from '../../services/borrower/BorrowerWorkflowService';
import { readUiConfig, getLoanAmount, getApr, getDuration, getInterestRepayment, getAllowEarlyRepayment } from '../../utils/uiConfigHelper';

test.describe('UI Request & Lend Flow', () => {
  test.setTimeout(360000);

  test('borrower requests a loan and lender accepts it directly', async ({ page, browser }) => {
    const config = readUiConfig();
    const borrowerEmail = process.env.REALWORLD_WEB2_EMAIL || config.borrowerEmail || 'brooklyn@yopmail.com';
    const borrowerPassword = process.env.REALWORLD_WEB2_PASSWORD || config.borrowerPassword || 'Test@1233333';
    const lenderEmailVal = process.env.REALWORLD_LENDER_EMAIL || config.lenderEmail || 'harish@yopmail.com';
    const lenderPasswordVal = process.env.REALWORLD_LENDER_PASSWORD || config.lenderPassword || 'Test@1233333';

    console.log(`[FLOW 3] Borrower logging in: ${borrowerEmail}`);

    const loginPage = new LoginPage(page);
    await loginPage.open();
    await loginPage.login(borrowerEmail, borrowerPassword);
    await expect(page).toHaveURL(/\/(dashboard|my-wallet)/, { timeout: 30000 });

    const walletPage = new WalletPage(page);
    await walletPage.open();
    await walletPage.waitForAssets();
    await walletPage.openAvailableAssets();
    await expectBorrowableNft(walletPage);

    const assetName = await walletPage.nftName(0);
    console.log(`[FLOW 3] Requesting loan for NFT: ${assetName}`);
    await walletPage.requestLoanForNft(0);

    // Dynamic terms
    const amount = getLoanAmount(1000, 5000);
    const apr = getApr(10, 20);
    const duration = getDuration(90);
    const repayment = getInterestRepayment('End of loan.');
    const earlyRepay = getAllowEarlyRepayment('Yes.');

    console.log(`[FLOW 3] Terms - Amount: ${amount}, APR: ${apr}%, Duration: ${duration} days`);

    const amountInput = page.locator('#prinicipal');
    await expect(amountInput).toBeVisible({ timeout: 4000 });
    await amountInput.click();
    await amountInput.press('Control+A');
    await amountInput.press('Backspace');
    await amountInput.type(amount);

    await page.locator('select.form-select').selectOption({ label: '$RW' });

    const durationOpt = page.locator(`xpath=//*[contains(@class,"duration-days")]//li[normalize-space()="${duration}"]`).last();
    await expect(durationOpt).toBeVisible({ timeout: 3000 });
    await durationOpt.click();

    const aprInput = page.locator('input.form-control.text-end.border-0');
    await aprInput.click();
    await aprInput.press('Control+A');
    await aprInput.press('Backspace');
    await aprInput.type(apr);

    const advancedButton = page.getByRole('button', { name: /Advanced options/i });
    if (await advancedButton.isVisible().catch(() => false)) {
      await advancedButton.click();
    }

    const endOfLoanItem = page.getByRole('listitem', { name: repayment, exact: true }).last();
    if (await endOfLoanItem.isVisible({ timeout: 2000 }).catch(() => false)) {
      await endOfLoanItem.click();
    }
    const yesItem = page.getByRole('listitem', { name: earlyRepay, exact: true }).last();
    if (await yesItem.isVisible({ timeout: 2000 }).catch(() => false)) {
      await yesItem.click();
    }

    const requestButton = page.getByRole('button', { name: /Request loan/i });
    await expect(requestButton).toBeEnabled({ timeout: 3000 });
    await requestButton.scrollIntoViewIfNeeded();
    await requestButton.click({ force: true });

    const confirmButton = page.getByRole('button', { name: /^Confirm\.?$/i });
    if (!(await confirmButton.isVisible({ timeout: 2000 }).catch(() => false))) {
      await requestButton.evaluate((button: HTMLElement) => button.click());
    }

    await confirmButton.waitFor({ state: 'visible', timeout: 4000 });
    await confirmButton.click();

    await page.getByRole('button', { name: /Processing/i }).waitFor({ state: 'visible', timeout: 30000 });
    const okayButton = page.getByRole('button', { name: 'Okay.' });
    await okayButton.waitFor({ state: 'visible', timeout: 120000 });
    await okayButton.click();

    console.log('[FLOW 3] Loan request successfully created. Capturing Loan ID...');
    await walletPage.open();
    await walletPage.openNegotiationAssets();
    await walletPage.openNftCardByName(assetName);

    const borrowerDetailPage = new BorrowerDetailPage(page);
    await borrowerDetailPage.waitForPageLoaded();

    const borrowerUrl = page.url();
    const urlParts = borrowerUrl.split('/').filter(Boolean);
    const loanId = urlParts.pop()?.split('?')[0];
    if (!loanId) {
      throw new Error(`Failed to extract loan ID from URL: ${borrowerUrl}`);
    }
    console.log(`[FLOW 3] Captured Loan ID: ${loanId}`);

    // Lender side context
    console.log(`[FLOW 3] Lender logging in: ${lenderEmailVal}`);
    const lenderContext = await browser.newContext();
    const lenderPage = await lenderContext.newPage();
    const lenderLoginPage = new LoginPage(lenderPage);

    await lenderLoginPage.open();
    await lenderLoginPage.login(lenderEmailVal, lenderPasswordVal);
    await expect(lenderPage).toHaveURL(/\/(dashboard|my-wallet|lend)/, { timeout: 30000 });

    const lenderDetailPage = new LenderDetailPage(lenderPage);
    await lenderDetailPage.open(loanId);
    await lenderDetailPage.waitForPageLoaded();

    const lendingPageObj = new LendingPage(lenderPage);
    console.log('[FLOW 3] Lender accepting terms and confirming...');
    await lendingPageObj.submitTermsAndConfirm();

    console.log('[FLOW 3] Waiting for lender transaction completion...');
    const success = await lendingPageObj.waitForTermsSubmissionResult();
    await lendingPageObj.closeTermsSubmissionResult();

    expect(success).toBeTruthy();
    console.log('[FLOW 3] Flow completed successfully: Loan requested and accepted!');
    await lenderContext.close();
  });
});
