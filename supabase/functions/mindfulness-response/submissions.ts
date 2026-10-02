import { z } from "zod";
import { guidedReflectionResponseSchema } from "../../schema/guidedReflectionSchema.ts";

const claimSchema = z.object({
  status: z.enum([
    "claimed",
    "processing",
    "completed",
    "failed",
    "conflict",
    "invalid",
  ]),
  response: z.unknown().optional(),
  failureStatus: z.union([z.literal(408), z.literal(502)]).nullable()
    .optional(),
});
export type Claim = z.infer<typeof claimSchema>;
export interface SubmissionStore {
  claim(
    submissionId: string,
    activityId: string,
    hash: string,
    token: string,
  ): Promise<Claim>;
  finish(
    submissionId: string,
    token: string,
    response: unknown,
    failureStatus?: 408 | 502,
  ): Promise<void>;
}
type RpcClient = {
  rpc(
    name: string,
    args: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: unknown }>;
};

export function submissionStore(client: RpcClient): SubmissionStore {
  return {
    async claim(submissionId, activityId, hash, token) {
      const { data, error } = await client.rpc("claim_intention_submission", {
        p_submission_id: submissionId,
        p_activity_id: activityId,
        p_request_hash: hash,
        p_claim_token: token,
      });
      if (error) throw new Error("Submission storage unavailable");
      return claimSchema.parse(data);
    },
    async finish(submissionId, token, response, failureStatus) {
      const { error } = await client.rpc("finish_intention_submission", {
        p_submission_id: submissionId,
        p_claim_token: token,
        p_response: failureStatus
          ? null
          : guidedReflectionResponseSchema.parse(response),
        p_failure_status: failureStatus ?? null,
      });
      if (error) throw new Error("Submission storage unavailable");
    },
  };
}
