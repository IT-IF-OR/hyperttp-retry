import type {
  HyperCore,
  HyperPlugin,
  InternalRequest,
  HttpClientOptions,
  HyperttpError,
  RetryOptions,
} from "@hyperttp/core";

/**
 * @ru Хелпер для проверки, стоит ли вообще повторять этот тип ошибки
 */
function isRetriable(error: HyperttpError): boolean {
  const networkErrors = [
    "ECONNRESET",
    "ETIMEDOUT",
    "EADDRINUSE",
    "ECONNREFUSED",
    "EPIPE",
    "ENOTFOUND",
  ];

  if (error.code && networkErrors.includes(error.code)) return true;

  const status = error.status ?? error.statusCode;
  if (status && (status >= 500 || status === 429)) return true;

  return false;
}

export function withRetry(
  client: HyperCore,
  options: RetryOptions,
  config?: HttpClientOptions,
): HyperCore {
  const next = client.dispatch;

  const {
    maxRetries = 3,
    baseDelay = 100,
    maxDelay = 5000,
    jitter = true,
  } = options;

  client.dispatch = async <T>(req: InternalRequest): Promise<T> => {
    let attempt = 0;

    while (true) {
      try {
        return (await next<T>(req)) as T;
      } catch (error: any) {
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

declare module "@hyperttp/core" {
  interface HyperttpPluginsExtension {
    retry?: RetryOptions & { enabled?: boolean };
  }
}

export const RetryPlugin: HyperPlugin = {
  name: "hyperttp-retry",
  phase: "CONTROL",
  enabled: (config: HttpClientOptions) => config.retry?.enabled !== false,
  apply: (client: HyperCore, config: HttpClientOptions) => {
    return withRetry(client, config.retry || {});
  },
};
