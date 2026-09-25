import { barcodeDetectorScanner } from './barcode-detector-scanner';
import type { BarcodeScanner } from './types';

export type { BarcodeScanner, ScanSession } from './types';

/** Реализации в порядке приоритета. Добавьте сюда обёртку над другой библиотекой при необходимости. */
const SCANNERS: readonly BarcodeScanner[] = [barcodeDetectorScanner];

/** Первый доступный сканер камеры или undefined — тогда остаётся ручной ввод / USB-сканер. */
export function getCameraScanner(
  scanners: readonly BarcodeScanner[] = SCANNERS,
): BarcodeScanner | undefined {
  return scanners.find((scanner) => scanner.isSupported());
}
