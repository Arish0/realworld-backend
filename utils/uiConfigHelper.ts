import * as fs from 'fs';
import * as path from 'path';

export interface UiConfig {
  borrowerEmail?: string;
  borrowerPassword?: string;
  lenderEmail?: string;
  lenderPassword?: string;
  flow?: string;
  loanAmountMin?: number;
  loanAmountMax?: number;
  aprMin?: number;
  aprMax?: number;
  duration?: number | 'random';
  interestRepayment?: 'End of loan.' | 'Monthly.' | 'random';
  allowEarlyRepayment?: 'Yes.' | 'No.' | 'random';
  iterations?: number;
  nftId?: string;
}

export function readUiConfig(): UiConfig {
  const configPath = path.resolve(process.cwd(), 'config/uiConfig.json');
  if (fs.existsSync(configPath)) {
    try {
      return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    } catch (e) {
      console.error('Failed to parse uiConfig.json:', e);
    }
  }
  return {};
}

function getRandomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function getRandomElement<T>(array: T[]): T {
  return array[Math.floor(Math.random() * array.length)];
}

export function getLoanAmount(minDefault = 1000, maxDefault = 5000): string {
  const config = readUiConfig();
  const min = config.loanAmountMin !== undefined ? config.loanAmountMin : minDefault;
  const max = config.loanAmountMax !== undefined ? config.loanAmountMax : maxDefault;
  return getRandomInt(min, max).toString();
}

export function getApr(minDefault = 10, maxDefault = 20): string {
  const config = readUiConfig();
  const min = config.aprMin !== undefined ? config.aprMin : minDefault;
  const max = config.aprMax !== undefined ? config.aprMax : maxDefault;
  return getRandomInt(min, max).toString();
}

export function getDuration(defaultVal = 90): number {
  const config = readUiConfig();
  if (config.duration === 'random') {
    return getRandomElement([30, 90, 180, 365]);
  }
  return typeof config.duration === 'number' ? config.duration : defaultVal;
}

export function getInterestRepayment(defaultVal: 'End of loan.' | 'Monthly.' = 'End of loan.'): 'End of loan.' | 'Monthly.' {
  const config = readUiConfig();
  if (config.interestRepayment === 'random') {
    return getRandomElement(['End of loan.', 'Monthly.']);
  }
  return config.interestRepayment || defaultVal;
}

export function getAllowEarlyRepayment(defaultVal: 'Yes.' | 'No.' = 'Yes.'): 'Yes.' | 'No.' {
  const config = readUiConfig();
  if (config.allowEarlyRepayment === 'random') {
    return getRandomElement(['Yes.', 'No.']);
  }
  return config.allowEarlyRepayment || defaultVal;
}

export function getIterations(defaultVal = 10): number {
  const config = readUiConfig();
  return typeof config.iterations === 'number' ? config.iterations : defaultVal;
}


