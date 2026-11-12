import type { IHyperCore, HyperPlugin, SendRequest, UniversalResponse, HyperClientOptions, RetryOptions } from "@hyperttp/types";
export interface RetryDecision {
    request: SendRequest;
    /** One-based retry number. */
    attempt: number;
    response?: UniversalResponse;
    error?: unknown;
}
declare module "@hyperttp/types" {
    interface RetryOptions {
        enabled?: boolean;
        /** Total elapsed budget including attempts and delays; does not interrupt an active send. */
        maxElapsedMs?: number;
        /** Explicit opt-in policy for other methods/protocols. Body replay safety is still enforced. */
        shouldRetry?: (decision: RetryDecision) => boolean | Promise<boolean>;
    }
}
export declare function withRetry(client: IHyperCore, options?: RetryOptions, config?: HyperClientOptions): IHyperCore;
/** Fresh setup-bearing plugin for each Core; retries wrap send rather than nesting in Core. */
export declare function createRetryPlugin(): HyperPlugin;
/** @deprecated Use createRetryPlugin() for independent Core instances. */
export declare const RetryPlugin: HyperPlugin;
//# sourceMappingURL=plugin.d.ts.map