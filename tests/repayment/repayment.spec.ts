import { test, expect } from '../../fixtures/testFixture';
import { BorrowService } from '../../services/borrower/BorrowService';
import { loginAndOpenWallet } from '../../services/borrower/BorrowerWorkflowService';
import { LoginPage } from '../../pages/common/LoginPage';
import { BorrowerDetailPage } from '../../pages/borrower/BorrowerDetailPage';
import { LenderDetailPage } from '../../pages/lender/LenderDetailPage';
import { LendingPage } from '../../pages/lender/LendingPage';
import { BorrowRequestPage } from '../../pages/borrower/BorrowRequestPage';
import { getApr, getDuration, getLoanAmount, readUiConfig } from '../../utils/uiConfigHelper';

test.describe('Borrower loan repayment flows', () => {
  test('completes 6 phases of repayment sequentially using same NFT', async ({
    loginPage,
    walletPage,
    page,
    browser,
  }) => {
    test.setTimeout(1800000); // 30 minutes timeout for the entire 6-phase test

    // Log console/page errors for debugging
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

    const uiConfig = readUiConfig();
    const borrowerEmailVal = process.env.REALWORLD_WEB2_EMAIL || uiConfig.borrowerEmail || 'brooklyn@yopmail.com';
    const borrowerPasswordVal = process.env.REALWORLD_WEB2_PASSWORD || uiConfig.borrowerPassword || 'Test@1233333';
    const lenderEmailVal = process.env.REALWORLD_LENDER_EMAIL || uiConfig.lenderEmail || 'harish@yopmail.com';
    const lenderPasswordVal = process.env.REALWORLD_LENDER_PASSWORD || uiConfig.lenderPassword || 'Test@1233333';
    const configuredLoanAmount = getLoanAmount(1000, 5000);
    const configuredApr = getApr(10, 20);
    const configuredDuration = getDuration(90);

    console.log(
      `[CONFIG] Repayment flow received borrower=${borrowerEmailVal}, lender=${lenderEmailVal}, ` +
      `amount=${configuredLoanAmount}, apr=${configuredApr}, duration=${configuredDuration}`,
    );

    // 1. Log in borrower and open wallet
    await loginPage.open();
    await loginPage.login(borrowerEmailVal, borrowerPasswordVal);
    await expect(page).toHaveURL(/\/(dashboard|my-wallet)/, { timeout: 30000 });
    await walletPage.open();

    const borrowRequestPage = new BorrowRequestPage(page);
    const borrowerDetailPage = new BorrowerDetailPage(page);

    // Definition of the 6 phases
    const phases = [
      {
        phaseNum: 1,
        earlyRepayment: 'Yes',
        interestRepayment: 'End of loan',
        payMonthlyFirst: false,
      },
      {
        phaseNum: 2,
        earlyRepayment: 'No',
        interestRepayment: 'End of loan',
        payMonthlyFirst: false,
      },
      {
        phaseNum: 3,
        earlyRepayment: 'Yes',
        interestRepayment: 'Monthly',
        payMonthlyFirst: true,
      },
      {
        phaseNum: 4,
        earlyRepayment: 'No',
        interestRepayment: 'End of loan',
        payMonthlyFirst: true,
      },
      {
        phaseNum: 5,
        earlyRepayment: 'Yes',
        interestRepayment: 'Monthly',
        payMonthlyFirst: false,
      },
      {
        phaseNum: 6,
        earlyRepayment: 'No',
        interestRepayment: 'End of loan',
        payMonthlyFirst: false,
      },
    ];

    // --- DISCOVER A WORKING NFT ---
    const borrowService = new BorrowService(page);
    let assetName = '';
    let assetAppraisal = '';
    let phase1Success = false;
    const MAX_CYCLES = 3;

    for (let cycle = 1; cycle <= MAX_CYCLES; cycle++) {
      console.log(`\n--- Starting NFT Discovery Cycle ${cycle}/${MAX_CYCLES} ---`);
      await walletPage.open();
      await walletPage.openAvailableAssets();

      // If we are in cycle > 1 or have no borrowable NFTs, try to free one up from negotiation
      const currentCount = await walletPage.borrowableNftCount();
      if (cycle > 1 || currentCount === 0) {
        console.log('Attempting to free up an owned NFT by cancelling any negotiation request...');
        const cancelled = await borrowService.cancelFirstWalletLoanRequestIfPresent(walletPage);
        if (cancelled) {
          console.log('Cancelled negotiation request. Waiting 10 seconds for blockchain state to sync...');
          await page.waitForTimeout(10000);
        }
        await walletPage.openAvailableAssets();
      }

      const count = await walletPage.borrowableNftCount();
      console.log(`Found ${count} borrowable NFTs in available assets.`);

      for (let i = 0; i < count; i++) {
        const name = await walletPage.nftName(i);
        const appraisal = await walletPage.getAppraisal(i).catch(() => 'unknown');
        console.log(`Checking NFT "${name}" (Appraisal: "${appraisal}") at index ${i}...`);
        try {
          await walletPage.requestLoanForNft(i);
          await borrowRequestPage.waitForLoanForm();

          // Configure loan parameters for Phase 1
          await borrowRequestPage.applyLoanRequestOptions({
            loanAmount: configuredLoanAmount,
            currency: '$RW',
            durationDays: configuredDuration,
            apr: configuredApr,
            interestRepayment: 'End of loan',
            allowEarlyRepayment: 'Yes',
          });

          await borrowRequestPage.submitDefaultLoanRequest();
          await borrowRequestPage.confirmLoanRequest();

          const success = await borrowRequestPage.waitForLoanRequestResult();
          await borrowRequestPage.closeLoanRequestedSuccess();

          if (success) {
            console.log(`NFT "${name}" with appraisal "${appraisal}" is borrowable and Phase 1 loan request was created successfully!`);
            assetName = name;
            assetAppraisal = appraisal;
            phase1Success = true;
            break;
          } else {
            console.log(`NFT "${name}" loan request failed.`);
          }
        } catch (err: any) {
          console.log(`Error testing NFT "${name}": ${err.message}`);
          const okayButton = page.getByRole('button', { name: 'Okay.' });
          if (await okayButton.isVisible().catch(() => false)) {
            await okayButton.click();
          }
        }

        // Wait for modal fade-out to prevent click intercept backdrop errors
        await page.locator('.modal').waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
        await page.locator('.modal-backdrop').waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});

        await walletPage.open();
        await walletPage.openAvailableAssets();
      }

      if (phase1Success) {
        break;
      }

      console.log(`Cycle ${cycle} finished. No borrowable NFTs succeeded. Waiting 10 seconds before next cycle...`);
      await page.waitForTimeout(10000);
    }

    if (!phase1Success || !assetName) {
      throw new Error('All available NFTs failed to create a loan request after all retry cycles.');
    }

    console.log(`Using NFT collateral: "${assetName}" (Appraisal: "${assetAppraisal}") for all repayment phases.`);

    for (const phase of phases) {
      console.log(`\n========================================`);
      console.log(`STARTING PHASE ${phase.phaseNum}/6`);
      console.log(`Early Repayment: ${phase.earlyRepayment}, Interest Repayment: ${phase.interestRepayment}`);
      console.log(`========================================`);

      if (phase.phaseNum === 1) {
        console.log(`Phase 1 loan request already created during NFT discovery.`);
      } else {
        // --- STEP A: BORROWER REQUESTS LOAN ---
        await walletPage.open();
        await walletPage.requestLoanForNftByNameAndAppraisal(assetName, assetAppraisal);
        await borrowRequestPage.waitForLoanForm();

        // Configure loan parameters
        await borrowRequestPage.applyLoanRequestOptions({
          loanAmount: configuredLoanAmount,
          currency: '$RW',
          durationDays: configuredDuration,
          apr: configuredApr,
          interestRepayment: phase.interestRepayment as any,
          allowEarlyRepayment: phase.earlyRepayment as any,
        });

        await borrowRequestPage.submitDefaultLoanRequest();
        await borrowRequestPage.confirmLoanRequest();
        await borrowRequestPage.waitForLoanRequestedSuccess();
        await borrowRequestPage.closeLoanRequestedSuccess();
      }

      // Get generated loan ID
      await walletPage.open();
      await walletPage.openNegotiationAssets();
      await walletPage.openNftCardByName(assetName);
      await borrowerDetailPage.waitForPageLoaded();

      const borrowerUrl = page.url();
      const urlParts = borrowerUrl.split('/').filter(Boolean);
      const loanId = urlParts.pop()?.split('?')[0];
      if (!loanId) {
        throw new Error(`Failed to extract loan ID from URL: ${borrowerUrl}`);
      }
      console.log(`Phase ${phase.phaseNum} Loan ID: ${loanId}`);

      // --- STEP B: LENDER ACCEPTS LOAN ---
      const lenderContext = await browser.newContext();
      const lenderPage = await lenderContext.newPage();
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
      await lenderLoginPage.login(lenderEmailVal, lenderPasswordVal);
      await expect(lenderPage).toHaveURL(/\/(dashboard|my-wallet|lend)/, { timeout: 30000 });

      const lenderDetailPage = new LenderDetailPage(lenderPage);
      await lenderDetailPage.open(loanId);
      await lenderDetailPage.waitForPageLoaded();

      const lendingPageObj = new LendingPage(lenderPage);
      console.log(`[Lender] Accepting Phase ${phase.phaseNum} loan terms...`);
      await lendingPageObj.submitTermsAndConfirm();
      const lendSuccess = await lendingPageObj.waitForTermsSubmissionResult();
      await lendingPageObj.closeTermsSubmissionResult();
      expect(lendSuccess).toBeTruthy();
      console.log(`[Lender] Phase ${phase.phaseNum} loan accepted/funded successfully.`);
      await lenderContext.close();

      // --- STEP C: BORROWER REPAYS LOAN ---
      await page.bringToFront();
      await walletPage.open();
      await walletPage.openNegotiationAssets();
      await walletPage.openNftCardByName(assetName);
      await borrowerDetailPage.waitForPageLoaded();

      if (phase.payMonthlyFirst) {
        console.log(`[Borrower] Phase ${phase.phaseNum}: Paying monthly interest first...`);
        await borrowerDetailPage.repayMonthlyInterest();
        const monthlySuccess = await borrowerDetailPage.waitForRepaymentResult();
        await borrowerDetailPage.closeRepaymentResult();
        expect(monthlySuccess).toBeTruthy();
        console.log(`[Borrower] Monthly interest payment successful.`);

        // Wait a few seconds for blockchain & UI update
        await page.waitForTimeout(3000);
        await page.reload();
        await borrowerDetailPage.waitForPageLoaded();
      }

      console.log(`[Borrower] Phase ${phase.phaseNum}: Paying full balance (Pay Full Balance)...`);
      await borrowerDetailPage.repayLoan();
      const fullSuccess = await borrowerDetailPage.waitForRepaymentResult();
      await borrowerDetailPage.closeRepaymentResult();
      expect(fullSuccess).toBeTruthy();
      console.log(`[Borrower] Phase ${phase.phaseNum} full repayment successful.`);

      // Wait for blockchain indexing
      await page.waitForTimeout(5000);

      // Verify the NFT is returned to the available tab
      await walletPage.open();
      await walletPage.openAvailableAssets();
      const returnedCard = page.locator('#cards > div')
        .filter({ has: page.locator('h1', { hasText: assetName }) })
        .filter({ hasText: assetAppraisal })
        .first();
      await expect(returnedCard).toBeVisible({ timeout: 45000 });
      console.log(`Phase ${phase.phaseNum} complete! NFT successfully returned to Available assets.`);
    }
  });
});
