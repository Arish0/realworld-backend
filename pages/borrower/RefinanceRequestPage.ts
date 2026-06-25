import { expect } from '@playwright/test';
import { ROUTES } from '../../config/constants';
import { refinanceLocators } from '../../locators/borrower/refinance.locator';
import { BasePage } from '../common/BasePage';
import { type LoanRequestOptions } from './BorrowRequestPage';

export class RefinanceRequestPage extends BasePage {
  async open(): Promise<void> {
    await this.goto(ROUTES.borrower.refinance);
  }

  async openBorrowing(): Promise<void> {
    await this.goto(ROUTES.borrower.borrow);
  }

  async createRefinanceRequest(amount: string): Promise<void> {
    await this.fill(refinanceLocators.amountInput, amount);
    await this.click(refinanceLocators.submitButton);
  }

  async openLiveBorrowing(): Promise<void> {
    await this.openBorrowing();
    const liveBorrowingTab = this.page.locator(refinanceLocators.borrowPageTabs).filter({ hasText: /^Live borrowing/ }).first();
    await expect(liveBorrowingTab, 'Expected Live borrowing tab on /borrow for active collateral updates').toBeVisible({
      timeout: 30000,
    });
    await liveBorrowingTab.click();
    await expect(
      this.page.locator(refinanceLocators.activeCollateralCards).first(),
      'Expected at least one active collateral NFT in Live borrowing',
    ).toBeVisible({ timeout: 30000 });
  }

  async openFirstActiveCollateral(): Promise<void> {
    await this.openLiveBorrowing();
    await this.page.locator(refinanceLocators.activeCollateralCards).first().click();
    await expect(this.page.getByText('Collateral', { exact: true })).toBeVisible();
  }

  async ensureActiveCollateralDetails(): Promise<void> {
    if (await this.page.getByText('Collateral', { exact: true }).isVisible().catch(() => false)) {
      return;
    }

    await this.openFirstActiveCollateral();
  }

  async applyUpdateOptions(options: LoanRequestOptions): Promise<void> {
    if (options.currency) {
      await this.page.locator(refinanceLocators.currencySelect).selectOption({ label: options.currency });
    }

    if (options.durationDays !== undefined) {
      await this.click(refinanceLocators.durationOption(options.durationDays));
    }

    if (options.apr !== undefined) {
      await this.setApr(options.apr);
    }

    if (options.interestRepayment || options.allowEarlyRepayment) {
      await this.showAdvancedOptions();
    }

    if (options.interestRepayment) {
      await this.click(refinanceLocators.interestRepaymentOption(options.interestRepayment));
    }

    if (options.allowEarlyRepayment) {
      await this.click(refinanceLocators.earlyRepaymentOption(options.allowEarlyRepayment));
    }

    if (options.loanAmount !== undefined) {
      await this.setLoanAmount(options.loanAmount);
    }
  }

  async setLoanAmount(amount: string): Promise<void> {
    const amountInput = this.page.locator(refinanceLocators.loanAmountInput);
    await amountInput.click();
    await amountInput.press('Control+A');
    await amountInput.press('Backspace');
    await amountInput.type(amount);
  }

  async setApr(apr: string): Promise<void> {
    const aprInput = this.page.locator(refinanceLocators.aprInput);
    await aprInput.click();
    await aprInput.press('Control+A');
    await aprInput.press('Backspace');
    await aprInput.type(apr);
  }

  async showAdvancedOptions(): Promise<void> {
    const advancedButton = this.page.getByRole('button', { name: /Advanced options/i });
    if (await advancedButton.isVisible().catch(() => false)) {
      await advancedButton.click();
    }
  }

  async expectUpdateEnabled(enabled: boolean): Promise<void> {
    const updateButton = this.page.getByRole('button', { name: /^Update$/ });
    if (enabled) {
      await expect(updateButton).toBeEnabled();
      return;
    }

    await expect(updateButton).toBeDisabled();
  }

  async submitUpdate(): Promise<void> {
    await this.page.getByRole('button', { name: /^Update$/ }).click();
  }

  async confirmUpdate(): Promise<void> {
    await this.page.getByRole('button', { name: /^Confirm$/ }).click();
  }

  async waitForUpdateResult(): Promise<boolean> {
    await this.page.getByRole('button', { name: /Processing/i }).waitFor({ state: 'visible', timeout: 30000 });
    await this.page.getByRole('button', { name: 'Okay.' }).waitFor({ state: 'visible', timeout: 120000 });
    return !(await this.page.locator('img[alt="failed"]').isVisible().catch(() => false));
  }

  async closeUpdateResult(): Promise<void> {
    const okayButton = this.page.getByRole('button', { name: 'Okay.' }).filter({ visible: true }).first();
    if (await okayButton.isVisible().catch(() => false)) {
      await okayButton.click();
    }
    await this.page.locator('.modal').waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
    await this.page.locator('.modal-backdrop').waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
  }

  async updateAndConfirm(options: LoanRequestOptions): Promise<void> {
    await this.ensureActiveCollateralDetails();
    await this.applyUpdateOptions(options);
    await this.expectUpdateOptionsApplied(options);

    await this.expectUpdateEnabled(true);
    await this.submitUpdate();
    await this.confirmUpdate();

    const success = await this.waitForUpdateResult();
    expect(success, 'Expected active collateral update to finish successfully').toBeTruthy();
    await this.closeUpdateResult();
  }

  async expectUpdateOptionsApplied(options: LoanRequestOptions): Promise<void> {
    if (options.loanAmount !== undefined) {
      await expect(this.page.locator(refinanceLocators.loanAmountInput)).toHaveValue(options.loanAmount);
    }

    if (options.currency) {
      await expect
        .poll(() => this.selectedCurrencyText(), { message: `Expected selected currency to be ${options.currency}` })
        .toBe(options.currency);
    }

    if (options.durationDays !== undefined) {
      await expect(this.page.locator(refinanceLocators.selectedDurationOption(options.durationDays))).toBeVisible();
    }

    if (options.apr !== undefined) {
      await expect(this.page.locator(refinanceLocators.aprInput)).toHaveValue(options.apr);
    }

    if (options.allowEarlyRepayment) {
      await expect(this.page.locator(refinanceLocators.selectedEarlyRepaymentOption(options.allowEarlyRepayment))).toBeVisible();
    }
  }

  private async selectedCurrencyText(): Promise<string> {
    return this.page.locator(refinanceLocators.currencySelect).evaluate((select) => {
      const selectedOption = (select as HTMLSelectElement).selectedOptions.item(0);
      return selectedOption?.textContent?.trim() ?? '';
    });
  }
}
