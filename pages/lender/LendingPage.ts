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
    const visible = await moreOpportunities.waitFor({ state: 'visible', timeout: 10000 }).then(() => true).catch(() => false);
    if (visible) {
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
    const termsTabLocators = [
      this.page.getByRole('tab', { name: 'Terms.', exact: true }),
      this.page.getByRole('tab', { name: 'Terms', exact: true }),
      this.page.locator('button').filter({ hasText: /^Terms\.$/ }),
      this.page.locator('button').filter({ hasText: /^Terms$/ }),
      this.page.locator(lendingLocators.termsTabButton),
      this.page.locator('li').filter({ hasText: /^Terms\.$/ }),
      this.page.locator('li').filter({ hasText: /^Terms$/ }),
      this.page.locator('a').filter({ hasText: /^Terms\.$/ }),
      this.page.locator('a').filter({ hasText: /^Terms$/ }),
      this.page.getByText('Terms.', { exact: true }),
      this.page.getByText('Terms', { exact: true }),
    ];

    let termsTabClicked = false;
    for (const locator of termsTabLocators) {
      const visibleInst = locator.filter({ visible: true }).first();
      if (await visibleInst.isVisible().catch(() => false)) {
        console.log(`[Lender] Clicking terms tab via locator: ${locator}`);
        await visibleInst.click();
        termsTabClicked = true;
        break;
      }
    }

    if (!termsTabClicked) {
      console.log(`[Lender] Warning: Could not find visible Terms tab sequentially. Trying default locator expect...`);
      const fallback = this.page.getByText('Terms.', { exact: true }).filter({ visible: true }).first();
      await expect(fallback).toBeVisible({ timeout: 15000 });
      await fallback.click();
    }
    await this.page.waitForTimeout(1000);

    const acceptButtonLocators = [
      this.page.locator(lendingLocators.acceptTermsButton),
      this.page.getByRole('button', { name: /Accept/i }),
      this.page.locator('button:has-text("Accept.")'),
      this.page.locator('button:has-text("Accept")'),
      this.page.getByText('Accept.', { exact: true }),
      this.page.getByText('Accept', { exact: true }),
    ];

    let acceptBtnClicked = false;
    for (const locator of acceptButtonLocators) {
      const visibleInst = locator.filter({ visible: true }).last();
      if (await visibleInst.isVisible().catch(() => false)) {
        console.log(`[Lender] Clicking accept button via locator: ${locator}`);
        await visibleInst.scrollIntoViewIfNeeded();
        await visibleInst.click({ force: true });
        acceptBtnClicked = true;
        break;
      }
    }

    if (!acceptBtnClicked) {
      console.log(`[Lender] Warning: Could not find visible Accept button sequentially. Trying fallback...`);
      const fallback = this.page.locator('button:has-text("Accept.")').filter({ visible: true }).last();
      await expect(fallback).toBeEnabled({ timeout: 15000 });
      await fallback.scrollIntoViewIfNeeded();
      await fallback.click({ force: true });
    }

    const confirmButtonLocators = [
      this.page.locator(lendingLocators.confirmButton),
      this.page.getByRole('button', { name: /^Confirm\.?$/i }),
      this.page.locator('button:has-text("Confirm.")'),
      this.page.locator('button:has-text("Confirm")'),
    ];

    let confirmBtnClicked = false;
    for (const locator of confirmButtonLocators) {
      const visibleInst = locator.filter({ visible: true }).last();
      if (await visibleInst.isVisible().catch(() => false)) {
        console.log(`[Lender] Clicking confirm button via locator: ${locator}`);
        await visibleInst.click();
        confirmBtnClicked = true;
        break;
      }
    }

    if (!confirmBtnClicked) {
      console.log(`[Lender] Warning: Could not find visible Confirm button sequentially. Trying fallback...`);
      const fallback = this.page.getByRole('button', { name: /^Confirm\.?$/i }).filter({ visible: true }).last();
      await expect(fallback).toBeEnabled({ timeout: 15000 });
      await fallback.click();
    }
  }

  async waitForTermsSubmissionResult(): Promise<boolean> {
    await this.page.getByRole('button', { name: /Processing/i }).waitFor({ state: 'visible', timeout: 30000 });
    await this.page.getByRole('button', { name: 'Okay.' }).waitFor({ state: 'visible', timeout: 120000 });
    return !(await this.page.locator('img[alt="failed"]').isVisible().catch(() => false));
  }

  async closeTermsSubmissionResult(): Promise<void> {
    const okayButton = this.page.getByRole('button', { name: 'Okay.' }).filter({ visible: true }).first();
    if (await okayButton.isVisible().catch(() => false)) {
      await okayButton.click();
    }
    await this.page.locator('.modal').waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
    await this.page.locator('.modal-backdrop').waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
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
