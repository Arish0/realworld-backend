import { test, expect } from '../../fixtures/testFixture';
import { LoginPage } from '../../pages/common/LoginPage';
import { LendingPage } from '../../pages/lender/LendingPage';
import { readUiConfig } from '../../utils/uiConfigHelper';

test.describe('UI Lend Loan Flow', () => {
  test.setTimeout(180000);

  test('lender accepts the first available loan opportunity', async ({ page }) => {
    const config = readUiConfig();
    const email = process.env.REALWORLD_LENDER_EMAIL || config.lenderEmail || 'harish@yopmail.com';
    const password = process.env.REALWORLD_LENDER_PASSWORD || config.lenderPassword || 'Test@1233333';

    console.log(`[FLOW 2] Logging in lender: ${email}`);

    const loginPage = new LoginPage(page);
    await loginPage.open();
    await loginPage.login(email, password);
    await expect(page).toHaveURL(/\/(dashboard|my-wallet|lend)/, { timeout: 30000 });

    const lendingPage = new LendingPage(page);
    console.log('[FLOW 2] Navigating to lend opportunities...');
    await lendingPage.openFirstLoanOpportunity();

    console.log('[FLOW 2] Accepting the terms and confirming...');
    await lendingPage.submitTermsAndConfirm();

    console.log('[FLOW 2] Waiting for terms submission result...');
    const success = await lendingPage.waitForTermsSubmissionResult();
    await lendingPage.closeTermsSubmissionResult();

    expect(success).toBeTruthy();
    console.log('[FLOW 2] Successfully lent on the loan request.');
  });
});
