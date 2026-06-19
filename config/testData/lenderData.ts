import { loadTestData, resolveSecret } from '../../utils/testData';

export type LenderAccount = {
  email: string;
  passwordEnv: string;
  offerAmount: string;
};

export type LenderTestData = {
  defaultLender: LenderAccount;
};

export const lenderData = loadTestData<LenderTestData>('config/testData/lenderData.json');

export function lenderEmail(): string {
  return process.env.REALWORLD_LENDER_EMAIL ?? lenderData.defaultLender.email;
}

export function lenderPassword(): string {
  return resolveSecret(lenderData.defaultLender.passwordEnv);
}
