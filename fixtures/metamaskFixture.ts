import * as fs from 'fs';
import * as path from 'path';
import { chromium, expect, test as base, type BrowserContext } from '@playwright/test';

const defaultMetaMaskExtensionPath = path.join(
  process.env.LOCALAPPDATA || '',
  'BraveSoftware',
  'Brave-Browser',
  'User Data',
  'Default',
  'Extensions',
  'nkbihfbeogaeaoehlefnkodbefgpgknn',
  '13.32.1.0_0',
);

const metamaskExtensionPath =
  process.env.METAMASK_EXTENSION_PATH ??
  (fs.existsSync(defaultMetaMaskExtensionPath)
    ? defaultMetaMaskExtensionPath
    : path.resolve(process.cwd(), 'extensions', 'metamask'));

const userDataDir =
  process.env.METAMASK_USER_DATA_DIR ?? path.resolve(process.cwd(), 'playwright', '.auth', 'metamask-profile');

type MetaMaskFixtures = {
  extensionId: string;
};

export const test = base.extend<MetaMaskFixtures>({
  context: async ({}, use) => {
    if (!fs.existsSync(metamaskExtensionPath)) {
      throw new Error(
        [
          `MetaMask extension was not found at: ${metamaskExtensionPath}`,
          'Download the MetaMask Chrome extension as an unpacked folder, or set METAMASK_EXTENSION_PATH to its folder path.',
        ].join('\n'),
      );
    }

    const context = await chromium.launchPersistentContext(userDataDir, {
      channel: 'chromium',
      headless: false,
      args: [
        `--disable-extensions-except=${metamaskExtensionPath}`,
        `--load-extension=${metamaskExtensionPath}`,
      ],
    });

    await use(context);
    await context.close();
  },

  page: async ({ context }, use) => {
    const page = context.pages()[0] ?? (await context.newPage());
    await use(page);
  },

  extensionId: async ({ context }, use) => {
    const background = await getExtensionBackground(context);
    const extensionId = background.url().split('/')[2];
    await use(extensionId);
  },
});

async function getExtensionBackground(context: BrowserContext) {
  const existingBackground = context.serviceWorkers()[0];
  if (existingBackground) {
    return existingBackground;
  }

  return context.waitForEvent('serviceworker');
}

export { expect };
