#!/bin/bash
# Review sheets for a rendered walkthrough: a timeline of frames, each caption's middle and end, caption length checks.
# Usage: frames.sh <video.mp4> [<slug>.walk.ts]   (the .srt must sit next to the video; output lands in <video dir>/frames/)
# Env: SPEED=0.5x|1x|2x|3x|5x (default 1x) scales the timeline interval; CAPTION_MAX (default 60) is the caption limit.
set -euo pipefail
VIDEO=$1
WALK=${2:-}
CAPTION_MAX=${CAPTION_MAX:-60}
# Faster videos are shorter, so the timeline samples more often: every 5 s at 0.5x down to every 1 s at 5x.
case ${SPEED:-1x} in
  0.5x) INTERVAL=5 ;;
  1x) INTERVAL=3 ;;
  2x) INTERVAL=2 ;;
  3x | 5x) INTERVAL=1 ;;
  *) echo "SPEED must be 0.5x, 1x, 2x, 3x or 5x, got $SPEED" >&2; exit 1 ;;
esac
SRT=${VIDEO%.*}.srt
OUT=$(dirname "$VIDEO")/frames
rm -rf "$OUT/timeline" "$OUT/cues" "$OUT"/*.png
mkdir -p "$OUT/timeline" "$OUT/cues" "$OUT/fixes"

ffprobe -v error -show_entries format=duration,size -of compact "$VIDEO"
ffmpeg -nostdin -v error -i "$VIDEO" -vf "fps=1/$INTERVAL,scale=640:-1,tile=3x3" "$OUT/timeline/sheet%02d.png"

# 35% into each cue and just before it ends: catches a caption that runs ahead of its action.
# The end offset is 0.6 s, or 15% of the cue when that is shorter: fast renders have sub-second cues.
# The last cue can end after the video does, where a seek finds no frame.
DURATION=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$VIDEO")
awk -F' --> ' -v duration="$DURATION" '/-->/ {
  split($1, a, /[:,]/); split($2, b, /[:,]/)
  start = a[1]*3600 + a[2]*60 + a[3] + a[4]/1000; end = b[1]*3600 + b[2]*60 + b[3] + b[4]/1000
  if (end > duration) end = duration
  offset = (end - start) * 0.15; if (offset > 0.6) offset = 0.6
  printf "%d %.3f %.3f\n", ++n, start + (end - start) * 0.35, end - offset
}' "$SRT" | while read -r cue middle end; do
  # -nostdin: ffmpeg otherwise reads the remaining cue lines from the loop's stdin.
  ffmpeg -nostdin -v error -ss "$middle" -i "$VIDEO" -frames:v 1 -vf scale=1280:-1 "$OUT/cues/f$(printf %03d $((cue * 2 - 1))).png"
  ffmpeg -nostdin -v error -ss "$end" -i "$VIDEO" -frames:v 1 -vf scale=1280:-1 "$OUT/cues/f$(printf %03d $((cue * 2))).png"
done
ffmpeg -nostdin -v error -i "$OUT/cues/f%03d.png" -vf "scale=640:-1,tile=2x4" "$OUT/cue-sheet%02d.png"

# The renderer may already have split long captions in the .srt, so the narrate() source is the reliable check;
# node counts characters where macOS awk counts bytes.
if [ -n "$WALK" ]; then
  # shellcheck disable=SC2016 # a JavaScript program: its ${…} and backticks are node's, not the shell's
  node -e '
    const [file, max] = process.argv.slice(1);
    const source = require("fs").readFileSync(file, "utf8");
    for (const [, , text] of source.matchAll(/narrate\(\s*([\x27"`])(.*?)\1/g)) {
      if ([...text].length > Number(max)) console.log(`over ${max} chars (${[...text].length}): ${text}`);
    }' "$WALK" "$CAPTION_MAX"
fi
# Captions that start lowercase are the second half of a split cue.
awk 'prev ~ /-->/ && $0 ~ /^[a-z]/ { print "split cue: " $0 } { prev = $0 }' "$SRT"
echo "timeline sheets: $(find "$OUT/timeline" -type f | wc -l | tr -d ' '), cue sheets: $(find "$OUT" -maxdepth 1 -name 'cue-sheet*.png' | wc -l | tr -d ' ')"
