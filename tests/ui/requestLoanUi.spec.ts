import { test, expect } from '../../fixtures/testFixture';
import { LoginPage } from '../../pages/common/LoginPage';
import { WalletPage } from '../../pages/common/WalletPage';
import { BorrowRequestPage } from '../../pages/borrower/BorrowRequestPage';
import { expectBorrowableNft } from '../../services/borrower/BorrowerWorkflowService';
import { readUiConfig, getLoanAmount, getApr, getDuration, getInterestRepayment, getAllowEarlyRepayment } from '../../utils/uiConfigHelper';

test.describe('UI Request Loan Flow', () => {
  test.setTimeout(180000);

  test('borrower requests a loan with dynamic parameters', async ({ page }) => {
    const config = readUiConfig();
    const email = process.env.REALWORLD_WEB2_EMAIL || config.borrowerEmail || 'brooklyn@yopmail.com';
    const password = process.env.REALWORLD_WEB2_PASSWORD || config.borrowerPassword || 'Test@1233333';

    console.log(`[FLOW 1] Logging in borrower: ${email}`);

    const loginPage = new LoginPage(page);
    await loginPage.open();
    await loginPage.login(email, password);
    await expect(page).toHaveURL(/\/(dashboard|my-wallet)/, { timeout: 30000 });

    const walletPage = new WalletPage(page);
    await walletPage.open();
    await walletPage.waitForAssets();
    await walletPage.openAvailableAssets();
    await expectBorrowableNft(walletPage);

    const assetName = await walletPage.nftName(0);
    console.log(`[FLOW 1] Requesting loan for NFT: ${assetName}`);
    await walletPage.requestLoanForNft(0);

    const borrowRequestPage = new BorrowRequestPage(page);
    await borrowRequestPage.waitForLoanForm();

    // Generate random / configured values
    const amount = getLoanAmount(1000, 5000);
    const apr = getApr(10, 20);
    const duration = getDuration(90);
    const repayment = getInterestRepayment('End of loan.');
    const earlyRepay = getAllowEarlyRepayment('Yes.');

    console.log(`[FLOW 1] Terms - Amount: ${amount}, APR: ${apr}%, Duration: ${duration} days, Repayment: ${repayment}, Early Repayment: ${earlyRepay}`);

    // Fill in amount
    const amountInput = page.locator('#prinicipal');
    await expect(amountInput).toBeVisible({ timeout: 4000 });
    await amountInput.click();
    await amountInput.press('Control+A');
    await amountInput.press('Backspace');
    await amountInput.type(amount);

    await page.locator('select.form-select').selectOption({ label: '$RW' });

    // Select duration
    const durationOpt = page.locator(`xpath=//*[contains(@class,"duration-days")]//li[normalize-space()="${duration}"]`).last();
    await expect(durationOpt).toBeVisible({ timeout: 3000 });
    await durationOpt.click();

    // Fill APR
    const aprInput = page.locator('input.form-control.text-end.border-0');
    await aprInput.click();
    await aprInput.press('Control+A');
    await aprInput.press('Backspace');
    await aprInput.type(apr);

    // Advanced options
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

    // Submit loan request
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

    // Wait for success modal
    await page.getByRole('button', { name: /Processing/i }).waitFor({ state: 'visible', timeout: 30000 });
    const okayButton = page.getByRole('button', { name: 'Okay.' });
    await okayButton.waitFor({ state: 'visible', timeout: 120000 });

    const isFailed = await page.locator('img[alt="failed"]').isVisible().catch(() => false);
    await okayButton.click();

    expect(isFailed).toBeFalsy();
    console.log(`[FLOW 1] Loan request created successfully for NFT: ${assetName}`);
  });
});
