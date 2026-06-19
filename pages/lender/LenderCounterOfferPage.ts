import { ROUTES } from '../../config/constants';
import { lenderCounterOfferLocators } from '../../locators/lender/counterOffer.locator';
import { BasePage } from '../common/BasePage';

export class LenderCounterOfferPage extends BasePage {
  async open(): Promise<void> {
    await this.goto(ROUTES.lender.counterOffer);
  }

  async createCounterOffer(amount: string): Promise<void> {
    await this.fill(lenderCounterOfferLocators.amountInput, amount);
    await this.click(lenderCounterOfferLocators.submitButton);
  }
}

