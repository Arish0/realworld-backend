export const borrowLocators = {
  amountInput: '#prinicipal',
  durationInput: 'input[type="text"].form-control.text-end',
  currencySelect: 'select.form-select',
  collateralSelect: '[data-testid="borrow-collateral"]',
  aprInput: 'input.form-control.text-end.border-0',
  advancedOptionsButton: 'button.viewoption-btn',
  durationOption: (days: number) => `xpath=//*[contains(@class,"duration-days")]//li[normalize-space()="${days}"]`,
  earlyRepaymentOption: (value: string) =>
    `xpath=//li[normalize-space()="${value}" or normalize-space()="${value}."]`,
  interestRepaymentOption: (value: string) =>
    `xpath=//li[normalize-space()="${value}" or normalize-space()="${value}."]`,
  submitButton: 'button:has-text("Request loan")',
  previewHeading: 'text=Are you sure you want to submit this loan request?',
  cancelPreviewHeading: 'text=Are you sure you want to cancel a loan request?',
  confirmButton: 'button:has-text("Confirm")',
  liveBorrowingLoanCards: '.nft-wrap-view',
  cancelLoanButton: 'button.cancel_loan',
  successMessage: '[data-testid="borrow-success"]',
} as const;
