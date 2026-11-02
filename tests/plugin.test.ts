import type {
  HyperClientOptions,
  IHyperCore,
  SendRequest,
  UniversalResponse,
} from "@hyperttp/types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RetryPlugin, withRetry } from "../src/plugin.js";

const request: SendRequest = { protocol: "rest", input: { method: "GET", url: "/" } };
const response: UniversalResponse = {
  protocol: "rest",
  ok: true,
  status: 200,
  headers: {},
  data: { id: 1 },
};

function createClient(send: ReturnType<typeof vi.fn>, config: HyperClientOptions = {}) {
  return { send, config } as unknown as IHyperCore;
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("withRetry", () => {
  it("preserves the client binding, request and universal response", async () => {
    const send = vi.fn(function (this: IHyperCore, req: SendRequest) {
      expect(this).toBe(client);
      expect(req).toBe(request);
      return Promise.resolve(response);
    });
    const client = createClient(send);

    expect(withRetry(client, {})).toBe(client);
    await expect(client.send(request)).resolves.toBe(response);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("retries with exponential delay capped at maxDelay", async () => {
    vi.useFakeTimers();
    const send = vi
      .fn()
      .mockRejectedValueOnce({ code: "ECONNRESET" })
      .mockRejectedValueOnce({ status: 503 })
      .mockRejectedValueOnce({ statusCode: 429 })
      .mockResolvedValue(response);
    const client = withRetry(createClient(send), {
      baseDelay: 100,
      maxDelay: 150,
      jitter: false,
    });
    const result = client.send(request);

    await vi.advanceTimersByTimeAsync(99);
    expect(send).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(send).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(150);
    expect(send).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(150);
    await expect(result).resolves.toBe(response);
    expect(send).toHaveBeenCalledTimes(4);
  });

  it("propagates the original error when retries are exhausted", async () => {
    vi.useFakeTimers();
    const error = { code: "ETIMEDOUT" };
    const send = vi.fn().mockRejectedValue(error);
    const client = withRetry(createClient(send), { maxRetries: 2, baseDelay: 0 });
    const result = expect(client.send(request)).rejects.toBe(error);
    await vi.runAllTimersAsync();
    await result;
    expect(send).toHaveBeenCalledTimes(3);
  });

  it.each([null, undefined, "failure", new Error("failure"), { status: 400 }])(
    "does not retry non-retriable errors: %s",
    async (error) => {
      const send = vi.fn().mockRejectedValue(error);
      const client = withRetry(createClient(send), {});
      await expect(client.send(request)).rejects.toBe(error);
      expect(send).toHaveBeenCalledTimes(1);
    },
  );

  it("does not retry when maxRetries is zero", async () => {
    const error = { status: 503 };
    const send = vi.fn().mockRejectedValue(error);
    const client = withRetry(createClient(send), { maxRetries: 0 });
    await expect(client.send(request)).rejects.toBe(error);
    expect(send).toHaveBeenCalledTimes(1);
  });
});

describe("RetryPlugin", () => {
  it("is enabled by default and respects retry.enabled", () => {
    expect(RetryPlugin.enabled?.({})).toBe(true);
    expect(RetryPlugin.enabled?.({ retry: { enabled: false } })).toBe(false);
    expect(RetryPlugin.enabled?.({ retry: { enabled: true } })).toBe(true);
  });

  it("installs retries through setup and passes logging configuration", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const logger = vi.fn();
    const config: HyperClientOptions = {
      retry: { baseDelay: 100, maxRetries: 1 },
      verbose: true,
      logger,
    };
    const send = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error("reset"), { code: "ECONNRESET" }))
      .mockResolvedValue(response);
    const client = createClient(send, config);
    RetryPlugin.setup?.({ core: client, config });
    const result = client.send(request);

    await vi.advanceTimersByTimeAsync(49);
    expect(send).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await expect(result).resolves.toBe(response);
    expect(logger).toHaveBeenCalledWith("warn", expect.stringContaining("1/1 after 50ms"));
  });
});
