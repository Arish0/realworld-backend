import { ROUTES } from '../../config/constants';
import { resaleLocators } from '../../locators/lender/resale.locator';
import { BasePage } from '../common/BasePage';

export class ResaleRequestPage extends BasePage {
  async open(): Promise<void> {
    await this.goto(ROUTES.lender.resale);
  }

  async createResaleRequest(price: string): Promise<void> {
    await this.fill(resaleLocators.priceInput, price);
    await this.click(resaleLocators.submitButton);
  }
}

