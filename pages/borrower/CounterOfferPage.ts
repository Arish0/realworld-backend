import { ROUTES } from '../../config/constants';
import { borrowerCounterOfferLocators } from '../../locators/borrower/counterOffer.locator';
import { BasePage } from '../common/BasePage';

export class CounterOfferPage extends BasePage {
  async open(): Promise<void> {
    await this.goto(ROUTES.borrower.counterOffer);
  }

  async createCounterOffer(amount: string): Promise<void> {
    await this.fill(borrowerCounterOfferLocators.amountInput, amount);
    await this.click(borrowerCounterOfferLocators.submitButton);
  }
}

