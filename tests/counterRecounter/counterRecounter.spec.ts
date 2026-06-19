import { test, expect } from '../../fixtures/testFixture';
import { BorrowService } from '../../services/borrower/BorrowService';
import { loginAndOpenWallet } from '../../services/borrower/BorrowerWorkflowService';
import { LoginPage } from '../../pages/common/LoginPage';
import { BorrowerDetailPage } from '../../pages/borrower/BorrowerDetailPage';
import { LenderDetailPage } from '../../pages/lender/LenderDetailPage';
import { LendingPage } from '../../pages/lender/LendingPage';

test.describe('Borrower counter recounter', () => {
  test('completes counter and re-counter negotiation flow', async ({
    loginPage,
    walletPage,
    page,
    browser,
  }) => {
    test.setTimeout(900000);
    // Enable console and page error logging for debugging
    page.on('console', msg => console.log(`[BORROWER CONSOLE] ${msg.type()}: ${msg.text()}`));
    page.on('pageerror', err => console.log(`[BORROWER PAGE ERROR] ${err.message}`));

    page.on('response', async response => {
      const status = response.status();
      if (status >= 400) {
        try {
          const body = await response.text();
          console.log(`[BORROWER HTTP ERROR] ${response.request().method()} ${response.url()} -> Status ${status} -> Body: ${body}`);
        } catch (e) {
          console.log(`[BORROWER HTTP ERROR] ${response.request().method()} ${response.url()} -> Status ${status} (could not read body)`);
        }
      }
    });

    // 1. Borrower (Brooklyn) logs in and creates a loan request
    await loginAndOpenWallet(loginPage, walletPage, page);

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
    console.log(`Borrower detail page URL: ${borrowerUrl}`);
    const urlParts = borrowerUrl.split('/').filter(Boolean);
    const loanId = urlParts.pop()?.split('?')[0];
    if (!loanId) {
      throw new Error(`Expected a valid loan ID to be extracted from URL: ${borrowerUrl}`);
    }
    console.log(`Extracted Loan ID: ${loanId}`);

    // 2. Lender (harish@yopmail.com) logs in in a separate browser context once
    const lenderContext = await browser.newContext();
    const lenderPage = await lenderContext.newPage();
    // Enable console and page error logging for lender page
    lenderPage.on('console', msg => console.log(`[LENDER CONSOLE] ${msg.type()}: ${msg.text()}`));
    lenderPage.on('pageerror', err => console.log(`[LENDER PAGE ERROR] ${err.message}`));
    lenderPage.on('response', async response => {
      const status = response.status();
      if (status >= 400) {
        try {
          const body = await response.text();
          console.log(`[LENDER HTTP ERROR] ${response.request().method()} ${response.url()} -> Status ${status} -> Body: ${body}`);
        } catch (e) {
          console.log(`[LENDER HTTP ERROR] ${response.request().method()} ${response.url()} -> Status ${status} (could not read body)`);
        }
      }
    });

    const lenderLoginPage = new LoginPage(lenderPage);
    await lenderLoginPage.open();
    await lenderLoginPage.login('harish@yopmail.com', 'Test@1233333');
    await expect(lenderPage).toHaveURL(/\/(dashboard|my-wallet|lend)/, { timeout: 30000 });

    const lenderDetailPage = new LenderDetailPage(lenderPage);

    try {
      // Loop negotiation 10 times
      for (let i = 1; i <= 10; i++) {
        console.log(`\n=== Starting Negotiation Iteration ${i}/10 ===`);

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

        // Random relative modification to keep values in valid ranges
        const lenderAmtOffset = (Math.floor(Math.random() * 21) + 10) * (Math.random() > 0.5 ? 1 : -1);
        const newLenderAmount = Math.max(1000, Math.floor(currentLenderAmount + lenderAmtOffset)).toString();
        const lenderAprOffset = (Math.floor(Math.random() * 2) + 1) * (Math.random() > 0.5 ? 1 : -1);
        const newLenderApr = Math.max(5, Math.min(30, Math.floor(currentLenderApr + lenderAprOffset))).toString();

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

        // Random relative modification to keep values in valid ranges
        const borrowerAmtOffset = (Math.floor(Math.random() * 21) + 10) * (Math.random() > 0.5 ? 1 : -1);
        const newBorrowerAmount = Math.max(1000, Math.floor(currentBorrowerAmount + borrowerAmtOffset)).toString();
        const borrowerAprOffset = (Math.floor(Math.random() * 2) + 1) * (Math.random() > 0.5 ? 1 : -1);
        const newBorrowerApr = Math.max(5, Math.min(30, Math.floor(currentBorrowerApr + borrowerAprOffset))).toString();

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
