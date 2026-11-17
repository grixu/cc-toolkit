#!/bin/bash
# Review sheets for a rendered walkthrough: a timeline of frames, each caption's middle and end, caption length checks,
# a numbered caption list with times (cues.txt), and WARN lines for a file that will not play, upload or preview well.
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
VIDEO_STREAMS=$(ffprobe -v error -select_streams v -show_entries stream=index -of csv=p=0 "$VIDEO" | wc -l | tr -d ' ')
FRAME_RATE=$(ffprobe -v error -select_streams v:0 -show_entries stream=avg_frame_rate -of csv=p=0 "$VIDEO")
SIZE=$(ffprobe -v error -show_entries format=size -of csv=p=0 "$VIDEO")
[ "$VIDEO_STREAMS" = 1 ] || echo "WARN: $VIDEO_STREAMS video streams, expected 1"
[ "$FRAME_RATE" = 30/1 ] || echo "WARN: frame rate $FRAME_RATE, expected 30/1"
# GitHub's smallest limit for a video in a comment or PR body; paid plans allow more.
if [ "$SIZE" -gt 10000000 ]; then
  echo "WARN: $((SIZE / 1000000)) MB, over 10 MB: GitHub refuses videos this large on the free plan"
fi
# The first frame is the poster a PR's player shows, so it must already be the title card shown at 0.2 s; even a 5x
# render holds the card about 0.4 s.
luma() { ffmpeg -nostdin -v error -ss "$1" -i "$VIDEO" -frames:v 1 -vf "signalstats,metadata=mode=print:key=lavfi.signalstats.YAVG:file=-" -f null - | sed -n 's/.*YAVG=\([0-9.]*\).*/\1/p'; }
FIRST_LUMA=$(luma 0)
CARD_LUMA=$(luma 0.2)
POSTER_LUMA_TOLERANCE=20
if awk -v a="$FIRST_LUMA" -v b="$CARD_LUMA" -v tolerance="$POSTER_LUMA_TOLERANCE" \
  'BEGIN { d = a - b; exit !(d > tolerance || d < -tolerance) }'; then
  echo "WARN: the first frame (brightness $FIRST_LUMA) differs from the title card at 0.2 s ($CARD_LUMA): the poster is not the card"
fi

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

# The user points at a moment by its player time or its words; this maps both to a caption number.
awk 'BEGIN { RS = ""; FS = "\n" }
  function clock(stamp, part) { split(stamp, part, /[:,]/); return sprintf("%d:%02d", part[1] * 60 + part[2], part[3]) }
  { gsub(/\r/, ""); split($2, span, / --> /); text = $3
    for (i = 4; i <= NF; i++) text = text " " $i
    printf "%d %s-%s %s\n", $1, clock(span[1]), clock(span[2]), text }' "$SRT" > "$OUT/cues.txt"
echo "timeline sheets: $(find "$OUT/timeline" -type f | wc -l | tr -d ' '), cue sheets: $(find "$OUT" -maxdepth 1 -name 'cue-sheet*.png' | wc -l | tr -d ' '), captions: $(wc -l < "$OUT/cues.txt" | tr -d ' ') in $OUT/cues.txt"
