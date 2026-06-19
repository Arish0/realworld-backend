import { expect, type Locator, type Page } from '@playwright/test';

export class BasePage {
  constructor(protected readonly page: Page) {}

  async goto(path: string): Promise<void> {
    await this.page.goto(path);
  }

  async click(locator: string | Locator): Promise<void> {
    await this.resolve(locator).click();
  }

  async fill(locator: string | Locator, value: string): Promise<void> {
    await this.resolve(locator).fill(value);
  }

  async expectVisible(locator: string | Locator): Promise<void> {
    await expect(this.resolve(locator)).toBeVisible();
  }

  protected resolve(locator: string | Locator): Locator {
    return typeof locator === 'string' ? this.page.locator(locator) : locator;
  }
}

