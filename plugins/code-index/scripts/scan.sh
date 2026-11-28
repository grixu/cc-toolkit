#!/usr/bin/env bash
#
# scan.sh — summarize what a zvec-grep index of <root> would contain, so the
#           setup skill can propose exclusions from numbers instead of guesses.
#
# Usage:
#   scan.sh <root>
#
# Lists the files zg would scan (its own ripgrep, .gitignore and .zgignore
# applied) and prints, as tab-separated sections: totals, top directories,
# extensions, largest files, generated-looking paths, and files with NUL bytes.

# No pipefail: the `sort | head` reports end on SIGPIPE by design.
set -eu

[[ $# -eq 1 && -d "$1" ]] || { echo "usage: scan.sh <root>" >&2; exit 2; }
command -v zg >/dev/null || { echo "scan: zg is not installed" >&2; exit 2; }

root="$(cd "$1" && pwd -P)"
rg_args=(--files)
[[ -f "$root/.zgignore" ]] && rg_args+=(--ignore-file "$root/.zgignore")

tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT

# path <TAB> bytes <TAB> nul-count for every file zg would scan.
( cd "$root" && zg --rg "${rg_args[@]}" ) | ( cd "$root" && perl -ne '
    chomp; my $f = $_; next unless -f $f;
    my $size = -s _; my $nul = 0;
    if ($size > 0 && $size <= 64 * 1024 * 1024 && open(my $fh, "<:raw", $f)) {
      local $/; my $d = <$fh>; close $fh; $nul = ($d =~ tr/\0//);
      # Text means valid UTF-8 once the NULs are gone; images and fonts are not.
      if ($nul) { (my $t = $d) =~ tr/\0//d; $nul = 0 unless utf8::decode($t); }
    }
    print "$f\t$size\t$nul\n";
  ' ) >"$tmp"
[[ -s "$tmp" ]] || { echo "scan: zg listed no files under $root" >&2; exit 1; }

human() { awk '{ s=$1; u="B"; if (s>=1048576) { s/=1048576; u="MB" } else if (s>=1024) { s/=1024; u="KB" } printf "%.1f %s", s, u }' <<<"$1"; }

echo "== totals"
awk -F'\t' '{ n++; b+=$2 } END { printf "files\t%d\nbytes\t%d\n", n, b }' "$tmp"

echo
echo "== top directories (depth 2): files, bytes, path"
awk -F'\t' '{
    n = split($1, p, "/"); d = (n > 2) ? p[1] "/" p[2] : (n == 2 ? p[1] : ".");
    c[d]++; b[d] += $2
  } END { for (d in c) printf "%d\t%d\t%s\n", c[d], b[d], d }' "$tmp" | sort -t$'\t' -k2,2nr | head -25

echo
echo "== extensions: files, bytes, ext"
awk -F'\t' '{
    f = $1; sub(/.*\//, "", f); e = (f ~ /\./) ? f : "(none)"; sub(/.*\./, "", e);
    c[e]++; b[e] += $2
  } END { for (e in c) printf "%d\t%d\t%s\n", c[e], b[e], e }' "$tmp" | sort -t$'\t' -k2,2nr | head -20

echo
echo "== largest files: bytes, path"
sort -t$'\t' -k2,2nr "$tmp" | head -20 | awk -F'\t' '{ printf "%d\t%s\n", $2, $1 }'

echo
echo "== generated-looking paths: files, bytes, pattern"
awk -F'\t' '{
    f = $1; hit = "";
    if (f ~ /(^|\/)(dist|build|out|coverage|\.next|\.nuxt|\.output|storybook-static|renders|snapshots|__snapshots__|fixtures|vendor|generated|__generated__)\//) {
      m = f; sub(/\/[^\/]*$/, "", m); hit = m
    } else if (f ~ /(^|\/)(pnpm-lock\.yaml|package-lock\.json|yarn\.lock)$/) {
      hit = f
    } else if (f ~ /\.(min\.js|min\.css|map|lock|snap)$/) {
      match(f, /(\.min)?\.[^.\/]+$/); hit = "*" substr(f, RSTART)
    }
    if (hit != "") { c[hit]++; b[hit] += $2 }
  } END { for (h in c) printf "%d\t%d\t%s\n", c[h], b[h], h }' "$tmp" | sort -t$'\t' -k2,2nr | head -25

echo
echo "== files with NUL bytes in mostly-text content (index-guard excludes these)"
awk -F'\t' '$3 > 0 && ($3 <= 16 || $3 * 100 < $2) { print $1 }' "$tmp"

total="$(awk -F'\t' '{ b+=$2 } END { print b+0 }' "$tmp")"
echo
echo "== summary: $(wc -l <"$tmp" | tr -d ' ') files, $(human "$total")"
