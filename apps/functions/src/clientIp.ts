/** Bucket for callers whose IP cannot be determined; throttled as one shared source (fails closed, never open). */
export const UNKNOWN_CLIENT_IP = "unknown";

export interface ClientIpSource {
  /** Express's `req.ip` — populated from `X-Forwarded-For` because the Functions framework enables `trust proxy`. */
  readonly ip: string | undefined;
  /** The raw `X-Forwarded-For` header, consulted only when `ip` is absent. */
  readonly forwardedFor: string | readonly string[] | undefined;
}

/**
 * Resolves the caller IP used as the per-IP throttle key. Pure so it can be
 * unit-tested without a request object. Prefers the framework-resolved `ip`;
 * falls back to the first `X-Forwarded-For` entry; otherwise the shared
 * `UNKNOWN_CLIENT_IP` bucket, so a caller whose address cannot be seen is
 * still bounded rather than exempt. Verify against real staging traffic
 * before App Check enforcement that the resolved value is the client, not
 * the load balancer (docs/reviews, Phase 2 PR 3 resolution).
 */
export function clientIpFrom(source: ClientIpSource): string {
  if (source.ip !== undefined && source.ip.length > 0) return source.ip;
  const header = Array.isArray(source.forwardedFor)
    ? (source.forwardedFor as readonly string[])[0]
    : (source.forwardedFor as string | undefined);
  const first = header?.split(",")[0]?.trim();
  return first !== undefined && first.length > 0 ? first : UNKNOWN_CLIENT_IP;
}
