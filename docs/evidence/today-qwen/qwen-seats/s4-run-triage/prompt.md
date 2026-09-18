# Task: triage browser-run reports (analyst seat)

Below are condensed results of three automated browser runs of the same 3-device session flow. Fields: ok = whether every step passed; steps = step name and pass/fail; overflowPx = horizontal-overflow measurements over 1px found while capturing screenshots (empty list = none); consoleErrors/failedRequests = counts per device (gm, player, table). Note: in the run named noimg-run, image requests were deliberately blocked, so failed requests there are expected; the same is true for 4 failed requests on the table device in partial-art-run (large scene art was deliberately blocked). Report: which runs have any failing step, which have console errors, which have overflow, and anything else that looks like a real problem (not an expected blocked request).

## two-device-run
{
 "ok": true,
 "steps": [
  [
   "landing renders on every device",
   "pass"
  ],
  [
   "GM creates a session and receives the one-time codes",
   "pass"
  ],
  [
   "GM loads the opening scene",
   "pass"
  ],
  [
   "player joins on a phone-sized device with plain-http crypto limits",
   "pass"
  ],
  [
   "player claims the first available character",
   "pass"
  ],
  [
   "table display connects with the separate table code",
   "pass"
  ],
  [
   "GM sees the claimed character (cross-device propagation)",
   "pass"
  ],
  [
   "player declares an action and the GM sees it pending",
   "pass"
  ],
  [
   "GM rolls; player allocates every die and confirms",
   "pass"
  ],
  [
   "player continues; table shows the roll outcome state",
   "pass"
  ],
  [
   "GM pauses; player and table both reflect it; GM resumes",
   "pass"
  ],
  [
   "GM ends the round, advances the scene with a reason; devices follow",
   "pass"
  ],
  [
   "every device layout has no horizontal overflow at 375/768/1024/1280/1920",
   "pass"
  ],
  [
   "player reload restores the seat and dashboard without re-joining",
   "pass"
  ]
 ],
 "overflowPx": [],
 "consoleErrors": {
  "gm": 0,
  "player": 0,
  "table": 0
 },
 "failedRequests": {
  "gm": 0,
  "player": 0,
  "table": 0
 }
}

## noimg-run
{
 "ok": true,
 "steps": [
  [
   "landing renders on every device",
   "pass"
  ],
  [
   "GM creates a session and receives the one-time codes",
   "pass"
  ],
  [
   "GM loads the opening scene",
   "pass"
  ],
  [
   "player joins on a phone-sized device with plain-http crypto limits",
   "pass"
  ],
  [
   "player claims the first available character",
   "pass"
  ],
  [
   "table display connects with the separate table code",
   "pass"
  ],
  [
   "GM sees the claimed character (cross-device propagation)",
   "pass"
  ],
  [
   "player declares an action and the GM sees it pending",
   "pass"
  ],
  [
   "GM rolls; player allocates every die and confirms",
   "pass"
  ],
  [
   "player continues; table shows the roll outcome state",
   "pass"
  ],
  [
   "GM pauses; player and table both reflect it; GM resumes",
   "pass"
  ],
  [
   "GM ends the round, advances the scene with a reason; devices follow",
   "pass"
  ],
  [
   "every device layout has no horizontal overflow at 375/768/1024/1280/1920",
   "pass"
  ],
  [
   "player reload restores the seat and dashboard without re-joining",
   "pass"
  ]
 ],
 "overflowPx": [],
 "consoleErrors": {
  "gm": 0,
  "player": 0,
  "table": 0
 },
 "failedRequests": {
  "gm": 5,
  "player": 31,
  "table": 17
 }
}

## partial-art-run
{
 "ok": true,
 "steps": [
  [
   "landing renders on every device",
   "pass"
  ],
  [
   "GM creates a session and receives the one-time codes",
   "pass"
  ],
  [
   "GM loads the opening scene",
   "pass"
  ],
  [
   "player joins on a phone-sized device with plain-http crypto limits",
   "pass"
  ],
  [
   "player claims the first available character",
   "pass"
  ],
  [
   "table display connects with the separate table code",
   "pass"
  ],
  [
   "GM sees the claimed character (cross-device propagation)",
   "pass"
  ],
  [
   "player declares an action and the GM sees it pending",
   "pass"
  ],
  [
   "GM rolls; player allocates every die and confirms",
   "pass"
  ],
  [
   "player continues; table shows the roll outcome state",
   "pass"
  ],
  [
   "GM pauses; player and table both reflect it; GM resumes",
   "pass"
  ],
  [
   "GM ends the round, advances the scene with a reason; devices follow",
   "pass"
  ],
  [
   "every device layout has no horizontal overflow at 375/768/1024/1280/1920",
   "pass"
  ]
 ],
 "overflowPx": [],
 "consoleErrors": {
  "gm": 0,
  "player": 0,
  "table": 0
 },
 "failedRequests": {
  "gm": 0,
  "player": 0,
  "table": 4
 }
}

