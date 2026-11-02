#!/bin/bash
# Review sheets for a rendered walkthrough: a frame every 5 s, each caption's middle and end, caption length checks.
# Usage: frames.sh <video.mp4> [<slug>.walk.ts]   (the .srt must sit next to the video; output lands in <video dir>/frames/)
set -euo pipefail
VIDEO=$1
WALK=${2:-}
SRT=${VIDEO%.*}.srt
OUT=$(dirname "$VIDEO")/frames
rm -rf "$OUT/timeline" "$OUT/cues" "$OUT"/*.png
mkdir -p "$OUT/timeline" "$OUT/cues" "$OUT/fixes"

ffprobe -v error -show_entries format=duration,size -of compact "$VIDEO"
ffmpeg -nostdin -v error -i "$VIDEO" -vf "fps=1/5,scale=640:-1,tile=3x3" "$OUT/timeline/sheet%02d.png"

# 35% into each cue and 0.6 s before it ends: catches a caption that runs ahead of its action.
awk -F' --> ' '/-->/ {
  split($1, a, /[:,]/); split($2, b, /[:,]/)
  start = a[1]*3600 + a[2]*60 + a[3] + a[4]/1000; end = b[1]*3600 + b[2]*60 + b[3] + b[4]/1000
  printf "%d %.2f %.2f\n", ++n, start + (end - start) * 0.35, end - 0.6
}' "$SRT" | while read -r cue middle end; do
  # -nostdin: ffmpeg otherwise reads the remaining cue lines from the loop's stdin.
  ffmpeg -nostdin -v error -ss "$middle" -i "$VIDEO" -frames:v 1 -vf scale=1280:-1 "$OUT/cues/f$(printf %03d $((cue * 2 - 1))).png"
  ffmpeg -nostdin -v error -ss "$end" -i "$VIDEO" -frames:v 1 -vf scale=1280:-1 "$OUT/cues/f$(printf %03d $((cue * 2))).png"
done
ffmpeg -nostdin -v error -i "$OUT/cues/f%03d.png" -vf "scale=640:-1,tile=2x4" "$OUT/cue-sheet%02d.png"

# The renderer may already have split long captions in the .srt, so the narrate() source is the reliable check;
# node counts characters where macOS awk counts bytes.
if [ -n "$WALK" ]; then
  node -e '
    const source = require("fs").readFileSync(process.argv[1], "utf8");
    for (const [, , text] of source.matchAll(/narrate\(\s*([\x27"`])(.*?)\1/g)) {
      if ([...text].length > 60) console.log(`over 60 chars (${[...text].length}): ${text}`);
    }' "$WALK"
fi
# Captions that start lowercase are the second half of a split cue.
awk 'prev ~ /-->/ && $0 ~ /^[a-z]/ { print "split cue: " $0 } { prev = $0 }' "$SRT"
echo "timeline sheets: $(ls "$OUT/timeline" | wc -l | tr -d ' '), cue sheets: $(ls "$OUT"/cue-sheet*.png | wc -l | tr -d ' ')"
