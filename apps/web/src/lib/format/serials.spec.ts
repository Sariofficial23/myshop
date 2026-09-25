import { describe, expect, it } from 'vitest';
import { findDuplicates, parseSerialList } from './serials';

describe('parseSerialList', () => {
  it('splits by lines, commas and semicolons and trims', () => {
    expect(parseSerialList(' 490154203237518\n\n356938035643809 , 111;222 ')).toEqual([
      '490154203237518',
      '356938035643809',
      '111',
      '222',
    ]);
  });

  it('returns empty list for blank input', () => {
    expect(parseSerialList('  \n ')).toEqual([]);
  });
});

describe('findDuplicates', () => {
  it('reports repeated values once', () => {
    expect(findDuplicates(['a', 'b', 'a', 'a', 'c', 'b'])).toEqual(['a', 'b']);
    expect(findDuplicates(['a'])).toEqual([]);
  });
});
