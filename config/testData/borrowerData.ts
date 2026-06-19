import { type LoanRequestOptions } from '../../pages/borrower/BorrowRequestPage';
import { loadTestData, resolveSecret } from '../../utils/testData';

export type BorrowerAccount = {
  email: string;
  passwordEnv: string;
};

export type LoanRequestScenario = LoanRequestOptions & {
  name: string;
  assetIndex: number;
  submitDefaultValues?: boolean;
};

export type BorrowerValidationScenario = LoanRequestOptions & {
  name: string;
  assetIndex: number;
  expectedSubmitEnabled: boolean;
};

export type ActiveCollateralUpdateScenario = LoanRequestOptions & {
  name: string;
  expectedUpdateEnabled: boolean;
  submit?: boolean;
};

export type BorrowerTestData = {
  defaultBorrower: BorrowerAccount;
  loanRequestScenarios: LoanRequestScenario[];
  edgeCases: BorrowerValidationScenario[];
  activeCollateralUpdateScenarios: ActiveCollateralUpdateScenario[];
};

export const borrowerData = loadTestData<BorrowerTestData>('config/testData/borrowerData.json');

export function borrowerEmail(): string {
  return process.env.REALWORLD_WEB2_EMAIL ?? borrowerData.defaultBorrower.email;
}

export function borrowerPassword(): string {
  return resolveSecret(borrowerData.defaultBorrower.passwordEnv);
}
