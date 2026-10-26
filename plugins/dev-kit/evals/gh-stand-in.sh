#!/usr/bin/env bash
# Stand-in for gh, copied to .sandbox/bin/gh by reset-sandbox.sh. The eval sandbox denies gh's
# credentials, so PR reads come from .sandbox/prs/<n>/ and the PR's bare origin, comment writes are
# kept as .sandbox/gh-posted-*.md for the checks, and advisory lookups go to the public REST API
# unauthenticated. Every call is logged to .sandbox/gh-calls.log with the directory it ran in.
set -uo pipefail

sandbox="$(cd "$(dirname "$0")/.." && pwd)"
# Outside .sandbox/ so a reset keeps it: the unauthenticated API allows 60 requests an hour.
cache="$sandbox/../.results/gh-cache"
printf '%s # in %s\n' "$*" "$PWD" >> "$sandbox/gh-calls.log"

jq_expr=''
args=()
while [ $# -gt 0 ]; do
  case "$1" in
    --jq|-q) jq_expr="$2"; shift ;;
    --jq=*) jq_expr="${1#--jq=}" ;;
    *) args+=("$1") ;;
  esac
  shift
done
set -- ${args[@]+"${args[@]}"}

emit() { if [ -n "$jq_expr" ]; then jq -r "$jq_expr"; else cat; fi; }
fail() { echo "gh stand-in: $*" >&2; exit 1; }

pr_dir() {
  local n
  n="$(printf '%s' "$1" | sed -E 's#.*/pull/([0-9]+).*#\1#; s/^#//')"
  [ -d "$sandbox/prs/$n" ] || fail "no pull request $1"
  printf '%s' "$sandbox/prs/$n"
}

pr_json() {
  local dir="$1" n origin head
  n="$(basename "$dir")"
  origin="$(cat "$dir/origin")"
  head="$(git --git-dir="$origin" rev-parse "refs/pull/$n/head")"
  git --git-dir="$origin" diff --numstat main "refs/pull/$n/head" |
    jq -R -s 'split("\n") | map(select(length > 0) | split("\t") | {path: .[2], additions: (.[0] | tonumber), deletions: (.[1] | tonumber)})' > "$dir/.files.json"
  jq --arg head "$head" --slurpfile files "$dir/.files.json" --slurpfile comments "$dir/comments.json" \
    '. + {url: "https://github.com/example/web/pull/\(.number)", headRefOid: $head, files: $files[0],
          comments: [$comments[0][] | {author: {login: .user.login}, body, createdAt: .created_at,
                     url: "https://github.com/example/web/pull/\(.number)#issuecomment-\(.id)"}]}' "$dir/pr.json"
}

# gh's -f/-F/--input forms of a body field; -F reads @file.
body_from_fields() {
  local input="$1"
  shift
  if [ -n "$input" ]; then
    jq -r '.body' "$input"
    return
  fi
  while [ $# -gt 0 ]; do
    case "$1" in
      F:body=@*) cat "${1#F:body=@}"; return ;;
      [fF]:body=*) printf '%s' "${1#?:body=}"; return ;;
    esac
    shift
  done
  fail "PATCH without a body field"
}

case "${1:-} ${2:-}" in
  'auth status') echo 'github.com: Logged in to github.com account eval-user'; exit 0 ;;
  'repo view')
    echo '{"nameWithOwner":"example/web","name":"web","owner":{"login":"example"},"url":"https://github.com/example/web","defaultBranchRef":{"name":"main"}}' | emit
    exit 0 ;;
  'pr view')
    dir="$(pr_dir "${3:-}")"
    pr_json "$dir" | emit
    exit 0 ;;
  'pr diff')
    dir="$(pr_dir "${3:-}")"
    n="$(basename "$dir")"
    origin="$(cat "$dir/origin")"
    case " $* " in
      *' --name-only '*) git --git-dir="$origin" diff --name-only main "refs/pull/$n/head" ;;
      *) git --git-dir="$origin" diff main "refs/pull/$n/head" ;;
    esac
    exit 0 ;;
  'pr checks') fail "no checks reported on the pull request" ;;
  'pr comment')
    dir="$(pr_dir "${3:-}")"
    n="$(basename "$dir")"
    shift 3
    kind=comment body=''
    while [ $# -gt 0 ]; do
      case "$1" in
        --body-file|-F) body="$(cat "$2")"; shift ;;
        --body-file=*) body="$(cat "${1#--body-file=}")" ;;
        --body|-b) body="$2"; shift ;;
        --body=*) body="${1#--body=}" ;;
        --edit-last) kind=edit-last ;;
      esac
      shift
    done
    [ -n "$body" ] || fail "pr comment without a body"
    k=1
    while [ -e "$sandbox/gh-posted-$kind-$n-$k.md" ]; do k=$((k + 1)); done
    printf '%s\n' "$body" > "$sandbox/gh-posted-$kind-$n-$k.md"
    echo "https://github.com/example/web/pull/$n#issuecomment-$((9100 + k))"
    exit 0 ;;
