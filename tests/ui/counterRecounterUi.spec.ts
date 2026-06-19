import { test, expect } from '../../fixtures/testFixture';
import { BorrowService } from '../../services/borrower/BorrowService';
import { LoginPage } from '../../pages/common/LoginPage';
import { BorrowerDetailPage } from '../../pages/borrower/BorrowerDetailPage';
import { LenderDetailPage } from '../../pages/lender/LenderDetailPage';
import { LendingPage } from '../../pages/lender/LendingPage';
import { readUiConfig, getLoanAmount, getApr, getIterations } from '../../utils/uiConfigHelper';

test.describe('UI Borrower Counter Recounter Flow', () => {
  test.setTimeout(1800000); // 30 minutes limit for large iterations

  test('completes dynamic counter and re-counter negotiation flow', async ({
    page,
    browser,
  }) => {
    const config = readUiConfig();
    const borrowerEmail = process.env.REALWORLD_WEB2_EMAIL || config.borrowerEmail || 'brooklyn@yopmail.com';
    const borrowerPassword = process.env.REALWORLD_WEB2_PASSWORD || config.borrowerPassword || 'Test@1233333';
    const lenderEmailVal = process.env.REALWORLD_LENDER_EMAIL || config.lenderEmail || 'harish@yopmail.com';
    const lenderPasswordVal = process.env.REALWORLD_LENDER_PASSWORD || config.lenderPassword || 'Test@1233333';
    const iterations = getIterations(10);

    console.log(`[FLOW 4] Starting negotiation loop for ${iterations} iterations`);
    console.log(`[FLOW 4] Borrower: ${borrowerEmail}`);
    console.log(`[FLOW 4] Lender: ${lenderEmailVal}`);

    // Enable console and page error logging for debugging
    page.on('console', msg => console.log(`[BORROWER CONSOLE] ${msg.type()}: ${msg.text()}`));
    page.on('pageerror', err => console.log(`[BORROWER PAGE ERROR] ${err.message}`));

    // 1. Borrower (Brooklyn) logs in and creates a loan request
    const loginPage = new LoginPage(page);
    await loginPage.open();
    await loginPage.login(borrowerEmail, borrowerPassword);
    await expect(page).toHaveURL(/\/(dashboard)/, { timeout: 30000 });

    const walletPage = await loginPage.goToWallet();
    await walletPage.waitForAssets();

    const borrowService = new BorrowService(page);
    const borrowRes = await borrowService.requestLoanWithRetryAndFallback(walletPage);
    expect(borrowRes.success).toBeTruthy();
    const assetName = borrowRes.name;

    // Navigate to the newly created loan details to capture its ID
    await walletPage.open();
    await walletPage.openNegotiationAssets();
    await walletPage.openNftCardByName(assetName);

    const borrowerDetailPage = new BorrowerDetailPage(page);
    await borrowerDetailPage.waitForPageLoaded();

    const borrowerUrl = page.url();
    const urlParts = borrowerUrl.split('/').filter(Boolean);
    const loanId = urlParts.pop()?.split('?')[0];
    if (!loanId) {
      throw new Error(`Expected a valid loan ID to be extracted from URL: ${borrowerUrl}`);
    }
    console.log(`[FLOW 4] Extracted Loan ID: ${loanId}`);

    // 2. Lender logs in in a separate browser context once
    const lenderContext = await browser.newContext();
    const lenderPage = await lenderContext.newPage();
    lenderPage.on('console', msg => console.log(`[LENDER CONSOLE] ${msg.type()}: ${msg.text()}`));
    lenderPage.on('pageerror', err => console.log(`[LENDER PAGE ERROR] ${err.message}`));

    const lenderLoginPage = new LoginPage(lenderPage);
    await lenderLoginPage.open();
    await lenderLoginPage.login(lenderEmailVal, lenderPasswordVal);
    await expect(lenderPage).toHaveURL(/\/(dashboard|my-wallet|lend)/, { timeout: 30000 });

    const lenderDetailPage = new LenderDetailPage(lenderPage);

    try {
      // Loop negotiation N times
      for (let i = 1; i <= iterations; i++) {
        console.log(`\n=== Starting Negotiation Iteration ${i}/${iterations} ===`);

        // --- LENDER COUNTER OFFER ---
        console.log(`[Iteration ${i}] Lender navigating to loan page...`);
        await lenderPage.bringToFront();
        await lenderDetailPage.open(loanId);
        await lenderDetailPage.waitForPageLoaded();

        if (i === 1) {
          await lenderDetailPage.clickCounterTab();
        } else {
          await lenderDetailPage.clickCounterButtonInNegotiationTable();
        }

        // Read current values and modify relatively
        const currentLenderAmountStr = await lenderDetailPage.getAmountValue();
        const currentLenderAmount = parseFloat(currentLenderAmountStr.replace(/[^0-9.]/g, '')) || 5000;

        const currentLenderAprStr = await lenderDetailPage.getAprValue();
        const currentLenderApr = parseFloat(currentLenderAprStr.replace(/[^0-9.]/g, '')) || 15;

        // Alternate modification to keep values in valid ranges or use UI min/max configured
        const lenderAmountOffset = (i % 2 === 0) ? 15 : -15;
        const newLenderAmount = Math.max(100, Math.floor(currentLenderAmount + lenderAmountOffset)).toString();
        const newLenderApr = (currentLenderApr > 15) ? '14' : '16';

        console.log(`[Iteration ${i}] Lender inputting: Amount=${newLenderAmount}, APR=${newLenderApr}% (old amount: ${currentLenderAmount})`);

        await lenderDetailPage.fillAmountAndApr(newLenderAmount, newLenderApr);
        await lenderDetailPage.submitCounterOffer();
        await lenderDetailPage.confirmTransaction();
        await lenderDetailPage.waitForSuccessModal();
        console.log(`[Iteration ${i}] Lender offer submitted successfully.`);

        // --- BORROWER RE-COUNTER ---
        console.log(`[Iteration ${i}] Borrower returning to loan page...`);
        await page.bringToFront();
        await borrowerDetailPage.open(loanId);
        await borrowerDetailPage.waitForPageLoaded();

        await borrowerDetailPage.clickCounterButtonInNegotiationTable();

        const currentBorrowerAmountStr = await borrowerDetailPage.getAmountValue();
        const currentBorrowerAmount = parseFloat(currentBorrowerAmountStr.replace(/[^0-9.]/g, '')) || 5000;

        const currentBorrowerAprStr = await borrowerDetailPage.getAprValue();
        const currentBorrowerApr = parseFloat(currentBorrowerAprStr.replace(/[^0-9.]/g, '')) || 15;

        // Alternate modification to keep values in valid ranges
        const borrowerAmountOffset = (i % 2 === 0) ? -15 : 15;
        const newBorrowerAmount = Math.max(100, Math.floor(currentBorrowerAmount + borrowerAmountOffset)).toString();
        const newBorrowerApr = (currentBorrowerApr > 14) ? '13' : '15';

        console.log(`[Iteration ${i}] Borrower inputting: Amount=${newBorrowerAmount}, APR=${newBorrowerApr}% (old amount: ${currentBorrowerAmount})`);

        await borrowerDetailPage.fillAmountAndApr(newBorrowerAmount, newBorrowerApr);
        await borrowerDetailPage.submitRecounterOffer();
        await borrowerDetailPage.confirmTransaction();
        await borrowerDetailPage.waitForSuccessModal();
        console.log(`[Iteration ${i}] Borrower re-counter submitted successfully.`);
      }

      // --- LENDER ACCEPTS THE FINAL OFFER ---
      console.log(`\n=== Accepting the Final Offer (Lender) ===`);
      await lenderPage.bringToFront();
      await lenderDetailPage.open(loanId);
      await lenderDetailPage.waitForPageLoaded();

      const lendingPageObj = new LendingPage(lenderPage);
      console.log('[Lender] Accepting terms and confirming...');
      await lendingPageObj.submitTermsAndConfirm();

      console.log('[Lender] Waiting for lender transaction completion...');
      const success = await lendingPageObj.waitForTermsSubmissionResult();
      await lendingPageObj.closeTermsSubmissionResult();

      expect(success).toBeTruthy();
      console.log('[Lender] Loan successfully accepted!');
    } finally {
      await lenderContext.close();
    }
  });
});
