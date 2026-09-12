import {
  allow,
  decided,
  deny,
  rejected,
  stableError,
  type AuthorizedMemberContext,
  type Decision,
  type RandomSource,
} from "@digitable/contracts";
import type { CommandHandlerTemplate } from "@digitable/engine";

/**
 * A minimal, template-agnostic `CommandHandlerTemplate` used to exercise
 * `runCommand`'s sequencing, reduction, and per-destination redaction
 * without depending on templates/eat-the-reich. Not a game; just enough
 * shape to prove the harness works for any pure `decide`/`reduce` pair.
 */
export interface CounterState {
  readonly count: number;
}

export type CounterCommand =
  | { readonly type: "Increment"; readonly by: number }
  | { readonly type: "RollAndAdd"; readonly sides: number };

export type CounterEvent =
  | { readonly type: "Incremented"; readonly by: number }
  | { readonly type: "Rolled"; readonly face: number; readonly secretNote: string };

export const counterTemplate: CommandHandlerTemplate<CounterState, CounterCommand, CounterEvent> = {
  authorizeGameAction(_ctx: AuthorizedMemberContext, command: CounterCommand) {
    if (command.type === "Increment" && command.by <= 0) {
      return deny(stableError("UNKNOWN_ACTION", "Increment amount must be positive."));
    }
    return allow();
  },

  decide(
    ctx: {
      readonly state: CounterState;
      readonly actor: AuthorizedMemberContext;
      readonly random: RandomSource;
    },
    command: CounterCommand,
  ): Decision<CounterEvent> {
    if (command.type === "Increment") {
      return decided([
        {
          eventId: "incremented",
          event: { type: "Incremented", by: command.by },
          effects: [
            { destination: { kind: "shared" }, payload: { type: "Incremented", by: command.by } },
          ],
        },
      ]);
    }

    if (command.sides < 1) {
      return rejected(stableError("UNKNOWN_ACTION", "Dice must have at least one side."));
    }

    const face = ctx.random.rollDie(command.sides);
    const full: CounterEvent = { type: "Rolled", face, secretNote: `gm-only-${face}` };
    const redactedForPlayers: CounterEvent = { type: "Rolled", face, secretNote: "" };
    return decided([
      {
        eventId: "rolled",
        event: full,
        effects: [
          { destination: { kind: "shared" }, payload: redactedForPlayers },
          { destination: { kind: "gm" }, payload: full },
        ],
      },
    ]);
  },

  reduce(state: CounterState, event: CounterEvent): CounterState {
    switch (event.type) {
      case "Incremented":
        return { count: state.count + event.by };
      case "Rolled":
        return { count: state.count + event.face };
    }
  },
};
