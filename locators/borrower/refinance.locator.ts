export const refinanceLocators = {
  loanSelect: '[data-testid="refinance-loan"]',
  amountInput: '[data-testid="refinance-amount"]',
  borrowPageTabs: '.menuactivities',
  liveBorrowingTab: 'text=Live borrowing.',
  activeCollateralCards: '.nft-wrap-view',
  loanAmountInput: '#prinicipal',
  currencySelect: 'select.form-select',
  aprInput: 'input.form-control.text-end.border-0',
  durationOption: (days: number) => `xpath=//*[contains(@class,"duration-days")]//li[normalize-space()="${days}"]`,
  selectedDurationOption: (days: number) =>
    `xpath=//*[contains(@class,"duration-days")]//li[normalize-space()="${days}" and contains(@class,"active")]`,
  advancedOptionsButton: 'button.viewoption-btn',
  earlyRepaymentOption: (value: string) =>
    `xpath=//li[normalize-space()="${value}" or normalize-space()="${value}."]`,
  selectedEarlyRepaymentOption: (value: string) =>
    `xpath=//li[(normalize-space()="${value}" or normalize-space()="${value}.") and contains(@class,"active")]`,
  interestRepaymentOption: (value: string) =>
    `xpath=//li[normalize-space()="${value}" or normalize-space()="${value}."]`,
  updateButton: 'button:has-text("Update")',
  updatePreviewHeading: 'text=Are you sure you want to update',
  submitButton: '[data-testid="refinance-submit"]',
  successMessage: '[data-testid="refinance-success"]',
} as const;
