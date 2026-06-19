import { ROUTES } from '../../config/constants';
import { walletLocators } from '../../locators/common/wallet.locator';
import { BasePage } from './BasePage';

export class WalletPage extends BasePage {
  async open(): Promise<void> {
    await this.goto(ROUTES.wallet);
  }

  async connect(): Promise<void> {
    await this.click(walletLocators.connectButton);
  }

  async waitForAssets(): Promise<void> {
    await this.page.locator(walletLocators.nftCardsContainer).waitFor({ state: 'visible' });
  }

  async nftCount(): Promise<number> {
    return this.page.locator(walletLocators.nftCards).count();
  }

  async borrowableNftCount(): Promise<number> {
    const cards = this.page.locator(walletLocators.nftCards);
    const count = await cards.count();
    let borrowableCount = 0;

    for (let index = 0; index < count; index += 1) {
      if ((await cards.nth(index).locator('a').count()) > 0) {
        borrowableCount += 1;
      }
    }

    return borrowableCount;
  }

  async nftName(index = 0): Promise<string> {
    const card = await this.borrowableNftCard(index);
    return card.locator(walletLocators.nftTitle).innerText();
  }

  async nftNameFromCard(index = 0): Promise<string> {
    return this.page.locator(walletLocators.nftCards).nth(index).locator(walletLocators.nftTitle).innerText();
  }

  async requestLoanForNft(index = 0): Promise<void> {
    const card = await this.borrowableNftCard(index);
    await card.locator('a').nth(0).click();
  }

  async requestLoanForFirstNft(): Promise<void> {
    await this.requestLoanForNft(0);
  }

  async requestLoanForNftByName(assetName: string): Promise<void> {
    await this.openAvailableAssets();
    const card = this.nftCardByName(assetName);
    await card.locator('a').nth(0).click();
  }

  async openNftCard(index = 0): Promise<void> {
    const card = this.page.locator(walletLocators.nftCards).nth(index);
    const loanIcon = card.getByRole('img', { name: 'loan' });
    if (await loanIcon.isVisible().catch(() => false)) {
      await loanIcon.click();
      return;
    }

    await card.click();
  }

  async openNftCardByName(assetName: string): Promise<void> {
    const card = this.nftCardByName(assetName);
    const loanIcon = card.getByRole('img', { name: 'loan' });
    if (await loanIcon.isVisible().catch(() => false)) {
      await loanIcon.click();
      return;
    }

    await card.click();
  }

  async openAvailableAssets(): Promise<void> {
    const availableTab = this.page.getByRole('listitem').filter({ hasText: /^Available/ }).first();
    if (await availableTab.isVisible({ timeout: 5000 }).catch(() => false)) {
      await availableTab.click();
    }
    await this.waitForAssets();
  }

  async openNegotiationAssets(): Promise<void> {
    await this.page.getByRole('listitem').filter({ hasText: /^Negotiation/ }).first().click();
    await this.waitForAssets();
  }

  private nftCardByName(assetName: string) {
    return this.page
      .locator(walletLocators.nftCards)
      .filter({ has: this.page.locator(walletLocators.nftTitle, { hasText: assetName }) })
      .first();
  }

  private async borrowableNftCard(index: number) {
    const cards = this.page.locator(walletLocators.nftCards);
    const count = await cards.count();
    let borrowableIndex = 0;

    for (let cardIndex = 0; cardIndex < count; cardIndex += 1) {
      const card = cards.nth(cardIndex);
      if ((await card.locator('a').count()) === 0) {
        continue;
      }

      if (borrowableIndex === index) {
        return card;
      }

      borrowableIndex += 1;
    }

    throw new Error(`No borrowable NFT found at index ${index}`);
  }
}
