import { type Page } from '@playwright/test';
import { ResaleRequestPage } from '../../pages/lender/ResaleRequestPage';

export class ResaleService {
  constructor(private readonly page: Page) {}

  async createResaleRequest(price: string): Promise<void> {
    const resaleRequestPage = new ResaleRequestPage(this.page);
    await resaleRequestPage.open();
    await resaleRequestPage.createResaleRequest(price);
  }
}

