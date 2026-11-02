import type {
  IHyperCore,
  HyperPlugin,
  SendRequest,
  UniversalResponse,
  HyperClientOptions,
  HyperttpError,
  RetryOptions,
} from "@hyperttp/types";

/**
 * @ru Хелпер для проверки, стоит ли вообще повторять этот тип ошибки
 */
function isRetriable(error: unknown): error is Partial<HyperttpError> {
  if (typeof error !== "object" || error === null) return false;

  const { code, status, statusCode } = error as Partial<HyperttpError>;
  const networkErrors = [
    "ECONNRESET",
    "ETIMEDOUT",
    "EADDRINUSE",
    "ECONNREFUSED",
    "EPIPE",
    "ENOTFOUND",
  ];

  if (code && networkErrors.includes(code)) return true;

  const responseStatus = status ?? statusCode;
  if (responseStatus && (responseStatus >= 500 || responseStatus === 429)) return true;

  return false;
}

export function withRetry(
  client: IHyperCore,
  options: RetryOptions,
  config?: HyperClientOptions,
): IHyperCore {
  const next = client.send.bind(client);

  const { maxRetries = 3, baseDelay = 100, maxDelay = 5000, jitter = true } = options;

  client.send = async <TOutput = unknown>(
    req: SendRequest,
  ): Promise<UniversalResponse<TOutput>> => {
    let attempt = 0;

    while (true) {
      try {
        return await next<TOutput>(req);
      } catch (error: unknown) {
        attempt++;

        if (attempt > maxRetries || !isRetriable(error)) {
          throw error;
        }

        let delay = baseDelay * Math.pow(2, attempt - 1);

        delay = Math.min(delay, maxDelay);

        if (jitter) {
          delay = Math.random() * delay;
        }

        if (config?.verbose) {
          config.logger?.(
            "warn",
            `Request failed. Retrying attempt ${attempt}/${maxRetries} after ${delay.toFixed(0)}ms. Error: ${error.message}`,
          );
        }

        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  };

  return client;
}

declare module "@hyperttp/types" {
  interface RetryOptions {
    enabled?: boolean;
  }
}

export const RetryPlugin: HyperPlugin = {
  name: "hyperttp-retry",
  phase: "CONTROL",
  enabled: (config) => config.retry?.enabled !== false,
  setup: ({ core, config }) => {
    withRetry(core, config.retry ?? {}, config);
  },
};
