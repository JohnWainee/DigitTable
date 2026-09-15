import { useEffect, useState } from "react";

/**
 * Minimal hash-based router. No routing library is in `package-lock.json`
 * (Sonnet C does not own that file, per issue #14's collision rules), so
 * this is a small dependency-free stand-in for the routes named in
 * `docs/ETR_SESSION_FLOW.md` section 1. Real `/room/:roomId/...` path-based
 * routing can replace this without changing any screen component, since
 * screens only consume `Route`/`navigate`.
 */
export type Route =
  | { readonly name: "landing" }
  | { readonly name: "create" }
  | { readonly name: "join" }
  | { readonly name: "table-join" }
  | { readonly name: "claim"; readonly roomId: string }
  | { readonly name: "player"; readonly roomId: string }
  | { readonly name: "gm"; readonly roomId: string }
  | { readonly name: "table"; readonly roomId: string };

function parseHash(hash: string): Route {
  const path = hash.replace(/^#\/?/, "");
  const segments = path.split("/").filter(Boolean);
  if (segments.length === 0) return { name: "landing" };
  if (segments[0] === "create") return { name: "create" };
  if (segments[0] === "join") return { name: "join" };
  if (segments[0] === "table") return { name: "table-join" };
  if (segments[0] === "claim" && segments[1]) return { name: "claim", roomId: segments[1] };
  if (segments[0] === "room" && segments[1] && segments[2] === "player") {
    return { name: "player", roomId: segments[1] };
  }
  if (segments[0] === "room" && segments[1] && segments[2] === "gm") {
    return { name: "gm", roomId: segments[1] };
  }
  if (segments[0] === "room" && segments[1] && segments[2] === "table") {
    return { name: "table", roomId: segments[1] };
  }
  return { name: "landing" };
}

export function navigate(path: string): void {
  window.location.hash = path.startsWith("/") ? path : `/${path}`;
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));
  useEffect(() => {
    const onHashChange = (): void => setRoute(parseHash(window.location.hash));
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);
  return route;
}
