import { expect } from '@playwright/test';
import { BasePage } from '../common/BasePage';

export class BorrowerDetailPage extends BasePage {
  async open(loanId: string): Promise<void> {
    await this.goto(`https://stagingmarket.realworld.fi/borrow-detail/${loanId}`);
  }

  async waitForPageLoaded(): Promise<void> {
    const loanUrl = this.page.url();
    let borrowerLoaded = false;
    for (let retry = 0; retry < 5; retry++) {
      try {
        const connectBtn = this.page.locator('[data-testid="connect-wallet"]')
          .or(this.page.getByRole('button', { name: /Connect wallet/i }))
          .or(this.page.locator('text=Connect Wallet'))
          .or(this.page.locator('text=Connect wallet'));

        const contentSelectors = [
          this.page.getByText('Loan request terms', { exact: false }),
          this.page.getByText('Loan details', { exact: false }),
          this.page.getByText('Collateral', { exact: false }),
          this.page.getByText('Appraisal', { exact: false }),
          this.page.getByText('Negotiation', { exact: false }),
          this.page.getByText('Terms.', { exact: false }),
        ];

        // Wait up to 45s for either to be visible
        let found = false;
        let visibleContentLocator = null;
        for (let sec = 0; sec < 45; sec++) {
          if (await connectBtn.first().isVisible().catch(() => false)) {
            found = true;
            break;
          }

          for (const locator of contentSelectors) {
            const visibleInstance = locator.filter({ visible: true }).first();
            if (await visibleInstance.isVisible().catch(() => false)) {
              found = true;
              visibleContentLocator = visibleInstance;
              break;
            }
          }

          if (found) {
            break;
          }
          await this.page.waitForTimeout(1000);
        }

        if (!found) {
          throw new Error('Neither connect wallet button nor page content became visible');
        }

        if (await connectBtn.first().isVisible().catch(() => false)) {
          console.log(`[Borrower] Connect button visible. Clicking...`);
          await connectBtn.first().click();
          await this.page.waitForTimeout(2000);
        }

        if (visibleContentLocator) {
          await expect(visibleContentLocator).toBeVisible({ timeout: 15000 });
        } else {
          // If we connected the wallet, wait for one of the main indicators to load
          let contentAppeared = false;
          for (let sec = 0; sec < 15; sec++) {
            for (const locator of contentSelectors) {
              const visibleInstance = locator.filter({ visible: true }).first();
              if (await visibleInstance.isVisible().catch(() => false)) {
                contentAppeared = true;
                break;
              }
            }
            if (contentAppeared) break;
            await this.page.waitForTimeout(1000);
          }
          if (!contentAppeared) {
            throw new Error('Page content did not load after connecting wallet');
          }
        }

        borrowerLoaded = true;
        break;
      } catch (e) {
        console.log(`Borrower detail page load failed (retry ${retry + 1}/5). Saving screenshot...`);
        try {
          await this.page.screenshot({ path: `screenshots/borrower_detail_fail_retry_${retry + 1}.png`, fullPage: true });
        } catch (screenshotErr) {
          console.log(`Failed to take screenshot: ${screenshotErr}`);
        }
        
        // If we were redirected away from the borrower detail page, navigate back
        const currentUrl = this.page.url();
        if (!currentUrl.includes('/borrow-detail/')) {
          console.log(`[Borrower] Redirected away from borrower detail page to ${currentUrl}. Navigating back to ${loanUrl}...`);
          await this.page.goto(loanUrl, { waitUntil: 'domcontentloaded' }).catch(() => {});
        } else {
          console.log(`[Borrower] Still on borrow detail page. Performing reload...`);
          await this.page.reload().catch(() => {});
        }
      }
    }
    if (!borrowerLoaded) {
      throw new Error(`Borrower detail page failed to load`);
    }
  }

  async clickCounterButtonInNegotiationTable(): Promise<void> {
    const counterButton = this.page
      .locator('xpath=//div[normalize-space(text())="Negotiation."]/following::button[normalize-space()="Counter."]')
      .or(this.page.locator('xpath=//*[contains(text(), "Negotiation")]/following::button[normalize-space()="Counter." or normalize-space()="Counter"]'))
      .or(this.page.locator('//button[normalize-space()="Counter." and ancestor::*[contains(., "Negotiation")]]'))
      .or(this.page.locator('button:has-text("Counter.")'))
      .first();

    let visible = await counterButton.isVisible().catch(() => false);
    for (let retry = 0; retry < 5 && !visible; retry++) {
      console.log(`[Borrower] Counter button not visible. Waiting and reloading page (retry ${retry + 1}/5)...`);
      await this.page.waitForTimeout(3000);
      await this.page.reload();
      visible = await counterButton.isVisible().catch(() => false);
    }

    await expect(counterButton).toBeVisible({ timeout: 30000 });
    await counterButton.click();
    await this.page.waitForTimeout(2000);
  }

  async getAmountValue(): Promise<string> {
    const amountInput = this.page.locator('#prinicipal').filter({ visible: true }).first();
    await expect(amountInput).toBeVisible({ timeout: 20000 });
    return await amountInput.inputValue();
  }

  async getAprValue(): Promise<string> {
    const aprInput = this.page.locator('input.form-control.text-end.border-0').filter({ visible: true }).first();
    await expect(aprInput).toBeVisible({ timeout: 20000 });
    return await aprInput.inputValue();
  }

