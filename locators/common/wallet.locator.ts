export const walletLocators = {
  connectButton: '[data-testid="connect-wallet"]',
  disconnectButton: '[data-testid="disconnect-wallet"]',
  walletAddress: '[data-testid="wallet-address"]',
  networkSelect: '[data-testid="wallet-network"]',
  nftCardsContainer: '#cards',
  nftCards: '#cards > div',
  nftTitle: 'h1',
  availableTab: 'li:has-text("Available")',
  negotiationTab: 'li:has-text("Negotiation")',
  firstNftBorrowButton:
    "xpath=//div[@id='cards']//div[1]//div[1]//div[1]//div[2]//div[4]//div[1]//a[1]",
  firstNftSellButton:
    "xpath=//div[@id='cards']//div[1]//div[1]//div[1]//div[2]//div[4]//div[1]//a[2]",
  firstNftRedeemButton:
    "xpath=//div[@id='cards']//div[1]//div[1]//div[1]//div[2]//div[4]//div[1]//a[3]",
} as const;
