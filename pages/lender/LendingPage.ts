import { ROUTES } from '../../config/constants';
import { lendingLocators } from '../../locators/lender/lending.locator';
import { BasePage } from '../common/BasePage';
import { expect } from '@playwright/test';

export class LendingPage extends BasePage {
  async open(): Promise<void> {
    await this.goto(ROUTES.lender.lending);
  }

  async lend(amount: string): Promise<void> {
    await this.fill(lendingLocators.amountInput, amount);
    await this.click(lendingLocators.lendButton);
  }

  async openMoreOpportunities(): Promise<void> {
    const moreOpportunities = this.page.locator(lendingLocators.moreOpportunitiesButton).first();
    if (await moreOpportunities.isVisible({ timeout: 10000 }).catch(() => false)) {
      await moreOpportunities.click();
    }
  }

  async openFirstLoanOpportunity(): Promise<void> {
    await this.open();

    const loanCard = await this.findFirstLoanOpportunity();
    await expect(loanCard, 'Expected at least one loan request to be visible in lend opportunities').toBeVisible({
      timeout: 30000,
    });
    await loanCard.click();
    await expect(this.page.getByText('Collateral', { exact: true })).toBeVisible({ timeout: 30000 });
  }

  async submitTermsAndConfirm(): Promise<void> {
    await this.page.locator(lendingLocators.termsTabButton).filter({ visible: true }).click();
    await this.page.waitForTimeout(1000);

    const acceptButton = this.page.locator(lendingLocators.acceptTermsButton).filter({ visible: true }).last();
    await expect(acceptButton, 'Expected visible Accept button after opening lender Terms tab').toBeEnabled({
      timeout: 30000,
    });
    await acceptButton.scrollIntoViewIfNeeded();
    await acceptButton.click({ force: true });

    const confirmButton = this.page.locator(lendingLocators.confirmButton).filter({ visible: true }).last();
    await expect(confirmButton, 'Expected visible Confirm button in lender terms popup').toBeEnabled({
      timeout: 30000,
    });
    await confirmButton.click();
  }

  async waitForTermsSubmissionResult(): Promise<boolean> {
    await this.page.getByRole('button', { name: /Processing/i }).waitFor({ state: 'visible', timeout: 30000 });
    await this.page.getByRole('button', { name: 'Okay.' }).waitFor({ state: 'visible', timeout: 120000 });
    return !(await this.page.locator('img[alt="failed"]').isVisible().catch(() => false));
  }

  async closeTermsSubmissionResult(): Promise<void> {
    await this.page.getByRole('button', { name: 'Okay.' }).click();
  }

  private async findFirstLoanOpportunity() {
    const loanCard = this.page.locator(lendingLocators.requestCard).first();
    const tabs = [/^Lending opportunities/i, /^All loans/i];

    for (let attempt = 0; attempt < 6; attempt += 1) {
      await this.openMoreOpportunities();

      if (await loanCard.isVisible({ timeout: 5000 }).catch(() => false)) {
        return loanCard;
      }

      for (const tabName of tabs) {
        const tab = this.page.getByRole('listitem').filter({ hasText: tabName }).first();
        if (await tab.isVisible({ timeout: 2000 }).catch(() => false)) {
          await tab.click();
          if (await loanCard.isVisible({ timeout: 5000 }).catch(() => false)) {
            return loanCard;
          }
        }
      }

      await this.page.reload();
    }

    return loanCard;
  }
}
