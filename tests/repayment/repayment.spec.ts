import { test, expect } from '../../fixtures/testFixture';
import type { Browser, Page } from '@playwright/test';
import { BorrowService } from '../../services/borrower/BorrowService';
import { LoginPage } from '../../pages/common/LoginPage';
import { BorrowerDetailPage } from '../../pages/borrower/BorrowerDetailPage';
import { LenderDetailPage } from '../../pages/lender/LenderDetailPage';
import { LendingPage } from '../../pages/lender/LendingPage';
import { BorrowRequestPage, LoanRequestOptions } from '../../pages/borrower/BorrowRequestPage';
import { WalletPage } from '../../pages/common/WalletPage';
import { getApr, getDuration, getLoanAmount, readUiConfig } from '../../utils/uiConfigHelper';

type RepaymentPhase = {
  phaseNum: number;
  earlyRepayment: 'Yes';
  interestRepayment: 'End of loan' | 'Monthly';
  payMonthlyFirst: boolean;
} | {
  phaseNum: number;
  earlyRepayment: 'No';
  interestRepayment: 'End of loan' | 'Monthly';
  payMonthlyFirst: boolean;
};

function normalizeNftId(value?: string): string {
  const raw = String(value || '').trim();
  if (!raw) return '';

  return raw
    .replace(/^https?:\/\/[^/]+\/nft-detail\//i, '')
    .replace(/^\/nft-detail\//i, '')
    .replace(/^nft-detail\//i, '')
    .replace(/\?.*$/, '')
    .replace(/^\/+|\/+$/g, '');
}

async function dismissResultOrBackdrop(page: Page): Promise<void> {
  const okayButton = page.getByRole('button', { name: 'Okay.' }).filter({ visible: true }).first();
  if (await okayButton.isVisible().catch(() => false)) {
    await okayButton.click().catch(() => {});
  }
  await page.locator('.modal').waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
  await page.locator('.modal-backdrop').waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
}

async function readNftNameFromDetail(page: Page, nftId: string): Promise<string> {
  const title = page.locator('h1').filter({ hasText: /\S/ }).first();
  if (await title.isVisible({ timeout: 30000 }).catch(() => false)) {
    const value = (await title.innerText()).replace(/\s+/g, ' ').trim();
    if (value) return value;
  }

  const tokenId = nftId.split('/').pop() || nftId;
  return tokenId;
}

async function openDirectNftLoanForm(
  page: Page,
  borrowRequestPage: BorrowRequestPage,
  nftId: string,
): Promise<string> {
  const detailUrl = `https://stagingmarket.realworld.fi/nft-detail/${nftId}`;
  console.log(`[DIRECT NFT] Opening NFT detail page: ${detailUrl}`);
  await page.goto(detailUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});

  const assetName = await readNftNameFromDetail(page, nftId);
  console.log(`[DIRECT NFT] Resolved collateral name: "${assetName}"`);

  const embeddedFormVisible = await page.getByText(/Loan amount requested/i).first().isVisible({ timeout: 5000 }).catch(() => false);
  if (!embeddedFormVisible) {
    const requestLoanAction = page
      .getByRole('tab', { name: /Make Loan Offer/i })
      .or(page.getByRole('button', { name: /Request loan/i }))
      .or(page.getByRole('link', { name: /Request loan/i }))
      .filter({ visible: true })
      .first();

    await expect(requestLoanAction, `Expected loan request action on NFT detail page for ${nftId}`).toBeVisible({
      timeout: 30000,
    });
    await requestLoanAction.scrollIntoViewIfNeeded();
    await requestLoanAction.click({ force: true });
  }

  await borrowRequestPage.waitForLoanForm();
  return assetName;
}

async function submitConfiguredLoanRequest(
  borrowRequestPage: BorrowRequestPage,
  options: LoanRequestOptions,
): Promise<boolean> {
  await borrowRequestPage.applyLoanRequestOptions(options);
  await borrowRequestPage.submitDefaultLoanRequest();
  await borrowRequestPage.confirmLoanRequest();
  const success = await borrowRequestPage.waitForLoanRequestResult();
  await borrowRequestPage.closeLoanRequestedSuccess();
  return success;
}

async function createDirectLoanRequestWithRetry(
  page: Page,
  borrowRequestPage: BorrowRequestPage,
  nftId: string,
  phase: RepaymentPhase,
  options: LoanRequestOptions,
): Promise<string> {
  let lastError = '';

  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      console.log(`[DIRECT NFT] Phase ${phase.phaseNum}: loan request attempt ${attempt}/4 for ${nftId}`);
      const assetName = await openDirectNftLoanForm(page, borrowRequestPage, nftId);
      const success = await submitConfiguredLoanRequest(borrowRequestPage, options);

      if (success) {
        console.log(`[DIRECT NFT] Phase ${phase.phaseNum}: loan request created successfully on attempt ${attempt}.`);
        return assetName;
      }

      lastError = 'Application returned a failed loan request result.';
      console.log(`[DIRECT NFT] Phase ${phase.phaseNum}: loan request failed on attempt ${attempt}.`);
    } catch (err: any) {
      lastError = err?.message || String(err);
      console.log(`[DIRECT NFT] Phase ${phase.phaseNum}: loan request attempt ${attempt}/4 threw: ${lastError}`);
    }

    await dismissResultOrBackdrop(page);
    if (attempt < 4) {
      await page.waitForTimeout(5000);
    }
  }

  throw new Error(`[DIRECT NFT] Phase ${phase.phaseNum}: loan request failed after 4 attempts. Last error: ${lastError}`);
}

