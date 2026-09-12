/**
 * A pure source of die rolls. Implementations must be deterministic given a
 * fixed seed: the same sequence of `rollDie` calls against a generator
 * constructed from the same seed always yields the same faces. This is what
 * lets a trusted handler retry a Firestore transaction without rerolling
 * (docs/ARCHITECTURE.md, ADR-002) and what lets tests fix outcomes.
 *
 * Implementations live in @digitable/engine; this package only defines the
 * shape so templates can depend on it without depending on the engine.
 */
export interface RandomSource {
  /** Draw one die face in the inclusive range [1, sides]. */
  rollDie(sides: number): number;
}

/** Roll `count` dice of `sides` faces, in draw order. */
export function rollDice(random: RandomSource, count: number, sides: number): number[] {
  const faces: number[] = [];
  for (let i = 0; i < count; i += 1) {
    faces.push(random.rollDie(sides));
  }
  return faces;
}
