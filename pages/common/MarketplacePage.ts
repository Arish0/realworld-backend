import { ROUTES } from '../../config/constants';
import { marketplaceLocators } from '../../locators/common/marketplace.locator';
import { BasePage } from './BasePage';

export class MarketplacePage extends BasePage {
  async open(): Promise<void> {
    await this.goto(ROUTES.marketplace);
  }

  async search(query: string): Promise<void> {
    await this.fill(marketplaceLocators.searchInput, query);
  }
}

