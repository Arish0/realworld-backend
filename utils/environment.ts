import * as fs from 'fs';
import * as path from 'path';

export type EnvironmentName = 'dev' | 'staging' | 'prod';

export function loadEnvironment(envName: EnvironmentName = 'dev'): Record<string, string> {
  const envPath = path.resolve(process.cwd(), 'config', 'environments', `${envName}.env`);
  const content = fs.readFileSync(envPath, 'utf-8');

  return content
    .split(/\r?\n/)
    .filter((line) => line.trim() && !line.trim().startsWith('#'))
    .reduce<Record<string, string>>((acc, line) => {
      const [key, ...valueParts] = line.split('=');
      acc[key.trim()] = valueParts.join('=').trim();
      return acc;
    }, {});
}
