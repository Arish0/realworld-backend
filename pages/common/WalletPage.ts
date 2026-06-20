import { ROUTES } from '../../config/constants';
import { walletLocators } from '../../locators/common/wallet.locator';
import { BasePage } from './BasePage';

export class WalletPage extends BasePage {
  async open(): Promise<void> {
    for (let retry = 0; retry < 5; retry++) {
      try {
        const softLink = this.page.locator('a[href="/my-wallet"]').or(this.page.locator('a[routerlink="/my-wallet"]')).first();
        if (await softLink.isVisible().catch(() => false)) {
          console.log(`[Wallet] Navigating to wallet softly...`);
          await softLink.click();
        } else {
          console.log(`[Wallet] Soft navigation link not found. Performing hard navigation...`);
          await this.goto(ROUTES.wallet);
        }
        await this.waitForAssets({ timeout: 15000 });
        return;
      } catch (e) {
        console.log(`Wallet page assets failed to load (retry ${retry + 1}/5). Reloading...`);
        await this.page.reload();
      }
    }
    throw new Error('Wallet page assets failed to load after 5 attempts');
  }

  async connect(): Promise<void> {
    await this.click(walletLocators.connectButton);
  }

  async waitForAssets(options?: { timeout?: number }): Promise<void> {
    try {
      await this.page.locator(walletLocators.nftCardsContainer).waitFor({ state: 'visible', ...options });
    } catch (e) {
      const container = this.page.locator(walletLocators.nftCardsContainer);
      if ((await container.count()) > 0) {
        await this.page.waitForTimeout(2000);
        const cardCount = await this.page.locator(walletLocators.nftCards).count();
        if (cardCount === 0) {
          console.log('Wallet assets container is present but empty.');
          return;
        }
      }
      throw e;
    }
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
    const card = this.borrowableNftCardByName(assetName);
    await card.locator('a').nth(0).click();
  }

  async requestLoanForNftByNameAndAppraisal(assetName: string, appraisal: string): Promise<void> {
    await this.openAvailableAssets();
    const card = this.borrowableNftCardByNameAndAppraisal(assetName, appraisal);
    await card.locator('a').nth(0).click();
  }

  async getAppraisal(index: number): Promise<string> {
    const card = await this.borrowableNftCard(index);
    return await card.locator('.buying-value h4').innerText();
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
    for (let retry = 0; retry < 5; retry++) {
      try {
        const availableTab = this.page.locator(walletLocators.availableTab).first();
        if (await availableTab.isVisible({ timeout: 5000 }).catch(() => false)) {
          await availableTab.click();
        }
        await this.waitForAssets({ timeout: 15000 });
        return;
      } catch (e) {
        console.log(`Available assets failed to load (retry ${retry + 1}/5). Reloading page...`);
        await this.page.reload();
      }
    }
    throw new Error('Available assets failed to load after 5 attempts');
  }

  async openNegotiationAssets(): Promise<void> {
    for (let retry = 0; retry < 5; retry++) {
      try {
        const negotiationTab = this.page.locator(walletLocators.negotiationTab).first();
        if (await negotiationTab.isVisible({ timeout: 5000 }).catch(() => false)) {
          await negotiationTab.click();
        }
        await this.waitForAssets({ timeout: 15000 });
        return;
      } catch (e) {
        console.log(`Negotiation assets failed to load (retry ${retry + 1}/5). Reloading page...`);
        await this.page.reload();
      }
    }
    throw new Error('Negotiation assets failed to load after 5 attempts');
  }

  private nftCardByName(assetName: string) {
    return this.page
      .locator(walletLocators.nftCards)
      .filter({ has: this.page.locator(walletLocators.nftTitle, { hasText: assetName }) })
      .first();
  }

  private borrowableNftCardByName(assetName: string) {
    return this.page
      .locator(walletLocators.nftCards)
      .filter({ has: this.page.locator(walletLocators.nftTitle, { hasText: assetName }) })
      .filter({ has: this.page.locator('a') })
      .first();
  }

  private borrowableNftCardByNameAndAppraisal(assetName: string, appraisal: string) {
    return this.page
      .locator(walletLocators.nftCards)
      .filter({ has: this.page.locator(walletLocators.nftTitle, { hasText: assetName }) })
      .filter({ hasText: appraisal })
      .filter({ has: this.page.locator('a') })
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
