import { expect } from '@playwright/test';
import { BasePage } from '../common/BasePage';

export class BorrowerDetailPage extends BasePage {
  async open(loanId: string): Promise<void> {
    await this.goto(`https://stagingmarket.realworld.fi/borrow-detail/${loanId}`);
  }

  async waitForPageLoaded(): Promise<void> {
    let borrowerLoaded = false;
    for (let retry = 0; retry < 5; retry++) {
      try {
        await expect(this.page.getByText('Collateral', { exact: true })).toBeVisible({ timeout: 30000 });
        borrowerLoaded = true;
        break;
      } catch (e) {
        console.log(`Borrower detail page load failed (retry ${retry + 1}/5). Reloading...`);
        await this.page.reload();
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
}
