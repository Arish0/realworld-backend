import { type Page } from '@playwright/test';
import { CounterRecounterPage } from '../../pages/borrower/CounterRecounterPage';

export class CounterRecounterService {
  constructor(private readonly page: Page) {}

  async submitRecounterOffer(amount: string): Promise<void> {
    const counterRecounterPage = new CounterRecounterPage(this.page);
    await counterRecounterPage.open();
    await counterRecounterPage.submitRecounterOffer(amount);
  }
}
