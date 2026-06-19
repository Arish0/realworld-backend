import { ROUTES } from '../../config/constants';
import { BasePage } from './BasePage';

export class ProfilePage extends BasePage {
  async open(): Promise<void> {
    await this.goto(ROUTES.profile);
  }
}

