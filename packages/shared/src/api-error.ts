import type { ErrorCode } from './error-codes.js';

/** Единый формат ошибки, который возвращает backend. */
export interface ApiErrorBody {
  error: {
    code: ErrorCode;
    /** Техническое сообщение (на английском) — для логов и разработчиков. */
    message: string;
    /** Дополнительные данные, например ошибки валидации по полям. */
    details?: unknown;
  };
  statusCode: number;
  path: string;
  timestamp: string;
  requestId?: string;
}
