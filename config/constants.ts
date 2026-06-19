export const APP_NAME = 'Realworld';

export const DEFAULT_TIMEOUT = 30000;

export const ROUTES = {
  login: '/sign-in',
  marketplace: '/marketplace',
  wallet: '/my-wallet',
  profile: '/profile',
  borrower: {
    borrow: '/borrow',
    sell: '/sell',
    redeem: '/redeem',
    refinance: '/refinance',
    counterOffer: '/borrower/counter-offer',
    counterRecounter: '/borrower/counter-recounter',
  },
  lender: {
    lending: '/lend',
    resale: '/resale',
    counterOffer: '/lender/counter-offer',
  },
} as const;
