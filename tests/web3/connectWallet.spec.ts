import { test, expect } from '../../fixtures/metamaskFixture';

const metamaskId = 'nkbihfbeogaeaoehlefnkodbefgpgknn';
const metamaskPassword = process.env.METAMASK_PASSWORD;

async function clickVisible(page: any, selectors: Array<string>, timeout = 2500): Promise<boolean> {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    if (await locator.isVisible({ timeout }).catch(() => false)) {
      await locator.click();
      return true;
    }
  }

  return false;
}

async function unlockIfNeeded(page: any): Promise<void> {
  const passwordInput = page.locator('input[type="password"]').first();
  if (!(await passwordInput.isVisible({ timeout: 3000 }).catch(() => false))) {
    return;
  }

  if (!metamaskPassword) {
    throw new Error('METAMASK_PASSWORD is required when MetaMask is locked.');
  }

  await passwordInput.fill(metamaskPassword);
  await page.getByRole('button', { name: /unlock/i }).click();
  await page.waitForTimeout(3000);
}

async function approveMetaMaskRequests(context: any): Promise<void> {
  for (let round = 0; round < 4; round += 1) {
    let notification = context.pages().reverse().find((page: any) => page.url().includes('/notification.html'));
    if (!notification) {
      notification = await context.newPage();
      await notification.goto(`chrome-extension://${metamaskId}/notification.html`, { waitUntil: 'domcontentloaded' });
    }

    await notification.bringToFront();
    await unlockIfNeeded(notification);

    const clicked = await clickVisible(notification, [
      'button:has-text("Next")',
      'button:has-text("Connect")',
      'button:has-text("Confirm")',
      'button:has-text("Approve")',
      'button:has-text("Sign")',
    ]);

    if (!clicked) {
      break;
    }

    await notification.waitForTimeout(3000);
  }
}

test.describe('Web3 wallet login', () => {
  test('connects RealWorld with MetaMask', async ({ page, context }) => {
    await page.goto('/sign-in', { waitUntil: 'domcontentloaded' });

    await page.getByRole('button', { name: /connect wallet/i }).click();
    await page.locator('w3m-modal button:has-text("MetaMask")').click();

    await approveMetaMaskRequests(context);

    await page.bringToFront();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 30000 });
  });
});

