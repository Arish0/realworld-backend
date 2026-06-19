import * as path from 'path';
import { type Page } from '@playwright/test';

export async function captureScreenshot(page: Page, name: string): Promise<void> {
  await page.screenshot({
    path: path.resolve(process.cwd(), 'screenshots', `${name}.png`),
    fullPage: true,
  });
}
