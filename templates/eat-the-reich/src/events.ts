import type { MemberId } from "@digitable/contracts";

export type EatTheReichEvent =
  | {
      readonly type: "CharacterClaimed";
      readonly characterId: string;
      readonly memberId: MemberId;
    }
  | {
      readonly type: "CharacterReleased";
      readonly characterId: string;
      readonly memberId: MemberId;
    }
  | {
      readonly type: "InjuryHealed";
      readonly characterId: string;
      readonly categoryId: string;
      readonly boxIndex: 0 | 1;
      readonly bloodSpent: number;
    };
