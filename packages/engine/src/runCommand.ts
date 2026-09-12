import {
  asEventId,
  type AuthorityRecord,
  type AuthorizationResult,
  type AuthorizedMemberContext,
  type CommandId,
  type Decision,
  type EventActor,
  type EventDestination,
  type EventEnvelope,
  type RandomSource,
  type StableError,
} from "@digitable/contracts";

/**
 * The subset of GameTemplate needed to run one command end to end. Kept
 * narrow (no TView) so callers don't need a projection type in scope just to
 * execute a command.
 */
export interface CommandHandlerTemplate<TState, TCommand, TEvent> {
  authorizeGameAction(ctx: AuthorizedMemberContext, command: TCommand): AuthorizationResult;
  decide(
    ctx: {
      readonly state: TState;
      readonly actor: AuthorizedMemberContext;
      readonly random: RandomSource;
    },
    command: TCommand,
  ): Decision<TEvent>;
  reduce(state: TState, event: TEvent): TState;
}

export interface RunCommandInput<TState, TCommand> {
  readonly member: AuthorizedMemberContext;
  readonly authority: AuthorityRecord<TState>;
  readonly random: RandomSource;
  readonly command: TCommand;
  readonly commandId: CommandId;
  readonly occurredAtServer: string;
  /**
   * A receipt found by the caller's transactional receipt lookup. When
   * present, the engine returns the originally accepted result without
   * authorizing, deciding, reducing, or drawing randomness again.
   */
  readonly priorReceipt?: AcceptedCommandReceipt;
  /**
   * Defaults to `{ kind: "member", memberId: member.memberId }`. Pass
   * `{ kind: "anonymous" }` for safety interrupts, which must never record a
   * member actor (docs/ARCHITECTURE.md, "Safety interrupt").
   */
  readonly actor?: EventActor;
}

export interface DeliveredEnvelope<TEvent> {
  readonly destination: EventDestination;
  readonly envelope: EventEnvelope<TEvent>;
}

export interface RunCommandOutput<TState, TEvent> {
  readonly authority: AuthorityRecord<TState>;
  readonly envelopes: readonly DeliveredEnvelope<TEvent>[];
  readonly receipt: AcceptedCommandReceipt;
}

/** Actor-private stored result used to make retries idempotent. */
export interface AcceptedCommandReceipt {
  readonly commandId: CommandId;
  readonly roomRevision: number;
  readonly acceptedSequences: readonly number[];
}

export type RunCommandResult<TState, TEvent> =
  | ({ readonly ok: true } & RunCommandOutput<TState, TEvent>)
  | ({ readonly ok: false } & StableError);

/**
 * Runs the same pipeline a trusted Firebase Function transaction runs
 * (docs/ARCHITECTURE.md, "Opposed action" / ADR-002), entirely in memory:
 * platform authorization is expected to have already run (see
 * `authorizePlatform`); this covers template authorization, `decide`,
 * sequencing/envelope assignment, and folding `reduce` forward.
 *
 * `roomRevision` increments once per accepted command; `nextSequence`
 * increments once per logical event, regardless of how many destination
 * copies that event has (docs/ARCHITECTURE.md section 8).
 */
export function runCommand<TState, TCommand, TEvent>(
  template: CommandHandlerTemplate<TState, TCommand, TEvent>,
  input: RunCommandInput<TState, TCommand>,
): RunCommandResult<TState, TEvent> {
  if (input.priorReceipt !== undefined) {
    if (input.priorReceipt.commandId !== input.commandId) {
      throw new Error("priorReceipt commandId does not match the command being retried");
    }
    return {
      ok: true,
      authority: input.authority,
      envelopes: [],
      receipt: input.priorReceipt,
    };
  }

  const authorization = template.authorizeGameAction(input.member, input.command);
  if (!authorization.allowed) {
    return { ok: false, code: authorization.code, message: authorization.message };
  }

  const decision = template.decide(
    { state: input.authority.state, actor: input.member, random: input.random },
    input.command,
  );
  if (!decision.ok) {
    return { ok: false, code: decision.code, message: decision.message };
  }

  const actor: EventActor = input.actor ?? { kind: "member", memberId: input.member.memberId };
  const envelopes: DeliveredEnvelope<TEvent>[] = [];
  let state = input.authority.state;
  let sequence = input.authority.nextSequence;

  for (const decidedEvent of decision.events) {
    state = template.reduce(state, decidedEvent.event);
    for (const effect of decidedEvent.effects) {
      envelopes.push({
        destination: effect.destination,
        envelope: {
          eventId: asEventId(decidedEvent.eventId),
          commandId: input.commandId,
          sequence,
          roomRevision: input.authority.roomRevision + 1,
          templateId: input.authority.templateId,
          templateVersion: input.authority.templateVersion,
          schemaVersion: input.authority.schemaVersion,
          actor,
          occurredAtServer: input.occurredAtServer,
          payload: effect.payload,
        },
      });
    }
    sequence += 1;
  }

  const authority: AuthorityRecord<TState> = {
    ...input.authority,
    roomRevision: input.authority.roomRevision + 1,
    nextSequence: sequence,
    state,
  };
  const receipt: AcceptedCommandReceipt = {
    commandId: input.commandId,
    roomRevision: authority.roomRevision,
    acceptedSequences: [...new Set(envelopes.map(({ envelope }) => envelope.sequence))],
  };

  return {
    ok: true,
    authority,
    envelopes,
    receipt,
  };
}
