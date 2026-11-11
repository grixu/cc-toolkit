#!/usr/bin/env bash
# Stand-in for gh, copied to .sandbox/bin/gh by reset-sandbox.sh. The eval sandbox denies gh's
# credentials, so PR reads come from .sandbox/prs/<n>/ and the PR's bare origin, comment and PR
# writes are kept as .sandbox/gh-posted-*.md for the checks, and advisory lookups go to the public REST API
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

# An installation token (GITHUB_TOKEN, a GitHub App) acts as a bot and cannot read GET /user.
caller=eval-user
[ "${GH_STANDIN_INSTALLATION_TOKEN:-}" = 1 ] && caller='github-actions[bot]'

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
  fail "request without a body field"
}

# Keeps a created comment as .sandbox/gh-posted-<kind>-<n>-<k>.md and prints its id.
record_comment() {
  local kind="$1" n="$2" body="$3" k=1
  while [ -e "$sandbox/gh-posted-$kind-$n-$k.md" ]; do k=$((k + 1)); done
  printf '%s\n' "$body" > "$sandbox/gh-posted-$kind-$n-$k.md"
  echo $((9100 + k))
}

# The value of a --flag / --flag=value pair among the remaining arguments.
flag() {
  local name="$1"
  shift
  while [ $# -gt 0 ]; do
    case "$1" in
      "$name") printf '%s' "${2:-}"; return ;;
      "$name"=*) printf '%s' "${1#"$name"=}"; return ;;
    esac
    shift
  done
}

# gh's repeated --attach <path>: like gh, one missing file refuses the whole call before it does anything.
attachments=()
collect_attachments() {
  local a
  while [ $# -gt 0 ]; do
    case "$1" in
      --attach) attachments+=("${2:-}"); shift ;;
      --attach=*) attachments+=("${1#--attach=}") ;;
    esac
    shift
  done
  for a in ${attachments[@]+"${attachments[@]}"}; do
    [ -f "$a" ] || fail "$a: no such file"
  done
}

# A body from stdin as GitHub stores it after the upload: each ./<name> of an attached file becomes
# a user-attachments URL, numbered in --attach order.
attached_body() {
  local a names=()
  for a in ${attachments[@]+"${attachments[@]}"}; do names+=("$(basename "$a")"); done
  jq -R -s -j 'reduce range($ARGS.positional | length) as $i (.;
      split("./" + $ARGS.positional[$i]) | join("https://github.com/user-attachments/assets/\($i + 1)"))' \
    --args ${names[@]+"${names[@]}"}
}

