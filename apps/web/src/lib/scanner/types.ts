/**
 * Архитектура сканирования штрихкодов (ТЗ, раздел 25):
 *
 *   сканер (любая реализация) → строка штрихкода → frontend → GET /products/barcode/:code → backend
 *
 * Бизнес-логика не знает, чем отсканирован код: камера (BarcodeDetector),
 * Telegram-сканер, Bluetooth/USB-сканер (работает как клавиатура) или ручной ввод.
 * Новую библиотеку достаточно обернуть в интерфейс BarcodeScanner.
 */
export interface ScanSession {
  stop(): void;
}

export interface BarcodeScanner {
  readonly id: string;
  /** Доступен ли сканер в текущем окружении (браузер, разрешения API). */
  isSupported(): boolean;
  /** Запускает распознавание с видеопотока; onDetect вызывается один раз с первым кодом. */
  start(video: HTMLVideoElement, onDetect: (code: string) => void): Promise<ScanSession>;
}
