import { ROUTES } from '../../config/constants';
import { redeemLocators } from '../../locators/borrower/redeem.locator';
import { BasePage } from '../common/BasePage';

export class RedeemRequestPage extends BasePage {
  async open(): Promise<void> {
    await this.goto(ROUTES.borrower.redeem);
  }

  async redeem(): Promise<void> {
    await this.click(redeemLocators.redeemButton);
  }
}