esac

[ "${1:-}" = api ] || fail "unsupported call: $*"
shift
method=GET path='' input='' fields=()
while [ $# -gt 0 ]; do
  case "$1" in
    -X|--method) method="$(printf '%s' "$2" | tr '[:lower:]' '[:upper:]')"; shift ;;
    -X*) method="$(printf '%s' "${1#-X}" | tr '[:lower:]' '[:upper:]')" ;;
    --method=*) method="$(printf '%s' "${1#--method=}" | tr '[:lower:]' '[:upper:]')" ;;
    -f|--raw-field) fields+=("f:$2"); shift ;;
    -F|--field) fields+=("F:$2"); shift ;;
    --input) input="$2"; shift ;;
    -H|--header|--hostname|--cache) shift ;;
    --paginate|--slurp|-i|--include|--silent) ;;
    -*) ;;
    *) [ -z "$path" ] && path="${1#/}" ;;
  esac
  shift
done

case "$path" in
  user) echo '{"login":"eval-user"}' | emit; exit 0 ;;
  advisories*)
    [ "$method" = GET ] || fail "advisories is read-only"
    query="${path#advisories}"
    query="${query#\?}"
    for f in ${fields[@]+"${fields[@]}"}; do
      kv="${f#?:}"
      query="${query:+$query&}${kv%%=*}=$(jq -rn --arg v "${kv#*=}" '$v | @uri')"
    done
    case "&$query" in *'&per_page='*) ;; *) query="${query:+$query&}per_page=100" ;; esac
    url="https://api.github.com/advisories?$query"
    mkdir -p "$cache"
    key="$cache/$(printf '%s' "$url" | shasum -a 256 | cut -c1-32).json"
    if [ -n "$(find "$key" -mmin -1440 2>/dev/null)" ]; then
      emit < "$key"
      exit 0
    fi
    # Not mktemp: macOS puts it under /var/folders, which the eval sandbox denies.
    tmp="$key.part.$$"
    code="$(curl -sS -o "$tmp" -w '%{http_code}' -H 'Accept: application/vnd.github+json' "$url")" || fail "advisories request failed"
    if [ "$code" != 200 ]; then
      cat "$tmp" >&2
      rm -f "$tmp"
      fail "advisories answered HTTP $code"
    fi
    mv "$tmp" "$key"
    emit < "$key"
    exit 0 ;;
  repos/example/web/issues/*/comments*)
    [ "$method" = GET ] || fail "comment creation goes through gh pr comment in this stand-in"
    n="$(printf '%s' "$path" | sed -E 's#repos/example/web/issues/([0-9]+)/comments.*#\1#')"
    dir="$(pr_dir "$n")"
    emit < "$dir/comments.json"
    exit 0 ;;
  repos/example/web/issues/comments/*)
    id="${path##*/}"
    [ "$method" = PATCH ] || fail "only PATCH is supported on a single comment"
    body="$(body_from_fields "$input" ${fields[@]+"${fields[@]}"})" || exit 1
    printf '%s\n' "$body" > "$sandbox/gh-posted-patch-$id.md"
    printf '{"id":%s,"html_url":"https://github.com/example/web/pull/0#issuecomment-%s"}\n' "$id" "$id" | emit
    exit 0 ;;
esac
fail "unsupported call: api $path"
