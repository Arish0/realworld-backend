const path = require('path');
const { chromium } = require('playwright');

const defaultMetaMaskPath = path.join(
  process.env.LOCALAPPDATA || '',
  'BraveSoftware',
  'Brave-Browser',
  'User Data',
  'Default',
  'Extensions',
  'nkbihfbeogaeaoehlefnkodbefgpgknn',
  '13.32.1.0_0',
);

const metamaskPath = process.env.METAMASK_EXTENSION_PATH || defaultMetaMaskPath;
const userDataDir =
  process.env.METAMASK_USER_DATA_DIR || path.resolve(process.cwd(), 'playwright', '.auth', 'metamask-profile');

async function clickIfVisible(page, locator, timeout = 5000) {
  const target = page.locator(locator).first();
  if (await target.isVisible({ timeout }).catch(() => false)) {
    await target.click();
    return true;
  }

  return false;
}

async function approveMetaMask(context) {
  const popup =
    (await context.waitForEvent('page', { timeout: 15000 }).catch(() => null)) ||
    context.pages().find((page) => page.url().startsWith('chrome-extension://'));

  if (!popup) {
    console.log('MetaMask popup did not open. It may already be connected.');
    return;
  }

  await popup.bringToFront();
  await popup.waitForLoadState('domcontentloaded').catch(() => {});

  const passwordInput = popup.locator('input[type="password"]').first();
  if (await passwordInput.isVisible({ timeout: 3000 }).catch(() => false)) {
    const password = process.env.METAMASK_PASSWORD;
    if (!password) {
      console.log('MetaMask is locked. Set METAMASK_PASSWORD to unlock it automatically.');
      return;
    }

    await passwordInput.fill(password);
    await popup.getByRole('button', { name: /unlock/i }).click();
  }

  const approvalButtons = [
    'button:has-text("Next")',
    'button:has-text("Connect")',
    'button:has-text("Confirm")',
    'button:has-text("Approve")',
    'button:has-text("Sign")',
  ];

  for (let index = 0; index < 6; index += 1) {
    let clicked = false;
    for (const selector of approvalButtons) {
      clicked = await clickIfVisible(popup, selector, 2500);
      if (clicked) {
        await popup.waitForTimeout(1500);
        break;
      }
    }

    if (!clicked || popup.isClosed()) {
      break;
    }
  }
}

async function main() {
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    channel: 'chromium',
    viewport: null,
    args: [`--disable-extensions-except=${metamaskPath}`, `--load-extension=${metamaskPath}`],
  });

  const background =
    context.serviceWorkers()[0] || (await context.waitForEvent('serviceworker', { timeout: 15000 }).catch(() => null));
  console.log('MetaMask:', background ? background.url() : 'service worker not detected yet');

  const page = await context.newPage();
  await page.bringToFront();
  await page.goto('https://stagingmarket.realworld.fi/sign-in', { waitUntil: 'domcontentloaded' });

  if (page.url().includes('/dashboard') || page.url().includes('/my-wallet')) {
    console.log('RealWorld is already signed in.');
    console.log('RealWorld URL:', page.url());
    console.log('Browser will stay open for 10 minutes.');
    await page.waitForTimeout(600000);
    await context.close();
    return;
  }

  const connectWalletButton = page
    .getByRole('button', { name: /connect wallet/i })
    .or(page.locator('.signin-social-buttons button').nth(1))
    .or(page.locator('button').nth(1));
  if (!(await connectWalletButton.isVisible({ timeout: 15000 }).catch(() => false))) {
    console.log('Connect Wallet button was not visible.');
    console.log('Current RealWorld URL:', page.url());
    console.log('Page title:', await page.title().catch(() => 'unknown'));
    return;
  }

  await connectWalletButton.click();

  await approveMetaMask(context);

  await page.bringToFront();
  await page.waitForLoadState('networkidle').catch(() => {});
  console.log('RealWorld URL:', page.url());
  console.log('Browser will stay open for 10 minutes.');
  await page.waitForTimeout(600000);
  await context.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
