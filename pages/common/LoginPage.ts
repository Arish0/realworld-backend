import { ROUTES } from '../../config/constants';
import { loginLocators } from '../../locators/common/login.locator';
import { BasePage } from './BasePage';
import { WalletPage } from './WalletPage';

export class LoginPage extends BasePage {
  async open(): Promise<void> {
    await this.goto(ROUTES.login);
  }

  async login(email: string, password: string): Promise<void> {
    console.log(`[LOGIN] Attempting web2 login for ${email}`);

    await this.fill(loginLocators.emailInput, email);
    await this.fill(loginLocators.passwordInput, password);

    const authMeResponse = this.page
      .waitForResponse(
        response =>
          response.url().includes('/api/v3/market-place/auth/me') &&
          response.request().method() === 'GET' &&
          response.status() === 200,
        { timeout: 45000 },
      )
      .catch(() => null);

    await this.click(loginLocators.submitButton);

    const response = await authMeResponse;
    if (!response) {
      const loginError = this.page.locator(loginLocators.errorMessage);
      const errorText = (await loginError.textContent({ timeout: 2000 }).catch(() => null))?.trim();
      throw new Error(
        [
          `Login did not authenticate for ${email}.`,
          'Expected a successful GET /api/v3/market-place/auth/me after submitting credentials.',
          errorText ? `Login UI error: ${errorText}` : '',
          `Current URL: ${this.page.url()}`,
        ]
          .filter(Boolean)
          .join(' '),
      );
    }

    console.log(`[LOGIN] Authenticated ${email} with /auth/me status ${response.status()}`);
    try {
      const bodyText = await response.text().catch(() => '');
      console.log(`[LOGIN] /auth/me response body: ${bodyText}`);
      if (bodyText) {
        const data = JSON.parse(bodyText);
        const actualEmail = data.email || data.user?.email || data.data?.email || data.data?.user?.email;
        if (actualEmail && actualEmail.toLowerCase() !== email.toLowerCase()) {
          throw new Error(`Auth mismatch: /auth/me returned user "${actualEmail}", but expected login was "${email}"`);
        }
      }
    } catch (e: any) {
      console.log(`[LOGIN] Profile email verification info: ${e.message || e}`);
      if (e.message && e.message.includes('Auth mismatch')) {
        throw e;
      }
    }
  }

  async goToWallet(): Promise<WalletPage> {
    const walletPage = new WalletPage(this.page);
    await walletPage.open();
    return walletPage;
  }
}
