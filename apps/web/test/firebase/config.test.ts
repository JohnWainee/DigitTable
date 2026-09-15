import { describe, expect, it } from "vitest";
import { firebaseConfigFrom } from "../../src/firebase/config.js";

describe("Firebase environment configuration", () => {
  it("requires explicit configuration rather than silently selecting staging", () => {
    expect(() => firebaseConfigFrom({})).toThrow("Firebase configuration is incomplete");
  });

  it("uses only the supplied environment values", () => {
    expect(
      firebaseConfigFrom({
        VITE_FIREBASE_API_KEY: "public-api-key",
        VITE_FIREBASE_AUTH_DOMAIN: "example.firebaseapp.com",
        VITE_FIREBASE_PROJECT_ID: "example-project",
        VITE_FIREBASE_APP_ID: "1:123:web:abc",
      }),
    ).toMatchObject({ projectId: "example-project", appId: "1:123:web:abc" });
  });
});