  async fillAmountAndApr(amount: string, apr: string): Promise<void> {
    const amountInput = this.page.locator('#prinicipal').filter({ visible: true }).first();
    await amountInput.click();
    await amountInput.press('Control+A');
    await amountInput.press('Backspace');
    await amountInput.fill('');
    await amountInput.type(amount);
    await amountInput.press('Tab');

    let amountValue = await amountInput.inputValue();
    if (amountValue !== amount) {
      console.log(`[Borrower] Warning: amount field value was "${amountValue}", expected "${amount}". Retrying fill...`);
      await amountInput.click();
      await amountInput.press('Control+A');
      await amountInput.press('Backspace');
      await amountInput.fill('');
      await amountInput.type(amount);
      await amountInput.press('Tab');
    }

    const aprInput = this.page.locator('input.form-control.text-end.border-0').filter({ visible: true }).first();
    await aprInput.click();
    await aprInput.press('Control+A');
    await aprInput.press('Backspace');
    await aprInput.fill('');
    await aprInput.type(apr);
    await aprInput.press('Tab');

    let aprValue = await aprInput.inputValue();
    if (aprValue !== apr) {
      console.log(`[Borrower] Warning: apr field value was "${aprValue}", expected "${apr}". Retrying fill...`);
      await aprInput.click();
      await aprInput.press('Control+A');
      await aprInput.press('Backspace');
      await aprInput.fill('');
      await aprInput.type(apr);
      await aprInput.press('Tab');
    }
  }

  async submitRecounterOffer(): Promise<void> {
    const borrowerSubmitButton = this.page
      .locator("//button[normalize-space()='Make counter offer.']")
      .or(this.page.getByRole('button', { name: 'Make counter offer.' }))
      .or(this.page.locator("//button[normalize-space()='Submit.']"))
      .or(this.page.getByRole('button', { name: /^Submit\.?$/i }))
      .or(this.page.getByRole('button', { name: /Request loan/i }))
      .filter({ visible: true })
      .first();
    await expect(borrowerSubmitButton).toBeVisible({ timeout: 20000 });
    await expect(borrowerSubmitButton).toBeEnabled({ timeout: 15000 });
    await borrowerSubmitButton.scrollIntoViewIfNeeded();
    await borrowerSubmitButton.click();
  }

  async confirmTransaction(): Promise<void> {
    const borrowerConfirmButton = this.page.getByRole('button', { name: /^Confirm\.?$/i }).last();
    await borrowerConfirmButton.waitFor({ state: 'visible', timeout: 30000 });
    await borrowerConfirmButton.click();
  }

  async waitForSuccessModal(): Promise<void> {
    try {
      await this.page.getByRole('button', { name: /Processing/i }).waitFor({ state: 'visible', timeout: 8000 });
    } catch (e) {
      console.log('Processing modal did not show or was too fast.');
    }
    const borrowerOkayButton = this.page.getByRole('button', { name: 'Okay.' });
    await borrowerOkayButton.waitFor({ state: 'visible', timeout: 120000 });
    await borrowerOkayButton.click();
  }

  async repayLoan(): Promise<void> {
    const repayButton = this.page.locator('button.repay_loan')
      .or(this.page.getByRole('button', { name: /Pay Full Balance/i }))
      .or(this.page.locator('button:has-text("Pay Full Balance")'))
      .filter({ visible: true })
      .first();
    await expect(repayButton, 'Expected Pay Full Balance button to be visible on borrow details page').toBeVisible({
      timeout: 30000,
    });
    await repayButton.scrollIntoViewIfNeeded();
    await repayButton.click();

    const confirmButton = this.page.locator('button.confirm-btn')
      .or(this.page.getByRole('button', { name: /^Confirm\.?$/i }))
      .or(this.page.locator('button:has-text("Confirm")'))
      .filter({ visible: true })
      .last();
    await expect(confirmButton, 'Expected Confirm button in repayment confirmation modal').toBeVisible({
      timeout: 15000,
    });
    await confirmButton.click();
  }

  async repayMonthlyInterest(): Promise<void> {
    const payInterestButton = this.page.locator("//button[@class='repay_loan mb-2 bg_btn ng-star-inserted']")
      .or(this.page.getByRole('button', { name: /Pay Monthly Interest/i }))
      .or(this.page.locator('button:has-text("Pay Monthly Interest")'))
      .filter({ visible: true })
      .first();
    await expect(payInterestButton, 'Expected Pay Monthly Interest button to be visible').toBeVisible({
      timeout: 30000,
    });
    await payInterestButton.scrollIntoViewIfNeeded();
    await payInterestButton.click();

    const confirmButton = this.page.locator('button.confirm-btn')
      .or(this.page.getByRole('button', { name: /^Confirm\.?$/i }))
      .or(this.page.locator('button:has-text("Confirm")'))
      .filter({ visible: true })
      .last();
    await expect(confirmButton, 'Expected Confirm button in monthly repayment modal').toBeVisible({
      timeout: 15000,
    });
    await confirmButton.click();
  }

  async waitForRepaymentResult(): Promise<boolean> {
    await this.page.getByRole('button', { name: /Processing/i }).waitFor({ state: 'visible', timeout: 30000 });
    await this.page.getByRole('button', { name: 'Okay.' }).waitFor({ state: 'visible', timeout: 120000 });
    return !(await this.page.locator('img[alt="failed"]').isVisible().catch(() => false));
  }

  async closeRepaymentResult(): Promise<void> {
    const okayButton = this.page.getByRole('button', { name: 'Okay.' }).filter({ visible: true }).first();
    if (await okayButton.isVisible().catch(() => false)) {
      await okayButton.click();
    }
    await this.page.locator('.modal').waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
    await this.page.locator('.modal-backdrop').waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
  }
}
