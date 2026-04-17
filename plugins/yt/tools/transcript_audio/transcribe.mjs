#!/usr/bin/env node

import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import { accessSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { resolve, extname, basename, dirname, join } from "node:path";
import { sanitizeFilename } from "./transliterate.mjs";

const SUPPORTED_FORMATS = {
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
  ".aiff": "audio/aiff",
  ".aac": "audio/aac",
  ".ogg": "audio/ogg",
  ".flac": "audio/flac",
};

const MAX_FILE_SIZE = 1 * 1024 * 1024 * 1024; // 1 GB

// Pause thresholds (seconds) used to reconstruct structure from ElevenLabs' word-level timing.
// We rely on the model's own timing information — not regex on the raw text.
const PARAGRAPH_GAP_SEC = 1.5;
const SENTENCE_GAP_SEC = 0.45;

function fail(message) {
  console.error(message);
  process.exit(1);
}

function formatTranscript(words) {
  if (!Array.isArray(words) || words.length === 0) return "";

  const lines = [];
  let currentLine = "";
  let currentSpeaker = null;
  let multipleSpeakers = false;

  const speakerSet = new Set();
  for (const w of words) if (w.speakerId ?? w.speaker_id) speakerSet.add(w.speakerId ?? w.speaker_id);
  multipleSpeakers = speakerSet.size > 1;

  const speakerLabel = (id) => `**${String(id).replace("speaker_", "Mówca ")}:** `;

  const pushLine = () => {
    if (currentLine.trim()) lines.push(currentLine.trimEnd());
    currentLine = "";
  };

  const startLineForSpeaker = (id) => {
    currentLine = multipleSpeakers && id ? speakerLabel(id) : "";
  };

  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const type = w.type;
    const speaker = w.speakerId ?? w.speaker_id ?? null;

    if (type === "spacing") {
      const gap = Number(w.end) - Number(w.start);
      if (gap >= PARAGRAPH_GAP_SEC) {
        pushLine();
        lines.push("");
        startLineForSpeaker(speaker);
      } else if (gap >= SENTENCE_GAP_SEC) {
        pushLine();
        startLineForSpeaker(speaker);
      } else {
        currentLine += " ";
      }
      continue;
    }

    if (type === "audio_event") {
      // Inline event marker in square brackets (e.g. [laughter])
      const tag = String(w.text ?? "").trim().replace(/^[\[\(]|[\]\)]$/g, "");
      if (tag) currentLine += (currentLine && !currentLine.endsWith(" ") ? " " : "") + `[${tag}]`;
      continue;
    }

    // type === "word"
    if (multipleSpeakers && speaker && speaker !== currentSpeaker) {
      pushLine();
      if (currentSpeaker !== null) lines.push("");
      currentSpeaker = speaker;
      startLineForSpeaker(speaker);
    } else if (currentSpeaker === null) {
      currentSpeaker = speaker;
      startLineForSpeaker(speaker);
    }

    currentLine += String(w.text ?? "");
  }

  pushLine();

  // Collapse runs of blank lines to a single blank line.
  const collapsed = [];
  for (const line of lines) {
    if (line === "" && collapsed[collapsed.length - 1] === "") continue;
    collapsed.push(line);
  }
  while (collapsed.length && collapsed[0] === "") collapsed.shift();
  while (collapsed.length && collapsed[collapsed.length - 1] === "") collapsed.pop();

  return collapsed.join("\n");
}

// 1. Validate arguments
const args = process.argv.slice(2);
if (args.length !== 1) {
  fail(`Usage: transcribe.mjs <audio-file>\nExpected exactly 1 argument, got ${args.length}.`);
}

const filePath = resolve(args[0]);

// 2. Check file exists
try {
  accessSync(filePath);
} catch {
  fail(`File not found: ${filePath}`);
}

// 3. Check format
const ext = extname(filePath).toLowerCase();
const mimeType = SUPPORTED_FORMATS[ext];
if (!mimeType) {
  fail(`Unsupported format "${ext}". Supported: ${Object.keys(SUPPORTED_FORMATS).join(", ")}`);
}

// 4. Check file size
const { size } = statSync(filePath);
if (size > MAX_FILE_SIZE) {
  fail(`File too large (${(size / 1024 / 1024 / 1024).toFixed(2)} GB). Max: 1 GB.`);
}

// 5. Check API key
const apiKey = process.env.ELEVENLABS_API_KEY;
if (!apiKey) {
  fail("ELEVENLABS_API_KEY environment variable is not set.");
}

// 6. Transcribe
const elevenlabs = new ElevenLabsClient({ apiKey });

console.error("Transcribing...");
const fileBuffer = readFileSync(filePath);
const audioBlob = new Blob([fileBuffer], { type: mimeType });

const result = await elevenlabs.speechToText.convert({
  file: audioBlob,
  modelId: "scribe_v2",
  languageCode: null,
  tagAudioEvents: true,
  diarize: true,
});

const words = result.words ?? [];
const formatted = words.length > 0 ? formatTranscript(words) : (result.text ?? "");

// 7. Save — use a transliterated basename so Polish diacritics become ASCII and the
//    output path is readable even if the caller passed an mp3 with non-ASCII chars.
const rawBase = basename(filePath, ext);
const safeBase = sanitizeFilename(rawBase) || rawBase;
const outputPath = join(dirname(filePath), `${safeBase}.md`);
writeFileSync(outputPath, formatted + "\n");

console.log(outputPath);
