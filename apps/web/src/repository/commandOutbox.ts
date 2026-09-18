import type { MemberId, RoomCommandRequest, RoomId } from "@digitable/contracts";
import { eatTheReichTemplate, type EatTheReichCommand } from "@digitable/template-eat-the-reich";

export interface PendingCommand {
  readonly request: RoomCommandRequest<EatTheReichCommand>;
  readonly templateId: string;
  readonly templateVersion: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** One key per command prevents concurrent tabs from overwriting each other's queue. */
export class CommandOutbox {
  private readonly prefix: string;

  constructor(
    private readonly storage: Storage,
    project: string,
    uid: string,
    roomId: RoomId,
    memberId: MemberId,
  ) {
    this.prefix = `digitable.outbox.v2:${JSON.stringify([project, uid, roomId, memberId])}:`;
  }

  read(): readonly PendingCommand[] {
    const entries: PendingCommand[] = [];
    for (let index = 0; index < this.storage.length; index += 1) {
      const key = this.storage.key(index);
      if (!key?.startsWith(this.prefix)) continue;
      const raw: unknown = JSON.parse(this.storage.getItem(key) ?? "null");
      if (typeof raw !== "object" || raw === null) throw new Error("Invalid saved command.");
      const entry = raw as Partial<PendingCommand>;
      if (
        typeof entry.templateId !== "string" ||
        typeof entry.templateVersion !== "string" ||
        !entry.request ||
        typeof entry.request.commandId !== "string" ||
        !UUID.test(entry.request.commandId) ||
        key !== this.prefix + entry.request.commandId ||
        (entry.request.expectedRevision !== undefined &&
          (!Number.isSafeInteger(entry.request.expectedRevision) ||
            entry.request.expectedRevision < 0))
      )
        throw new Error("Invalid saved command.");
      if (entry.templateVersion === eatTheReichTemplate.manifest.templateVersion) {
        eatTheReichTemplate.schemas.parseCommand(entry.request.payload);
      }
      entries.push(entry as PendingCommand);
    }
    return entries;
  }

  remember(request: RoomCommandRequest<EatTheReichCommand>): PendingCommand {
    const prior = this.read().find((entry) => entry.request.commandId === request.commandId);
    if (prior) {
      if (JSON.stringify(prior.request) !== JSON.stringify(request)) {
        throw new Error("A saved command cannot be changed during retry.");
      }
      return prior;
    }
    if (this.read().length >= 32) throw new Error("Too many pending commands.");
    if (!UUID.test(request.commandId)) throw new Error("Invalid command ID.");
    eatTheReichTemplate.schemas.parseCommand(request.payload);
    const entry: PendingCommand = {
      request,
      templateId: eatTheReichTemplate.manifest.templateId,
      templateVersion: eatTheReichTemplate.manifest.templateVersion,
    };
    this.storage.setItem(this.prefix + request.commandId, JSON.stringify(entry));
    return entry;
  }

  forget(commandId: string): void {
    this.storage.removeItem(this.prefix + commandId);
  }
}
