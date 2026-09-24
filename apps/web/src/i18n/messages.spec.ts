import { ERROR_CODES, GRANTABLE_PERMISSIONS, ROLES, SUPPORTED_LOCALES } from '@myshop/shared';
import { describe, expect, it } from 'vitest';
import ru from '../../messages/ru.json';
import uz from '../../messages/uz.json';
import { permissionMessageKey } from './keys';

type Messages = { [key: string]: string | Messages };

function flatKeys(messages: Messages, prefix = ''): string[] {
  return Object.entries(messages).flatMap(([key, value]) =>
    typeof value === 'string' ? [`${prefix}${key}`] : flatKeys(value, `${prefix}${key}.`),
  );
}

const catalogs: Record<string, Messages> = { ru, uz };

function hasDot(messages: Messages): boolean {
  return Object.entries(messages).some(
    ([key, value]) => key.includes('.') || (typeof value === 'object' && hasDot(value)),
  );
}

describe('translations', () => {
  it('has a catalog for every supported locale', () => {
    expect(Object.keys(catalogs).toSorted()).toEqual(SUPPORTED_LOCALES.toSorted());
  });

  it('ru and uz have exactly the same keys', () => {
    expect(flatKeys(uz).toSorted()).toEqual(flatKeys(ru).toSorted());
  });

  it.each(Object.keys(catalogs))(
    '%s has a user-facing message for every API error code',
    (locale) => {
      const errors = catalogs[locale]!.errors as Record<string, string>;
      for (const code of [...ERROR_CODES, 'NETWORK_ERROR', 'UNKNOWN']) {
        expect(errors[code], `${locale}: errors.${code}`).toBeTruthy();
      }
    },
  );

  it.each(Object.keys(catalogs))('%s names every role and grantable permission', (locale) => {
    const keys = new Set(flatKeys(catalogs[locale]!));
    for (const role of ROLES) expect(keys, `${locale}: roles.${role}`).toContain(`roles.${role}`);
    for (const permission of GRANTABLE_PERMISSIONS) {
      expect(keys, `${locale}: ${permission}`).toContain(permissionMessageKey(permission));
    }
  });

  it('message keys never contain dots (next-intl treats them as nesting)', () => {
    expect(hasDot(ru)).toBe(false);
    expect(hasDot(uz)).toBe(false);
  });
});
