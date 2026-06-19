export function randomEmail(prefix = 'test'): string {
  return `${prefix}.${Date.now()}@example.com`;
}

export function randomAmount(min = 100, max = 10000): string {
  return String(Math.floor(Math.random() * (max - min + 1)) + min);
}

