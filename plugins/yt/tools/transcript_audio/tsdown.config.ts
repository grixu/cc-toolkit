import { defineConfig } from "tsdown";

export default defineConfig([
  {
    entry: { transcribe: "./transcribe.mjs" },
    outDir: "../../scripts/transcript_audio",
    format: "esm",
    platform: "node",
    target: "node20",
    dts: false,
    sourcemap: false,
    minify: true,
    clean: true,
    shims: false,
    outExtensions: () => ({ js: ".mjs" }),
    external: ["./transliterate.mjs"],
    noExternal: ["@elevenlabs/elevenlabs-js"],
  },
  {
    entry: { transliterate: "./transliterate.mjs" },
    outDir: "../../scripts/transcript_audio",
    format: "esm",
    platform: "node",
    target: "node20",
    dts: false,
    sourcemap: false,
    minify: false,
    clean: false,
    shims: false,
    outExtensions: () => ({ js: ".mjs" }),
  },
]);
