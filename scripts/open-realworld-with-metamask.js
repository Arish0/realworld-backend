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

  const page = context.pages()[0] || (await context.newPage());
  await page.goto('https://stagingmarket.realworld.fi/sign-in', { waitUntil: 'domcontentloaded' });
  await page.locator('#email').fill('brooklyn@yopmail.com');
  await page.locator('#password').fill('Test@1233333');
  await page.getByRole('button', { name: /^log in\.?$/i }).click();
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

