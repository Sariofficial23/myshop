import type { BarcodeScanner, ScanSession } from './types';

interface DetectedBarcode {
  rawValue: string;
}

interface BarcodeDetectorLike {
  detect(source: HTMLVideoElement): Promise<DetectedBarcode[]>;
}

type BarcodeDetectorConstructor = new (options?: { formats?: string[] }) => BarcodeDetectorLike;

const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'qr_code'];

function getDetectorClass(): BarcodeDetectorConstructor | undefined {
  return typeof window === 'undefined'
    ? undefined
    : (window as unknown as { BarcodeDetector?: BarcodeDetectorConstructor }).BarcodeDetector;
}

/** Камера + встроенный в браузер BarcodeDetector (Chrome/Android, без сторонних библиотек). */
export const barcodeDetectorScanner: BarcodeScanner = {
  id: 'barcode-detector',

  isSupported() {
    return (
      getDetectorClass() !== undefined &&
      typeof navigator !== 'undefined' &&
      typeof navigator.mediaDevices?.getUserMedia === 'function'
    );
  },

  async start(video, onDetect): Promise<ScanSession> {
    const Detector = getDetectorClass();
    if (!Detector) throw new Error('BarcodeDetector is not supported');

    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' },
      audio: false,
    });
    video.srcObject = stream;
    await video.play();

    const detector = new Detector({ formats: FORMATS });
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const stop = () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      stream.getTracks().forEach((track) => track.stop());
      video.srcObject = null;
    };

    const tick = async () => {
      if (stopped) return;
      try {
        const [first] = await detector.detect(video);
        if (first?.rawValue) {
          stop();
          onDetect(first.rawValue);
          return;
        }
      } catch {
        // кадр не готов — пробуем снова
      }
      timer = setTimeout(tick, 250);
    };
    void tick();

    return { stop };
  },
};
