import { type Page } from '@playwright/test';
import { RedeemRequestPage } from '../../pages/borrower/RedeemRequestPage';

export class RedeemService {
  constructor(private readonly page: Page) {}

  async redeem(): Promise<void> {
    const redeemRequestPage = new RedeemRequestPage(this.page);
    await redeemRequestPage.open();
    await redeemRequestPage.redeem();
  }
}

