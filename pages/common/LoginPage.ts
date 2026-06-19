import { ROUTES } from '../../config/constants';
import { loginLocators } from '../../locators/common/login.locator';
import { BasePage } from './BasePage';

export class LoginPage extends BasePage {
  async open(): Promise<void> {
    await this.goto(ROUTES.login);
  }

  async login(email: string, password: string): Promise<void> {
    await this.fill(loginLocators.emailInput, email);
    await this.fill(loginLocators.passwordInput, password);
    await this.click(loginLocators.submitButton);
  }
}