# The open fixture PR whose head is the given branch, as a directory; empty when there is none.
pr_dir_for_head() {
  local f
  for f in "$sandbox"/prs/*/pr.json; do
    [ -e "$f" ] || continue
    jq -e --arg head "$1" '.headRefName == $head and .state == "OPEN"' "$f" > /dev/null && { dirname "$f"; return; }
  done
}

# The PR a `gh pr <cmd> [<number|url>]` call names, or like gh the current branch's without one.
target_dir() {
  local dir
  case "${1:-}" in
    ''|-*)
      dir="$(pr_dir_for_head "$(git branch --show-current)")"
      [ -n "$dir" ] || fail "no pull requests found for branch \"$(git branch --show-current)\"" ;;
    *) dir="$(pr_dir "$1")" || exit 1 ;;
  esac
  printf '%s' "$dir"
}

case "${1:-} ${2:-}" in
  'auth status') echo "github.com: Logged in to github.com account $caller"; exit 0 ;;
  'repo view')
    echo '{"nameWithOwner":"example/web","name":"web","owner":{"login":"example"},"url":"https://github.com/example/web","defaultBranchRef":{"name":"main"}}' | emit
    exit 0 ;;
  'pr view')
    dir="$(target_dir "${3:-}")" || exit 1
    pr_json "$dir" | emit
    exit 0 ;;
  'pr list')
    shift 2
    head="$(flag --head "$@")"
    state="$(flag --state "$@" | tr '[:lower:]' '[:upper:]')"
    for f in "$sandbox"/prs/*/pr.json; do
      [ -e "$f" ] && cat "$f"
    done | jq -s --arg head "$head" --arg state "${state:-OPEN}" \
      'map(select(($head == "" or .headRefName == $head) and ($state == "ALL" or .state == $state))
        | . + {url: "https://github.com/example/web/pull/\(.number)"})' | emit
    exit 0 ;;
  'pr create')
    shift 2
    collect_attachments "$@"
    head="$(flag --head "$@")"
    [ -n "$head" ] || head="$(git branch --show-current)"
    [ -z "$(pr_dir_for_head "$head")" ] || fail "a pull request for branch \"$head\" already exists"
    body_file="$(flag --body-file "$@")"
    [ -n "$body_file" ] || body_file="$(flag -F "$@")"
    [ -n "$body_file" ] || fail "pr create without --body-file"
    git ls-remote --exit-code origin "refs/heads/$head" > /dev/null 2>&1 || fail "head branch \"$head\" is not on the remote"
    key="$(printf '%s' "$head" | tr '/' '-')"
    attached_body < "$body_file" > "$sandbox/gh-posted-pr-create-$key.md"
    title="$(flag --title "$@")"
    base="$(flag --base "$@")"
    draft="$(case " $* " in *' --draft '*) echo true ;; *) echo false ;; esac)"
    jq -n --arg title "$title" --arg base "$base" --arg head "$head" --argjson draft "$draft" \
      '{title: $title, base: $base, head: $head, draft: $draft}' > "$sandbox/gh-posted-pr-create-$key.json"
    # Scenarios of one trial run concurrently; mkdir claims a number atomically.
    n=9001
    until mkdir "$sandbox/prs/$n" 2> /dev/null; do n=$((n + 1)); done
    origin="$(git remote get-url origin)"
    git --git-dir="$origin" update-ref "refs/pull/$n/head" "refs/heads/$head"
    printf '%s\n' "$origin" > "$sandbox/prs/$n/origin"
    echo '[]' > "$sandbox/prs/$n/comments.json"
    jq -n --argjson n "$n" --arg title "$title" --arg base "${base:-main}" --arg head "$head" --argjson draft "$draft" \
      --rawfile body "$sandbox/gh-posted-pr-create-$key.md" \
      '{number: $n, title: $title, author: {login: "eval-user"}, headRefName: $head, baseRefName: $base,
        state: "OPEN", isDraft: $draft, labels: [], assignees: [], body: $body}' > "$sandbox/prs/$n/pr.json"
    echo "https://github.com/example/web/pull/$n"
    exit 0 ;;
  'pr edit')
    shift 2
    collect_attachments "$@"
    target=''
    case "${1:-}" in ''|-*) ;; *) target="$1"; shift ;; esac
    dir="$(target_dir "$target")" || exit 1
    n="$(basename "$dir")"
    body_file="$(flag --body-file "$@")"
    [ -n "$body_file" ] || body_file="$(flag -F "$@")"
    if [ -n "$body_file" ]; then
      attached_body < "$body_file" > "$sandbox/gh-posted-pr-edit-$n.md"
      jq --rawfile body "$sandbox/gh-posted-pr-edit-$n.md" '.body = $body' "$dir/pr.json" > "$dir/pr.json.tmp" && mv "$dir/pr.json.tmp" "$dir/pr.json"
    fi
    inline="$(flag --body "$@")$(flag -b "$@")"
    [ -z "$inline" ] || printf '%s\n' "$inline" > "$sandbox/gh-posted-pr-edit-inline-$n.md"
    add="$(flag --add-label "$@")"
    remove="$(flag --remove-label "$@")"
    jq --arg add "$add" --arg remove "$remove" \
      '.labels = ([(.labels // [])[] | select(.name != $remove)] + (if $add == "" then [] else [{name: $add}] end) | unique_by(.name))' \
      "$dir/pr.json" > "$dir/pr.json.tmp" && mv "$dir/pr.json.tmp" "$dir/pr.json"
    echo "https://github.com/example/web/pull/$n"
    exit 0 ;;
  'label create') exit 0 ;;
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
    collect_attachments "$@"
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
        --attach) shift ;;
      esac
      shift
    done
    [ -n "$body" ] || fail "pr comment without a body"
    body="$(printf '%s' "$body" | attached_body)"
    echo "https://github.com/example/web/pull/$n#issuecomment-$(record_comment "$kind" "$n" "$body")"
    exit 0 ;;
