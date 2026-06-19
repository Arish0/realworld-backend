import { type Page } from '@playwright/test';
import { LenderCounterOfferPage } from '../../pages/lender/LenderCounterOfferPage';

export class CounterOfferService {
  constructor(private readonly page: Page) {}

  async createCounterOffer(amount: string): Promise<void> {
    const counterOfferPage = new LenderCounterOfferPage(this.page);
    await counterOfferPage.open();
    await counterOfferPage.createCounterOffer(amount);
  }
}

