import { describe, expect, it } from 'vitest';
import type { StockMovement } from '../api/stock';
import { movementDocument } from './documents';

const base = {
  purchase: null,
  sale: null,
  return: null,
  transfer: null,
  writeOff: null,
  inventory: null,
} as unknown as StockMovement;

describe('movementDocument', () => {
  it('labels and links the source document of a movement', () => {
    expect(movementDocument({ ...base, transfer: { id: 't1', number: 4 } })).toEqual({
      label: 'ПМ-4',
      href: '/transfers/t1',
    });
    expect(movementDocument({ ...base, return: { id: 'r1', number: 2 } })?.label).toBe('ВЗ-2');
    expect(movementDocument({ ...base, inventory: { id: 'i1', number: 1 } })?.href).toBe(
      '/inventories/i1',
    );
    expect(movementDocument(base)).toBeNull();
  });
});