esac

[ "${1:-}" = api ] || fail "unsupported call: $*"
shift
method='' path='' input='' fields=()
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
path="${path//\{owner\}/example}"
path="${path//\{repo\}/web}"
# Like gh: without -X, a request that carries parameters is a POST.
if [ -z "$method" ]; then
  method=GET
  [ -n "$input" ] || [ -n "${fields[*]+x}" ] && method=POST
fi

case "$path" in
  repos/example/.github/contents*)
    echo 'gh: Not Found (HTTP 404)' >&2
    exit 1 ;;
  user)
    [ "$caller" = eval-user ] || { echo 'gh: Resource not accessible by integration (HTTP 403)' >&2; exit 1; }
    echo '{"login":"eval-user"}' | emit
    exit 0 ;;
  graphql)
    query='' n=''
    for f in ${fields[@]+"${fields[@]}"}; do
      case "$f" in
        ?:query=*) query="${f#?:query=}" ;;
        ?:number=*) n="${f#?:number=}" ;;
      esac
    done
    case "$query" in *pullRequest*comments*) ;; *) fail "unsupported graphql query: $query" ;; esac
    dir="$(pr_dir "$n")"
    # A fixture comment without author_association is the eval user's own repository (OWNER) or a stranger's.
    jq --arg caller "$caller" '{data: {repository: {pullRequest: {comments: {nodes: [.[] | {
        databaseId: .id, body, createdAt: .created_at, author: {login: .user.login},
        viewerDidAuthor: (.user.login == $caller),
        authorAssociation: (.author_association // (if .user.login == "eval-user" then "OWNER" else "NONE" end))}]}}}}}' \
      "$dir/comments.json" | emit
    exit 0 ;;
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
    n="$(printf '%s' "$path" | sed -E 's#repos/example/web/issues/([0-9]+)/comments.*#\1#')"
    dir="$(pr_dir "$n")"
    case "$method" in
      GET) emit < "$dir/comments.json" ;;
      POST)
        body="$(body_from_fields "$input" ${fields[@]+"${fields[@]}"})" || exit 1
        [ -n "$body" ] || fail "comment without a body"
        id="$(record_comment comment "$n" "$body")"
        printf '{"id":%s,"html_url":"https://github.com/example/web/pull/%s#issuecomment-%s"}\n' "$id" "$n" "$id" | emit ;;
      *) fail "unsupported $method on $path" ;;
    esac
    exit 0 ;;
  repos/example/web/issues/comments/*)
    id="${path##*/}"
    case "$method" in PATCH|DELETE) ;; *) fail "only PATCH and DELETE are supported on a single comment" ;; esac
    owner_file=''
    for f in "$sandbox"/prs/*/comments.json; do
      jq -e --argjson id "$id" 'any(.[]; .id == $id)' "$f" > /dev/null && { owner_file="$f"; break; }
    done
    if [ -z "$owner_file" ]; then
      echo 'gh: Not Found (HTTP 404)' >&2
      exit 1
    fi
    if [ "$method" = DELETE ]; then
      jq --argjson id "$id" 'map(select(.id != $id))' "$owner_file" > "$owner_file.tmp" && mv "$owner_file.tmp" "$owner_file"
      exit 0
    fi
    n="$(basename "$(dirname "$owner_file")")"
    # No ownership check: GitHub lets any token with write access edit anyone's comment.
    body="$(body_from_fields "$input" ${fields[@]+"${fields[@]}"})" || exit 1
    printf '%s\n' "$body" > "$sandbox/gh-posted-patch-$id.md"
    printf '{"id":%s,"html_url":"https://github.com/example/web/pull/%s#issuecomment-%s"}\n' "$id" "$n" "$id" | emit
    exit 0 ;;
esac
fail "unsupported call: api $path"
