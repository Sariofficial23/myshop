import { randomBytes } from 'node:crypto';

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // без I, L, O, U — не путаются при вводе

/** Короткий случайный SKU, например "P-7K3M9Q2A". Коллизия практически невозможна (32^8). */
export function generateSku(prefix = 'P'): string {
  const bytes = randomBytes(8);
  let body = '';
  for (const byte of bytes) body += ALPHABET[byte % ALPHABET.length];
  return `${prefix}-${body}`;
}

/** SKU варианта по умолчанию: единственный вариант — SKU товара, иначе с номером. */
export function variantSku(productSku: string, index: number, total: number): string {
  return total === 1 ? productSku : `${productSku}-${index + 1}`;
}
