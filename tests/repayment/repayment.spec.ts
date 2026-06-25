import { test, expect } from '../../fixtures/testFixture';
import type { Browser, Page, BrowserContext } from '@playwright/test';
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

async function ensureBorrowerLoggedIn(page: Page, email: string, pass: string): Promise<void> {
  const isLoginPage = page.url().includes('/sign-in') || page.url().includes('/login');
  const headerLoginBtn = page.getByRole('button', { name: /Log in/i })
    .or(page.locator('button:has-text("Log in")'))
    .or(page.locator('a:has-text("Log in")'))
    .or(page.locator('text=Log in.'))
    .filter({ visible: true })
    .first();
  const isHeaderLoginVisible = await headerLoginBtn.isVisible().catch(() => false);

  if (isLoginPage || isHeaderLoginVisible) {
    console.log('[BORROWER SESSION] Detected logged-out state. Logging back in...');
    const loginPageObj = new LoginPage(page);
    await loginPageObj.open();
    await loginPageObj.login(email, pass);
    console.log('[BORROWER SESSION] Logged in successfully.');
  }
}

async function readNftNameFromDetail(page: Page, nftId: string): Promise<string> {
  const title = page.locator('h1').filter({ hasText: /\S/ }).first();
  const isTitleVisible = await title.waitFor({ state: 'visible', timeout: 30000 }).then(() => true).catch(() => false);
  if (isTitleVisible) {
    const value = (await title.innerText()).replace(/\s+/g, ' ').trim();
    if (value) return value.replace(/\.+$/, '');
  }

  const tokenId = nftId.split('/').pop() || nftId;
  return tokenId;
}