async function captureLoanIdFromWallet(
  page: Page,
  walletPage: WalletPage,
  borrowerDetailPage: BorrowerDetailPage,
  assetName: string,
): Promise<string> {
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
  return loanId;
}

async function acceptLoanWithRetry(
  browser: Browser,
  loanId: string,
  phaseNum: number,
  lenderEmail: string,
  lenderPassword: string,
): Promise<void> {
  let lastError = '';

  for (let attempt = 1; attempt <= 3; attempt += 1) {
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

    try {
      console.log(`[Lender] Phase ${phaseNum}: accepting loan ${loanId}, attempt ${attempt}/3...`);
      const lenderLoginPage = new LoginPage(lenderPage);
      await lenderLoginPage.open();
      await lenderLoginPage.login(lenderEmail, lenderPassword);
      await expect(lenderPage).toHaveURL(/\/(dashboard|my-wallet|lend)/, { timeout: 30000 });

      const lenderDetailPage = new LenderDetailPage(lenderPage);
      await lenderDetailPage.open(loanId);
      await lenderDetailPage.waitForPageLoaded();

      const lendingPageObj = new LendingPage(lenderPage);
      await lendingPageObj.submitTermsAndConfirm();
      const lendSuccess = await lendingPageObj.waitForTermsSubmissionResult();
      await lendingPageObj.closeTermsSubmissionResult();

      if (lendSuccess) {
        console.log(`[Lender] Phase ${phaseNum}: loan ${loanId} accepted successfully on attempt ${attempt}.`);
        await lenderContext.close();
        return;
      }

      lastError = 'Application returned a failed lending result.';
      console.log(`[Lender] Phase ${phaseNum}: lending failed on attempt ${attempt}/3.`);
    } catch (err: any) {
      lastError = err?.message || String(err);
      console.log(`[Lender] Phase ${phaseNum}: lending attempt ${attempt}/3 threw: ${lastError}`);
    } finally {
      await lenderContext.close().catch(() => {});
    }

    if (attempt < 3) {
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }

  throw new Error(`[Lender] Phase ${phaseNum}: loan ${loanId} failed to lend after 3 attempts. Last error: ${lastError}`);
}

test.describe('Borrower loan repayment flows', () => {
  test('completes repayment phases using configured borrower, lender, and NFT collateral', async ({
    loginPage,
    walletPage,
    page,
    browser,
  }) => {
    test.setTimeout(1800000);

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
    const configuredNftId = normalizeNftId(uiConfig.nftId);

    console.log(
      `[CONFIG] Repayment flow received borrower=${borrowerEmailVal}, lender=${lenderEmailVal}, ` +
      `amount=${configuredLoanAmount}, apr=${configuredApr}, duration=${configuredDuration}, ` +
      `nftId=${configuredNftId || 'wallet-discovery'}`,
    );

    await loginPage.open();
    await loginPage.login(borrowerEmailVal, borrowerPasswordVal);
    await expect(page).toHaveURL(/\/(dashboard|my-wallet)/, { timeout: 30000 });
    await walletPage.open();

    const borrowRequestPage = new BorrowRequestPage(page);
    const borrowerDetailPage = new BorrowerDetailPage(page);

    const phases: RepaymentPhase[] = [
      { phaseNum: 1, earlyRepayment: 'Yes', interestRepayment: 'End of loan', payMonthlyFirst: false },
      { phaseNum: 2, earlyRepayment: 'No', interestRepayment: 'End of loan', payMonthlyFirst: false },
      { phaseNum: 3, earlyRepayment: 'Yes', interestRepayment: 'Monthly', payMonthlyFirst: true },
      { phaseNum: 4, earlyRepayment: 'No', interestRepayment: 'End of loan', payMonthlyFirst: true },
      { phaseNum: 5, earlyRepayment: 'Yes', interestRepayment: 'Monthly', payMonthlyFirst: false },
      { phaseNum: 6, earlyRepayment: 'No', interestRepayment: 'End of loan', payMonthlyFirst: false },
    ];

    const borrowService = new BorrowService(page);
    let assetName = '';
    let assetAppraisal = '';
    let phase1Success = false;
    const MAX_CYCLES = 3;

    if (configuredNftId) {
      assetName = await createDirectLoanRequestWithRetry(page, borrowRequestPage, configuredNftId, phases[0], {
        loanAmount: configuredLoanAmount,
        currency: '$RW',
        durationDays: configuredDuration,
        apr: configuredApr,
        interestRepayment: phases[0].interestRepayment,
        allowEarlyRepayment: phases[0].earlyRepayment,
      });
      assetAppraisal = 'unknown';
      phase1Success = true;
    } else {
      for (let cycle = 1; cycle <= MAX_CYCLES; cycle++) {
        console.log(`\n--- Starting NFT Discovery Cycle ${cycle}/${MAX_CYCLES} ---`);
        await walletPage.open();
        await walletPage.openAvailableAssets();

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

        const initialCount = await walletPage.borrowableNftCount();
        console.log(`Found ${initialCount} borrowable NFTs in available assets.`);

        for (let i = 0; ; i++) {
          const refreshedCount = await walletPage.borrowableNftCount();
          if (i >= refreshedCount) {
            console.log(`Stopping discovery loop at index ${i}; only ${refreshedCount} borrowable NFTs are currently available after refresh.`);
            break;
          }

          let name = '';
          let appraisal = 'unknown';
          try {
            name = await walletPage.nftName(i);
            appraisal = await walletPage.getAppraisal(i).catch(() => 'unknown');
          } catch (err: any) {
            console.log(`Skipping borrowable NFT index ${i}; wallet list changed while reading card: ${err.message}`);
            break;
          }

          console.log(`Checking NFT "${name}" (Appraisal: "${appraisal}") at index ${i}...`);
          try {
            await walletPage.requestLoanForNft(i);
            await borrowRequestPage.waitForLoanForm();

            const success = await submitConfiguredLoanRequest(borrowRequestPage, {
              loanAmount: configuredLoanAmount,
              currency: '$RW',
              durationDays: configuredDuration,
              apr: configuredApr,
              interestRepayment: 'End of loan',
              allowEarlyRepayment: 'Yes',
            });

            if (success) {
              console.log(`NFT "${name}" with appraisal "${appraisal}" is borrowable and Phase 1 loan request was created successfully!`);
              assetName = name;
              assetAppraisal = appraisal;
              phase1Success = true;
              break;
            }

            console.log(`NFT "${name}" loan request failed.`);
          } catch (err: any) {
            console.log(`Error testing NFT "${name}": ${err.message}`);
            await dismissResultOrBackdrop(page);
          }

          await dismissResultOrBackdrop(page);
          await walletPage.open();
          await walletPage.openAvailableAssets();
        }

        if (phase1Success) {
          break;
        }

        console.log(`Cycle ${cycle} finished. No borrowable NFTs succeeded. Waiting 10 seconds before next cycle...`);
        await page.waitForTimeout(10000);
      }
    }

    if (!phase1Success || !assetName) {
      throw new Error('All configured/available NFTs failed to create a loan request after all retry attempts.');
    }

    console.log(`Using NFT collateral: "${assetName}" (Appraisal: "${assetAppraisal}") for all repayment phases.`);

    for (const phase of phases) {
      console.log(`\n========================================`);
      console.log(`STARTING PHASE ${phase.phaseNum}/6`);
      console.log(`Early Repayment: ${phase.earlyRepayment}, Interest Repayment: ${phase.interestRepayment}`);
      console.log(`========================================`);

      if (phase.phaseNum === 1) {
        console.log('Phase 1 loan request already created during NFT setup.');
      } else if (configuredNftId) {
        assetName = await createDirectLoanRequestWithRetry(page, borrowRequestPage, configuredNftId, phase, {
          loanAmount: configuredLoanAmount,
          currency: '$RW',
          durationDays: configuredDuration,
          apr: configuredApr,
          interestRepayment: phase.interestRepayment,
          allowEarlyRepayment: phase.earlyRepayment,
        });
      } else {
        await walletPage.open();
        await walletPage.requestLoanForNftByNameAndAppraisal(assetName, assetAppraisal);
        await borrowRequestPage.waitForLoanForm();

        await submitConfiguredLoanRequest(borrowRequestPage, {
          loanAmount: configuredLoanAmount,
          currency: '$RW',
          durationDays: configuredDuration,
          apr: configuredApr,
          interestRepayment: phase.interestRepayment,
          allowEarlyRepayment: phase.earlyRepayment,
        });
      }

      const loanId = await captureLoanIdFromWallet(page, walletPage, borrowerDetailPage, assetName);
      console.log(`Phase ${phase.phaseNum} Loan ID: ${loanId}`);

      await acceptLoanWithRetry(browser, loanId, phase.phaseNum, lenderEmailVal, lenderPasswordVal);

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
        console.log('[Borrower] Monthly interest payment successful.');

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

      await page.waitForTimeout(5000);
      await walletPage.open();
      await walletPage.openAvailableAssets();

      let returnedCard = page.locator('#cards > div')
        .filter({ has: page.locator('h1', { hasText: assetName }) });
      if (assetAppraisal && assetAppraisal !== 'unknown') {
        returnedCard = returnedCard.filter({ hasText: assetAppraisal });
      }
      await expect(returnedCard.first()).toBeVisible({ timeout: 45000 });
      console.log(`Phase ${phase.phaseNum} complete! NFT successfully returned to Available assets.`);
    }
  });
});

