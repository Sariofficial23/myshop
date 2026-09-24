import { ERROR_CODES, SUPPORTED_LOCALES } from '@myshop/shared';
import { describe, expect, it } from 'vitest';
import ru from '../../messages/ru.json';
import uz from '../../messages/uz.json';

type Messages = { [key: string]: string | Messages };

function flatKeys(messages: Messages, prefix = ''): string[] {
  return Object.entries(messages).flatMap(([key, value]) =>
    typeof value === 'string' ? [`${prefix}${key}`] : flatKeys(value, `${prefix}${key}.`),
  );
}

const catalogs: Record<string, Messages> = { ru, uz };

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
});