async function openDirectNftLoanForm(
  page: Page,
  borrowRequestPage: BorrowRequestPage,
  nftId: string,
  borrowerEmail?: string,
  borrowerPassword?: string,
): Promise<string> {
  const detailUrl = `https://stagingmarket.realworld.fi/nft-detail/${nftId}`;
  console.log(`[DIRECT NFT] Opening NFT detail page: ${detailUrl}`);
  await page.goto(detailUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});

  if (borrowerEmail && borrowerPassword) {
    await ensureBorrowerLoggedIn(page, borrowerEmail, borrowerPassword);
    if (!page.url().includes(`/nft-detail/${nftId}`)) {
      console.log(`[DIRECT NFT] Navigating back to NFT detail page: ${detailUrl}`);
      await page.goto(detailUrl, { waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    }
  }

  // Ensure mock wallet is connected on this direct detail page load
  const walletAddress = page.locator('[data-testid="wallet-address"]').first();
  const isConnected = await walletAddress.waitFor({ state: 'visible', timeout: 5000 }).then(() => true).catch(() => false);
  if (!isConnected) {
    console.log('[DIRECT NFT] Wallet not connected automatically. Clicking connect button...');
    const connectBtn = page.locator('[data-testid="connect-wallet"]')
      .or(page.getByRole('button', { name: /Connect wallet/i }))
      .or(page.locator('text=Connect Wallet'))
      .or(page.locator('text=Connect wallet'))
      .filter({ visible: true })
      .first();
    const connectBtnVisible = await connectBtn.waitFor({ state: 'visible', timeout: 5000 }).then(() => true).catch(() => false);
    if (connectBtnVisible) {
      await connectBtn.click();
      await walletAddress.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
    }
  }

  const assetName = await readNftNameFromDetail(page, nftId);
  console.log(`[DIRECT NFT] Resolved collateral name: "${assetName}"`);

  // Self-heal: If a leftover pending or active loan is present, cancel/repay it
  const viewDetailsBtn = page.getByRole('button', { name: /View loan details/i }).filter({ visible: true }).first();
  if (await viewDetailsBtn.isVisible().catch(() => false)) {
    console.log(`[DIRECT NFT] Leftover pending/active loan detected! Clicking View loan details...`);
    await viewDetailsBtn.click();
    
    // Wait for redirect to happen
    await expect(page).toHaveURL(/\/(borrow-detail|lending-detail)\//, { timeout: 30000 });
    console.log(`[DIRECT NFT] Current URL after clicking view details: ${page.url()}`);

    const borrowerDetailPage = new BorrowerDetailPage(page);
    
    const connectBtn = page.locator('[data-testid="connect-wallet"]')
      .or(page.getByRole('button', { name: /Connect wallet/i }))
      .or(page.locator('text=Connect Wallet'))
      .or(page.locator('text=Connect wallet'));

    const cancelBtn = page.locator('button.cancel_loan').first();
    const repayBtn = page.locator('button.repay_loan')
      .or(page.getByRole('button', { name: /Pay Full Balance/i }))
      .or(page.locator('button:has-text("Pay Full Balance")'))
      .first();

    // Wait up to 30s for one of these elements to be visible
    await expect(cancelBtn.or(repayBtn).or(connectBtn)).toBeVisible({ timeout: 30000 });

    if (await connectBtn.first().isVisible().catch(() => false)) {
      console.log(`[DIRECT NFT] Connect wallet button visible. Clicking connect...`);
      await connectBtn.first().click();
      await page.waitForTimeout(2000);
    }

    // Wait for cancel or repay button to be visible
    await expect(cancelBtn.or(repayBtn)).toBeVisible({ timeout: 30000 });

    if (await cancelBtn.isVisible().catch(() => false)) {
      console.log(`[DIRECT NFT] Leftover pending loan request is present. Cancelling...`);
      await borrowRequestPage.cancelLoanRequest();
      await borrowRequestPage.waitForLoanCancelledSuccess();
      await borrowRequestPage.closeLoanCancelledSuccess();
      console.log(`[DIRECT NFT] Leftover pending loan request cancelled successfully.`);
    } else if (await repayBtn.isVisible().catch(() => false)) {
      console.log(`[DIRECT NFT] Leftover active/funded loan is present. Repaying to free up the NFT...`);
      const payInterestButton = page.locator("//button[@class='repay_loan mb-2 bg_btn ng-star-inserted']")
        .or(page.getByRole('button', { name: /Pay Monthly Interest/i }))
        .or(page.locator('button:has-text("Pay Monthly Interest")'))
        .filter({ visible: true })
        .first();
      if (await payInterestButton.isVisible().catch(() => false)) {
        console.log(`[DIRECT NFT] Monthly interest button visible. Paying interest first...`);
        await borrowerDetailPage.repayMonthlyInterest();
        await borrowerDetailPage.waitForRepaymentResult().catch(() => {});
        await borrowerDetailPage.closeRepaymentResult().catch(() => {});
        await page.waitForTimeout(3000);
      }

      console.log(`[DIRECT NFT] Repaying full balance...`);
      await borrowerDetailPage.repayLoan();
      const repaySuccess = await borrowerDetailPage.waitForRepaymentResult();
      await borrowerDetailPage.closeRepaymentResult();
      console.log(`[DIRECT NFT] Repayment result: ${repaySuccess}`);
    } else {
      console.log(`[DIRECT NFT] Warning: neither cancel button nor repay button was found on the borrower detail page.`);
    }
    
    console.log(`[DIRECT NFT] Leftover cleanup complete. Returning to NFT detail page...`);
    await page.goto(detailUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  }

  const embeddedFormVisible = await page.getByText(/Loan amount requested/i).first().waitFor({ state: 'visible', timeout: 5000 }).then(() => true).catch(() => false);
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
  borrowerEmail?: string,
  borrowerPassword?: string,
): Promise<string> {
  let lastError = '';

  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      console.log(`[DIRECT NFT] Phase ${phase.phaseNum}: loan request attempt ${attempt}/4 for ${nftId}`);
      const assetName = await openDirectNftLoanForm(page, borrowRequestPage, nftId, borrowerEmail, borrowerPassword);
      const success = await submitConfiguredLoanRequest(borrowRequestPage, options);

      if (success) {
        console.log(`[DIRECT NFT] Phase ${phase.phaseNum}: loan request created successfully on attempt ${attempt}.`);
        return assetName;
      }

      lastError = 'Application returned a failed loan request result.';
      console.log(`[DIRECT NFT] Phase ${phase.phaseNum}: loan request failed on attempt ${attempt}/4.`);
    } catch (err: any) {
      lastError = err?.message || String(err);
      console.log(`[DIRECT NFT] Phase ${phase.phaseNum}: loan request attempt ${attempt}/4 threw: ${lastError}`);
    }

    await dismissResultOrBackdrop(page);
    if (attempt < 4) {
      await page.waitForTimeout(1000);
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

async function ensureLenderLoggedIn(page: Page, email: string, pass: string): Promise<void> {
  let currentUrl = page.url();
  if (currentUrl === 'about:blank') {
    console.log('[LENDER SESSION] Initial blank page detected. Navigating to login page to check session...');
    const loginPageObj = new LoginPage(page);
    await loginPageObj.open();
    await page.waitForURL(/\/(dashboard|my-wallet|lend|sign-in|login)/, { timeout: 10000 }).catch(() => {});
    currentUrl = page.url();
  }

  const isLoginPage = currentUrl.includes('/sign-in') || currentUrl.includes('/login');
  const headerLoginBtn = page.getByRole('button', { name: /Log in/i })
    .or(page.locator('button:has-text("Log in")'))
    .or(page.locator('a:has-text("Log in")'))
    .or(page.locator('text=Log in.'))
    .filter({ visible: true })
    .first();
  const isHeaderLoginVisible = await headerLoginBtn.isVisible().catch(() => false);

  if (isLoginPage || isHeaderLoginVisible) {
    console.log('[LENDER SESSION] Detected logged-out state. Logging back in...');
    const loginPageObj = new LoginPage(page);
    await loginPageObj.open();
    await loginPageObj.login(email, pass);
    await expect(page).toHaveURL(/\/(dashboard|my-wallet|lend)/, { timeout: 30000 });
    console.log('[LENDER SESSION] Logged in successfully.');
  } else {
    console.log('[LENDER SESSION] Already logged in (session active).');
  }
}

async function acceptLoanWithRetry(
  lenderPage: Page,
  loanId: string,
  phaseNum: number,
  lenderEmail: string,
  lenderPassword: string,
): Promise<void> {
  let lastError = '';

  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      console.log(`[Lender] Phase ${phaseNum}: accepting loan ${loanId}, attempt ${attempt}/4...`);
      await lenderPage.bringToFront().catch(() => {});
      await ensureLenderLoggedIn(lenderPage, lenderEmail, lenderPassword);

      const lenderDetailPage = new LenderDetailPage(lenderPage);
      await lenderDetailPage.open(loanId);
      await lenderDetailPage.waitForPageLoaded();

      const lendingPageObj = new LendingPage(lenderPage);
      await lendingPageObj.submitTermsAndConfirm();
      const lendSuccess = await lendingPageObj.waitForTermsSubmissionResult();
      await lendingPageObj.closeTermsSubmissionResult();

      if (lendSuccess) {
        console.log(`[Lender] Phase ${phaseNum}: loan ${loanId} accepted successfully on attempt ${attempt}.`);
        return;
      }

      lastError = 'Application returned a failed lending result.';
      console.log(`[Lender] Phase ${phaseNum}: lending failed on attempt ${attempt}/4.`);
    } catch (err: any) {
      lastError = err?.message || String(err);
      console.log(`[Lender] Phase ${phaseNum}: lending attempt ${attempt}/4 threw: ${lastError}`);
    }

    if (attempt < 4) {
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }

  throw new Error(`[Lender] Phase ${phaseNum}: loan ${loanId} failed to lend after 4 attempts. Last error: ${lastError}`);
}

test.describe('Borrower loan repayment flows', () => {
  test('completes repayment phases using configured borrower, lender, and NFT collateral', async ({
    loginPage,
    walletPage,
    page,
    browser,
  }) => {
    test.setTimeout(1800000);

    let lenderContext: BrowserContext | null = null;
    let lenderPage: Page | null = null;

    try {
      let capturedLoanId: string | null = null;
      const excludedUserIds = new Set<string>([
        '6a195238909b2903456069bb', // brooklyn user ID
        '69e203895dbd1b634136e1ed', // harish user ID
      ]);

    page.on('console', msg => console.log(`[BORROWER CONSOLE] ${msg.type()}: ${msg.text()}`));
    page.on('pageerror', err => console.log(`[BORROWER PAGE ERROR] ${err.message}`));
    page.on('response', async response => {
      const status = response.status();
      const url = response.url();
      if (url.includes('/api/v3/market-place/')) {
        try {
          const method = response.request().method();
          const body = await response.text();
          console.log(`[BORROWER API RESPONSE] ${method} ${url} -> Status ${status} -> Body: ${body.slice(0, 1000)}`);
          
          // Capture user IDs to exclude them from loan IDs
          if ((url.includes('/auth/me') || url.includes('/sign-in') || url.includes('/regulated-sign-in')) && (status === 200 || status === 201)) {
            try {
              const data = JSON.parse(body);
              const userId = data.data?._id || data.data?.id || data._id || data.id;
              if (userId && /^[a-fA-F0-9]{24}$/.test(userId)) {
                excludedUserIds.add(userId);
                console.log(`[NETWORK CAPTURE] Added user ID to exclusion list: ${userId}`);
              }
            } catch (e) {}
          }

          // 1. Precise loan request creation capture (POST /loan-request)
          if (url.endsWith('/loan-request') && method === 'POST' && (status === 200 || status === 201)) {
            try {
              const data = JSON.parse(body);
              const loanId = data.data?._id || data.data?.id || data._id || data.id;
              if (loanId && /^[a-fA-F0-9]{24}$/.test(loanId)) {
                console.log(`[NETWORK CAPTURE] Captured loan ID from POST loan-request response: ${loanId}`);
                capturedLoanId = loanId;
                return;
              }
            } catch (e) {}
          }

          // 2. Precise active negotiation list fetch or bids fetch capture
          if ((url.includes('/bids-for-loan-request') || url.includes('/loan-request/detail') || url.includes('/live-borrowing-list')) && method === 'GET') {
            try {
              const parsedUrl = new URL(url);
              const idParam = parsedUrl.searchParams.get('id') || parsedUrl.searchParams.get('loanId');
              if (idParam && /^[a-fA-F0-9]{24}$/.test(idParam)) {
                if (!excludedUserIds.has(idParam)) {
                  console.log(`[NETWORK CAPTURE] Captured loan ID from GET parameter: ${idParam}`);
                  capturedLoanId = idParam;
                  return;
                }
              }
            } catch (e) {}
          }

          // 3. Fallback matching parameter 'id' for bids or loan endpoints
          if (url.includes('id=') && (url.includes('bid') || url.includes('loan') || url.includes('borrow') || url.includes('lending'))) {
            try {
              const parsedUrl = new URL(url);
              const idParam = parsedUrl.searchParams.get('id');
              if (idParam && /^[a-fA-F0-9]{24}$/.test(idParam)) {
                if (!excludedUserIds.has(idParam)) {
                  console.log(`[NETWORK CAPTURE] Captured loan ID from query fallback: ${idParam}`);
                  capturedLoanId = idParam;
                  return;
                }
              }
            } catch (e) {}
          }
        } catch (e) {}
      }
      if (status >= 400) {
        try {
          const body = await response.text();
          console.log(`[BORROWER HTTP ERROR] ${response.request().method()} ${url} -> Status ${status} -> Body: ${body}`);
        } catch (e) {
          console.log(`[BORROWER HTTP ERROR] ${response.request().method()} ${url} -> Status ${status} (could not read body)`);
        }
      }
    });


    const uiConfig = readUiConfig();
    const borrowerEmailVal = process.env.REALWORLD_WEB2_EMAIL || uiConfig.borrowerEmail || 'brooklyn@yopmail.com';
    const borrowerPasswordVal = process.env.REALWORLD_WEB2_PASSWORD || uiConfig.borrowerPassword || 'Test@1233333';
    const lenderEmailVal = process.env.REALWORLD_LENDER_EMAIL || uiConfig.lenderEmail || 'harish@yopmail.com';
    const lenderPasswordVal = process.env.REALWORLD_LENDER_PASSWORD || uiConfig.lenderPassword || 'Test@1233333';
    const configuredLoanAmount = process.env.LOAN_AMOUNT || getLoanAmount(1000, 5000);
    const configuredApr = process.env.APR || getApr(10, 20);
    const configuredDuration = process.env.DURATION ? parseInt(process.env.DURATION, 10) : getDuration(90);
    const configuredNftId = normalizeNftId(process.env.NFT_ID || uiConfig.nftId);

    console.log(
      `[CONFIG] Repayment flow received borrower=${borrowerEmailVal}, lender=${lenderEmailVal}, ` +
      `amount=${configuredLoanAmount}, apr=${configuredApr}, duration=${configuredDuration}, ` +
      `nftId=${configuredNftId || 'wallet-discovery'}`,
    );

    await loginPage.open();
    await loginPage.login(borrowerEmailVal, borrowerPasswordVal);
    await expect(page).toHaveURL(/\/(dashboard|my-wallet)/, { timeout: 30000 });
    await walletPage.open();

    const borrowService = new BorrowService(page);
    console.log('[CLEANUP] Attempting to cancel any leftover negotiation request to free up the NFT...');
    const cancelled = await borrowService.cancelFirstWalletLoanRequestIfPresent(walletPage).catch(() => false);
    if (cancelled) {
      console.log('[CLEANUP] Cancelled leftover negotiation request. Waiting 10 seconds for blockchain sync...');
      await page.waitForTimeout(10000);
      await walletPage.open();
    }

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


    let assetName = '';
    let assetAppraisal = '';
    let phase1Success = false;
    const MAX_CYCLES = 2;

    if (configuredNftId) {
      assetName = await createDirectLoanRequestWithRetry(
        page,
        borrowRequestPage,
        configuredNftId,
        phases[0],
        {
          loanAmount: configuredLoanAmount,
          currency: '$RW',
          durationDays: configuredDuration,
          apr: configuredApr,
          interestRepayment: phases[0].interestRepayment,
          allowEarlyRepayment: phases[0].earlyRepayment,
        },
        borrowerEmailVal,
        borrowerPasswordVal,
      );
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
        capturedLoanId = null;
        assetName = await createDirectLoanRequestWithRetry(
          page,
          borrowRequestPage,
          configuredNftId,
          phase,
          {
            loanAmount: configuredLoanAmount,
            currency: '$RW',
            durationDays: configuredDuration,
            apr: configuredApr,
            interestRepayment: phase.interestRepayment,
            allowEarlyRepayment: phase.earlyRepayment,
          },
          borrowerEmailVal,
          borrowerPasswordVal,
        );
      } else {
        await walletPage.open();
        await walletPage.requestLoanForNftByNameAndAppraisal(assetName, assetAppraisal);
        await borrowRequestPage.waitForLoanForm();

        capturedLoanId = null;
        await submitConfiguredLoanRequest(borrowRequestPage, {
          loanAmount: configuredLoanAmount,
          currency: '$RW',
          durationDays: configuredDuration,
          apr: configuredApr,
          interestRepayment: phase.interestRepayment,
          allowEarlyRepayment: phase.earlyRepayment,
        });
      }

      // Wait for the captured loan ID with a timeout
      let loanId = capturedLoanId;
      if (!loanId) {
        console.log(`[CAPTURE] Loan ID not captured via network interception. Waiting a few seconds...`);
        for (let i = 0; i < 15 && !loanId; i++) {
          await page.waitForTimeout(1000);
          loanId = capturedLoanId;
        }
      }

      if (!loanId) {
        console.log(`[CAPTURE] Warning: Loan ID still not captured. Falling back to wallet-based URL extraction...`);
        loanId = await captureLoanIdFromWallet(page, walletPage, borrowerDetailPage, assetName);
      } else {
        console.log(`[CAPTURE] Successfully captured loan ID via network interception: ${loanId}`);
      }

      console.log(`Phase ${phase.phaseNum} Loan ID: ${loanId}`);

      if (!lenderContext || !lenderPage) {
        console.log(`[Lender] Creating persistent lender browser context and page...`);
        lenderContext = await browser.newContext();
        lenderPage = await lenderContext.newPage();
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
      }

      await acceptLoanWithRetry(lenderPage, loanId, phase.phaseNum, lenderEmailVal, lenderPasswordVal);

      await page.bringToFront();
      console.log(`[Borrower] Phase ${phase.phaseNum}: Navigating directly to borrower detail page for loan ${loanId}`);
      await borrowerDetailPage.open(loanId);
      
      await ensureBorrowerLoggedIn(page, borrowerEmailVal, borrowerPasswordVal);
      if (!page.url().includes(`/borrow-detail/${loanId}`)) {
        console.log(`[Borrower] Re-navigating to borrower detail page after login...`);
        await borrowerDetailPage.open(loanId);
      }
      
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
  } finally {
    if (lenderContext) {
      console.log('[CLEANUP] Closing persistent lender browser context...');
      await lenderContext.close().catch(() => {});
    }
  }
});
});

