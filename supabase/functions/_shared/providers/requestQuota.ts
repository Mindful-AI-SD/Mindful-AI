import { z } from "zod";
import { resolveClaudeConfig } from "./claudeAdapter.ts";

// A per-student daily cap on model requests. The workspace spending limit caps
// the total; without this, one student could use it up for everyone. Every
// Claude route claims a request here before calling the model. The count lives
// in ai_request_counts and only the claim_ai_request function writes it, using
// the caller's own session, so a student cannot reset or raise their count.

export class RequestQuotaExceededError extends Error {
  readonly code = "RATE_LIMITED" as const;

  constructor() {
    super("The daily limit for model requests has been reached.");
    this.name = "RequestQuotaExceededError";
  }
}

// Failing closed: when the count cannot be checked, no model call is made.
export class RequestQuotaUnavailableError extends Error {
  readonly code = "USAGE_CHECK_UNAVAILABLE" as const;

  constructor() {
    super("The daily request count could not be checked.");
    this.name = "RequestQuotaUnavailableError";
  }
}

type RpcClient = {
  rpc(
    name: string,
    args: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: unknown }>;
};

export type ClaimModelRequest = () => Promise<void>;

const claimSchema = z.object({ allowed: z.boolean() }).loose();

export function requestQuotaClaimer(
  client: RpcClient,
  dailyLimit: number = resolveClaudeConfig().dailyRequestLimit,
): ClaimModelRequest {
  return async () => {
    let result: { data: unknown; error: unknown };
    try {
      result = await client.rpc("claim_ai_request", {
        p_daily_limit: dailyLimit,
      });
    } catch {
      throw new RequestQuotaUnavailableError();
    }
    const claim = claimSchema.safeParse(result.data);
    if (result.error || !claim.success) {
      throw new RequestQuotaUnavailableError();
    }
    if (!claim.data.allowed) throw new RequestQuotaExceededError();
  };
}
