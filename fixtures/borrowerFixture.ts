import { test as base } from '@playwright/test';
import { BorrowService } from '../services/borrower/BorrowService';
import { CounterOfferService } from '../services/borrower/CounterOfferService';
import { CounterRecounterService } from '../services/borrower/CounterRecounterService';
import { RedeemService } from '../services/borrower/RedeemService';
import { RefinanceService } from '../services/borrower/RefinanceService';
import { SellService } from '../services/borrower/SellService';

type BorrowerFixtures = {
  borrowService: BorrowService;
  borrowerCounterOfferService: CounterOfferService;
  counterRecounterService: CounterRecounterService;
  redeemService: RedeemService;
  refinanceService: RefinanceService;
  sellService: SellService;
};

export const test = base.extend<BorrowerFixtures>({
  borrowService: async ({ page }, use) => use(new BorrowService(page)),
  borrowerCounterOfferService: async ({ page }, use) => use(new CounterOfferService(page)),
  counterRecounterService: async ({ page }, use) => use(new CounterRecounterService(page)),
  redeemService: async ({ page }, use) => use(new RedeemService(page)),
  refinanceService: async ({ page }, use) => use(new RefinanceService(page)),
  sellService: async ({ page }, use) => use(new SellService(page)),
});

export { expect } from '@playwright/test';
