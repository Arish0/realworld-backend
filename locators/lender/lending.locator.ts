export const lendingLocators = {
  requestCard: '.nft-wrap-view, .nft-wrap, .nft-card, .card',
  moreOpportunitiesButton: 'button:has-text("More opportunities"), a:has-text("More opportunities")',
  termsTabButton: '[role="tab"]:has-text("Terms"), button:has-text("Terms."), a:has-text("Terms.")',
  acceptTermsButton: 'button:has-text("Accept")',
  confirmButton: 'button:has-text("Confirm")',
  amountInput: '[data-testid="lend-amount"]',
  lendButton: '[data-testid="lend-submit"]',
  successMessage: '[data-testid="lend-success"]',
} as const;
