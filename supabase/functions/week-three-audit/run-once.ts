export type Receipt<T> = { input_digest: string; status: "processing" | "succeeded" | "failed"; result: T | null; error_status: number | null };
export type AuditLedger<T> = {
  claim(): Promise<boolean>;
  read(): Promise<Receipt<T> | null>;
  succeed(result: T): Promise<boolean>;
  fail(status: number): Promise<void>;
};
// Claim before spending. A lost success acknowledgement must never re-run the
// provider; a processing claim stays recoverable by retrying the same ID.
export async function runOnce<T>(digest: string, ledger: AuditLedger<T>, generate: () => Promise<T>, failureStatus: () => number): Promise<{ status: number; result?: T }> {
  if (!await ledger.claim()) {
    const previous = await ledger.read();
    if (!previous) return { status: 503 };
    if (previous.input_digest !== digest) return { status: 409 };
    if (previous.status === "succeeded" && previous.result !== null) return { status: 200, result: previous.result };
    return { status: previous.status === "failed" ? previous.error_status ?? 502 : 409 };
  }
  let result: T;
  try { result = await generate(); }
  catch { const status = failureStatus(); await ledger.fail(status); return { status }; }
  // Preserve the processing claim if writing the receipt fails. Don't mark an
  // already spent call as a new retryable provider failure.
  return await ledger.succeed(result) ? { status: 200, result } : { status: 503 };
}
