import * as fs from 'fs';
import * as path from 'path';

const localEnvFiles = ['.env.local', '.env'];
let localEnvLoaded = false;

export function loadTestData<T>(relativePath: string): T {
  const filePath = path.resolve(process.cwd(), relativePath);
  return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T;
}

export function resolveSecret(envName: string): string {
  loadLocalEnvFiles();

  const value = process.env[envName];
  if (!value) {
    throw new Error(
      `Missing required secret: ${envName}. Set it in your shell before running Playwright, or add it to a local ignored .env.local file.`,
    );
  }

  return value;
}

function loadLocalEnvFiles(): void {
  if (localEnvLoaded) {
    return;
  }

  localEnvLoaded = true;

  for (const relativePath of localEnvFiles) {
    const filePath = path.resolve(process.cwd(), relativePath);
    if (!fs.existsSync(filePath)) {
      continue;
    }

    const lines = fs.readFileSync(filePath, 'utf-8').split(/\r?\n/);
    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine || trimmedLine.startsWith('#')) {
        continue;
      }

      const separatorIndex = trimmedLine.indexOf('=');
      if (separatorIndex === -1) {
        continue;
      }

      const name = trimmedLine.slice(0, separatorIndex).trim();
      const rawValue = trimmedLine.slice(separatorIndex + 1).trim();
      if (!name || process.env[name]) {
        continue;
      }

      process.env[name] = rawValue.replace(/^['"]|['"]$/g, '');
    }
  }
}
