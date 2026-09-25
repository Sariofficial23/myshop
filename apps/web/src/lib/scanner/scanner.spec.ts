import { afterEach, describe, expect, it } from 'vitest';
import { barcodeDetectorScanner } from './barcode-detector-scanner';
import { getCameraScanner, type BarcodeScanner } from './index';

const fake = (id: string, supported: boolean): BarcodeScanner => ({
  id,
  isSupported: () => supported,
  start: async () => ({ stop: () => undefined }),
});

afterEach(() => {
  delete (window as unknown as { BarcodeDetector?: unknown }).BarcodeDetector;
});

describe('getCameraScanner', () => {
  it('picks the first supported implementation', () => {
    expect(getCameraScanner([fake('a', false), fake('b', true), fake('c', true)])?.id).toBe('b');
  });

  it('returns undefined when no camera scanner is available (manual input fallback)', () => {
    expect(getCameraScanner([fake('a', false)])).toBeUndefined();
  });
});

describe('barcodeDetectorScanner', () => {
  it('is not supported without the BarcodeDetector API', () => {
    expect(barcodeDetectorScanner.isSupported()).toBe(false);
  });

  it('requires both BarcodeDetector and camera access', () => {
    (window as unknown as { BarcodeDetector: unknown }).BarcodeDetector = class {
      detect() {
        return Promise.resolve([]);
      }
    };
    // jsdom не даёт mediaDevices — камера недоступна
    expect(barcodeDetectorScanner.isSupported()).toBe(false);
  });
});
