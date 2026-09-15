/**
 * TEMPORARY local duplicate of `packages/contracts/src/session.ts`'s
 * `SessionRequestState` (Sonnet A, A02, `origin/sonnet-a/a02` PR #15, not
 * yet merged into `main`). Sonnet C does not edit `packages/contracts`, so
 * until A02 merges this reproduces just the status vocabulary
 * (`idle | pending | accepted | rejected | disconnected`) so C01's screens
 * use the real names from the start. Delete this file and import the real
 * type from `@digitable/contracts` once A02 merges — every screen that
 * imports this module only needs its import path changed, the shape is
 * identical.
 */
export type RequestId = string;

export type SessionRequestState<TAccepted extends { readonly ok: true }> =
  | { readonly status: "idle" }
  | { readonly status: "pending"; readonly requestId: RequestId }
  | { readonly status: "accepted"; readonly requestId: RequestId; readonly result: TAccepted }
  | {
      readonly status: "rejected";
      readonly requestId: RequestId;
      readonly code: string;
      readonly message: string;
    }
  | { readonly status: "disconnected"; readonly requestId: RequestId };

export function idleSessionRequest<
  TAccepted extends { readonly ok: true },
>(): SessionRequestState<TAccepted> {
  return { status: "idle" };
}
