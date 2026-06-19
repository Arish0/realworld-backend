import { test as base } from '@playwright/test';
import { CounterOfferService } from '../services/lender/CounterOfferService';
import { LendingService } from '../services/lender/LendingService';
import { ResaleService } from '../services/lender/ResaleService';

type LenderFixtures = {
  lenderCounterOfferService: CounterOfferService;
  lendingService: LendingService;
  resaleService: ResaleService;
};

export const test = base.extend<LenderFixtures>({
  lenderCounterOfferService: async ({ page }, use) => use(new CounterOfferService(page)),
  lendingService: async ({ page }, use) => use(new LendingService(page)),
  resaleService: async ({ page }, use) => use(new ResaleService(page)),
});

export { expect } from '@playwright/test';
