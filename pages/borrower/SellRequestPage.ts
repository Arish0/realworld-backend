import { ROUTES } from '../../config/constants';
import { sellLocators } from '../../locators/borrower/sell.locator';
import { BasePage } from '../common/BasePage';

export class SellRequestPage extends BasePage {
  async open(): Promise<void> {
    await this.goto(ROUTES.borrower.sell);
  }

  async createSellRequest(price: string): Promise<void> {
    await this.fill(sellLocators.priceInput, price);
    await this.click(sellLocators.submitButton);
  }
}

