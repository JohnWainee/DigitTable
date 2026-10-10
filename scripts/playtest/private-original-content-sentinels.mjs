/** Test-only exact strings that must not appear in shared browser output. */
export const privateOriginalContentSentinels = {
  briefings: [
    "Opening scene: every character introduces themselves as the coffins break open in the wreckage. Use the first Feed to teach Blood.",
    "The Enforcer is unrevealed at load; RevealThreat it once round 2 begins.",
    "Loot: an ink-drum on a trolley (++ rolling downhill) is available via GrantItem if a player narrates taking it. Completing the secondary Objective offers one of matrix S2's six rewards — a GM correction, since ChooseSecondaryReward isn't automated this milestone.",
    "Conclusion: once the primary Objective reaches 0, EndMission becomes available. Prompt an epilogue line from each surviving character.",
  ],
  unrevealedThreatNotes: [
    "Foreshadow with slow, heavy footsteps down the tunnel before round 1 ends; reveal at the start of round 2. Its Blood unlocks an advance for whoever lands the killing blow (matrix S4).",
    "The mission's final guardian. Foreshadow through the whole scene (a voice on every speaker, a shape on the mast); reveal when the party is committed, no earlier than round 2. Challenge cannot be lowered by any effect; any injury it inflicts marks the whole rolled category.",
  ],
};

export const privateOriginalContentSentinelsFlat = [
  ...privateOriginalContentSentinels.briefings,
  ...privateOriginalContentSentinels.unrevealedThreatNotes,
];
