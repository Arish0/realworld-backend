import { type Page } from '@playwright/test';
import { LendingPage } from '../../pages/lender/LendingPage';

export class LendingService {
  constructor(private readonly page: Page) {}

  async lend(amount: string): Promise<void> {
    const lendingPage = new LendingPage(this.page);
    await lendingPage.open();
    await lendingPage.lend(amount);
  }

  async acceptFirstLoanOpportunity(): Promise<void> {
    const lendingPage = new LendingPage(this.page);
    await lendingPage.openFirstLoanOpportunity();
    await lendingPage.submitTermsAndConfirm();

    const success = await lendingPage.waitForTermsSubmissionResult();
    if (!success) {
      throw new Error('Lender terms submission failed for the first loan opportunity');
    }

    await lendingPage.closeTermsSubmissionResult();
  }
}
