import "vitest";

interface AxeMatchers<R = unknown> {
  toHaveNoViolations(): R;
}

declare module "vitest" {
  // Declaration merging requires these empty extending interfaces.
  /* eslint-disable @typescript-eslint/no-empty-object-type */
  interface Assertion<T = unknown> extends AxeMatchers<T> {}
  interface AsymmetricMatchersContaining extends AxeMatchers {}
  /* eslint-enable @typescript-eslint/no-empty-object-type */
}
