# Realworld Playwright Test Automation

This project contains a Playwright test automation scaffold for Realworld borrower, lender, wallet, marketplace, and end-to-end flows.

## Structure

- `config`: environment files, constants, and test data
- `pages`: Playwright page objects
- `locators`: selector maps grouped by feature
- `services`: workflow helpers built on page objects
- `fixtures`: reusable Playwright fixtures
- `tests`: smoke, borrower, lender, and e2e specs
- `utils`: shared helpers

## Run

```bash
npx playwright test
```

Run the email/password user flow:

```bash
npm run test:web2
```

Run the MetaMask user flow separately:

```bash
set METAMASK_PASSWORD=your-password
npm run test:web3
```

## MetaMask

Tests that import from the project fixtures launch Chromium with MetaMask loaded from `extensions/metamask` by default.

Place an unpacked MetaMask Chrome extension in:

```text
extensions/metamask
```

Or point to another folder:

```bash
set METAMASK_EXTENSION_PATH=C:\path\to\metamask
npx playwright test
```
