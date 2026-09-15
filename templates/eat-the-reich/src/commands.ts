/**
 * B02 commands: character claim/release and healing. The declare/review/
 * roll/allocate loop (docs/ETR_SESSION_FLOW.md §6) lands in B03; scene and
 * round commands (LoadScene, EndRound, ...) land in B04.
 */
export type EatTheReichCommand =
  | {
      readonly type: "ClaimCharacter";
      readonly characterId: string;
    }
  | {
      readonly type: "ReleaseCharacter";
      readonly characterId: string;
    }
  | {
      readonly type: "HealInjury";
      readonly characterId: string;
      readonly categoryId: string;
      readonly boxIndex: 0 | 1;
    };
