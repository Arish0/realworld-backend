import { ROUTES } from '../../config/constants';
import { borrowerCounterRecounterLocators } from '../../locators/borrower/counterRecounter.locator';
import { BasePage } from '../common/BasePage';

export class CounterRecounterPage extends BasePage {
  async open(): Promise<void> {
    await this.goto(ROUTES.borrower.counterRecounter);
  }

  async submitRecounterOffer(amount: string): Promise<void> {
    await this.fill(borrowerCounterRecounterLocators.amountInput, amount);
    await this.click(borrowerCounterRecounterLocators.submitButton);
  }
}
