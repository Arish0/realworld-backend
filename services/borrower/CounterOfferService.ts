import { type Page } from '@playwright/test';
import { CounterOfferPage } from '../../pages/borrower/CounterOfferPage';

export class CounterOfferService {
  constructor(private readonly page: Page) {}

  async createCounterOffer(amount: string): Promise<void> {
    const counterOfferPage = new CounterOfferPage(this.page);
    await counterOfferPage.open();
    await counterOfferPage.createCounterOffer(amount);
  }
}

