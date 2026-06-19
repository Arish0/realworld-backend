export const loginLocators = {
  emailInput: '#email',
  passwordInput: '#password',
  submitButton: 'button:has-text("Log in")',
  connectWalletButton: 'button:has-text("Connect Wallet")',
  errorMessage: '[data-testid="login-error"]',
} as const;
