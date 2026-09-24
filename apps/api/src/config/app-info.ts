import { readFileSync } from 'node:fs';

interface PackageJson {
  name: string;
  version: string;
}

// Путь одинаков для src/config и dist/config → apps/api/package.json
const pkg = JSON.parse(
  readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
) as PackageJson;

export const APP_NAME = 'myshop-api';
export const APP_VERSION = pkg.version;
