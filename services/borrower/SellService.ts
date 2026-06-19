import { type Page } from '@playwright/test';
import { SellRequestPage } from '../../pages/borrower/SellRequestPage';

export class SellService {
  constructor(private readonly page: Page) {}

  async createSellRequest(price: string): Promise<void> {
    const sellRequestPage = new SellRequestPage(this.page);
    await sellRequestPage.open();
    await sellRequestPage.createSellRequest(price);
  }
}

