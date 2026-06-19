import { type Page } from '@playwright/test';
import { type LoanRequestOptions } from '../../pages/borrower/BorrowRequestPage';
import { RefinanceRequestPage } from '../../pages/borrower/RefinanceRequestPage';

export class RefinanceService {
  constructor(private readonly page: Page) {}

  async createRefinanceRequest(amount: string): Promise<void> {
    const refinanceRequestPage = new RefinanceRequestPage(this.page);
    await refinanceRequestPage.open();
    await refinanceRequestPage.createRefinanceRequest(amount);
  }

  async openFirstActiveCollateralForUpdate(): Promise<void> {
    const refinanceRequestPage = new RefinanceRequestPage(this.page);
    await refinanceRequestPage.openFirstActiveCollateral();
  }

  async updateFirstActiveCollateral(options: LoanRequestOptions): Promise<void> {
    const refinanceRequestPage = new RefinanceRequestPage(this.page);
    await refinanceRequestPage.openFirstActiveCollateral();
    await refinanceRequestPage.applyUpdateOptions(options);
    await refinanceRequestPage.expectUpdateEnabled(true);
    await refinanceRequestPage.submitUpdate();
    await refinanceRequestPage.confirmUpdate();
    const success = await refinanceRequestPage.waitForUpdateResult();
    if (!success) {
      throw new Error('Active collateral loan update failed in the application confirmation modal');
    }
    await refinanceRequestPage.closeUpdateResult();
  }
}
