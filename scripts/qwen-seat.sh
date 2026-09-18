#!/usr/bin/env bash
# Runs ONE bounded, analysis-only local Qwen seat through Ollama and records evidence.
#
# Usage: scripts/qwen-seat.sh <seat-id> <model> <role> <prompt-file> [num_predict]
#   seat-id      short slug, becomes docs/evidence/today-qwen/qwen-seats/<seat-id>/
#   model        an installed Ollama tag; only qwen3:4b (analyst/utility) and
#                qwen2.5-coder:7b (code-reader) are permitted seats. 14B/30B are denied.
#   role         analyst | code-reader
#   prompt-file  the complete user prompt (task + the excerpts the seat may see)
#   num_predict  hard output-token cap (default 700)
#   schema-file  optional JSON Schema; constrains the reply to that shape (Ollama `format`).
#                Small local models ramble in free text, so structured output is the default
#                way to get a usable, bounded answer.
#
# The seat has no tools and no file access: it sees only prompt-file. It cannot write,
# commit, or run anything. The Sonnet orchestrator owns implementation and review and
# records a disposition for each seat's output in the evidence README.
#
# Evidence written per seat: prompt.md, response.txt, response.json (raw Ollama reply
# incl. timings/token counts), meta.json (model digest, options, wall time, exit state).
# Inference is single-stream: run seats one at a time.
set -euo pipefail
# Evidence paths below are relative to the repo root, whatever the caller's cwd.
cd "$(dirname "$0")/.."

SEAT_ID="${1:?seat-id}"
MODEL="${2:?model}"
ROLE="${3:?role (analyst|code-reader)}"
PROMPT_FILE="${4:?prompt-file}"
NUM_PREDICT="${5:-700}"
SCHEMA_FILE="${6:-}"
HOST="${OLLAMA_HOST_URL:-http://127.0.0.1:11434}"
MAX_TIME="${QWEN_SEAT_MAX_TIME:-420}"

# The seat sees only prompt-file; refuse to send it anywhere but the local Ollama API.
if ! [[ "$HOST" =~ ^http://(127\.0\.0\.1|localhost|\[::1\])(:[0-9]+)?$ ]]; then
  echo "refusing OLLAMA_HOST_URL '$HOST': only a loopback http address is permitted" >&2
  exit 64
fi
# The seat id becomes a directory name under the evidence root: no path separators or "..".
if ! [[ "$SEAT_ID" =~ ^[A-Za-z0-9][A-Za-z0-9._-]*$ ]] || [[ "$SEAT_ID" == *..* ]]; then
  echo "refusing seat-id '$SEAT_ID': use letters, digits, '.', '_' or '-' only" >&2
  exit 64
fi

case "$MODEL" in
  qwen3:4b | qwen2.5-coder:7b) ;;
  *)
    echo "refusing model '$MODEL': only qwen3:4b and qwen2.5-coder:7b are permitted seats" >&2
    exit 64
    ;;
esac
case "$ROLE" in
  analyst | code-reader) ;;
  *)
    echo "unknown role '$ROLE'" >&2
    exit 64
    ;;
esac

OUT_DIR="docs/evidence/today-qwen/qwen-seats/$SEAT_ID"
mkdir -p "$OUT_DIR"
cp "$PROMPT_FILE" "$OUT_DIR/prompt.md"
if [ -n "$SCHEMA_FILE" ]; then cp "$SCHEMA_FILE" "$OUT_DIR/schema.json"; fi

export SEAT_ID MODEL ROLE NUM_PREDICT OUT_DIR SCHEMA_FILE
REQUEST="$(node -e '
const fs = require("fs");
const role = process.env.ROLE;
const system =
  "You are a read-only " + role + " seat working for a software project. " +
  "You cannot write files, run commands, or make decisions; you only analyse the text you are given. " +
  "Use ONLY the supplied text. Quote the exact identifier or line that supports each finding. " +
  "If the supplied text does not settle a question, write UNCERTAIN and say what is missing. " +
  "Do not invent file names, ids or behaviour. Keep the answer under 250 words as a short bulleted list.";
const user = fs.readFileSync(process.env.OUT_DIR + "/prompt.md", "utf8");
const body = {
  model: process.env.MODEL,
  stream: false,
  keep_alive: 0,
  options: { temperature: 0, seed: 42, num_predict: Number(process.env.NUM_PREDICT), num_ctx: 8192 },
  messages: [
    { role: "system", content: system },
    { role: "user", content: user },
  ],
};
if (process.env.MODEL.startsWith("qwen3")) body.think = false;
if (process.env.SCHEMA_FILE) body.format = JSON.parse(fs.readFileSync(process.env.OUT_DIR + "/schema.json", "utf8"));
process.stdout.write(JSON.stringify(body));
')"

DIGEST="$(curl -s --max-time 10 "$HOST/api/tags" | node -e '
let s = ""; process.stdin.on("data", (d) => (s += d)).on("end", () => {
  const m = JSON.parse(s).models.find((x) => x.name === process.env.MODEL);
  process.stdout.write(m ? m.digest : "not-installed");
});')"

START="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
T0="$(date +%s)"
set +e
printf '%s' "$REQUEST" | curl -s --max-time "$MAX_TIME" "$HOST/api/chat" \
  -H 'Content-Type: application/json' --data-binary @- >"$OUT_DIR/response.json"
CURL_EXIT=$?
set -e
T1="$(date +%s)"

export DIGEST START CURL_EXIT WALL_SECONDS="$((T1 - T0))"
node -e '
const fs = require("fs");
const dir = process.env.OUT_DIR;
let text = "";
let doneReason = "unparseable";
let evalCount = null;
try {
  const r = JSON.parse(fs.readFileSync(dir + "/response.json", "utf8"));
  text = (r.message && r.message.content) || "";
  doneReason = r.done_reason || "none";
  evalCount = r.eval_count ?? null;
} catch {}
fs.writeFileSync(dir + "/response.txt", text.trim() + "\n");
fs.writeFileSync(
  dir + "/meta.json",
  JSON.stringify(
    {
      seat: process.env.SEAT_ID,
      role: process.env.ROLE,
      model: process.env.MODEL,
      modelDigest: process.env.DIGEST,
      startedUtc: process.env.START,
      wallSeconds: Number(process.env.WALL_SECONDS),
      curlExit: Number(process.env.CURL_EXIT),
      doneReason,
      evalCount,
      options: { temperature: 0, seed: 42, num_predict: Number(process.env.NUM_PREDICT), num_ctx: 8192, keep_alive: 0 },
      structuredOutput: Boolean(process.env.SCHEMA_FILE),
      capabilities: "analysis-only; no tools, no filesystem, no network beyond the local Ollama API",
    },
    null,
    2,
  ) + "\n",
);
'

echo "seat=$SEAT_ID model=$MODEL wall=${WALL_SECONDS}s curl_exit=$CURL_EXIT -> $OUT_DIR"
cat "$OUT_DIR/response.txt"
