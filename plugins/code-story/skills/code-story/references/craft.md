# Writing the chapters

A **code story** re-cuts a change into the **stack of PRs** it could have been. One big diff lands whole; a stack arrives one reviewable step at a time, each standing on the last. Each **chapter** is one step in that stack:

- it answers one question, and its `<h2>` *is* that question;
- it pulls out a **slice** of the change (hunks) from whichever files help answer it;
- it hands the reader the next question.

Order the chapters the way understanding has to build.

**Reader.** A day-one contributor who knows nothing about this domain, codebase or architecture.

**Voice.** Short, plain sentences in Simplified Technical English (or its plain equivalent in the second language), written as a technical writer would.

**Scope of a chapter.** One chapter per mechanism, not per file or per commit. A two-file change with three ideas gets three chapters. A typical story has 4–8.

**Tell it around code.** Each chapter is built from the lines it is about, whether changed, unchanged or from a dependency, with a note pinning each claim to a line. Everything else exists to make those lines mean something.

**Show before you tell.** Reach for a picture before a paragraph whenever one carries the same meaning:

| Shape | What it shows | How to draw it |
|---|---|---|
| Call graph or dependency graph | what reaches what | built-in diagram, `diagrams/lite.md` |
| Sequence | order across participants | built-in diagram |
| State diagram | the states something moves through | built-in diagram |
| Call tree | what runs when you call something | `diff tree` block |
| File tree | where the change lands | `diff tree` block |
| Behaviour table | one case as input, before and after | table |

Prose carries what none of them can.

**Honesty.**
- Where the reasoning is nowhere to be found (PR body, issue, commits, review, SPEC, code comments), the story says so rather than inventing one.
- The last chapter closes with where each *why* came from.
- Say plainly where you think the change is wrong.
- A "Watch out" callout needs a line of code or a test you can point at. Intended behaviour that merely surprised you is not a warning.

## A chapter file

`chapters/NN.html` holds exactly one `<article>`. Every fact git knows is filled in by `assemble.mjs`, never typed:

- line ranges in the block header;
- `+N / −N` counts;
- chapter numbers;
- UI labels.

```html
<article>
  <div class="hd">
    <span class="eb" data-lang="en">what this chapter covers, in a few words</span>
    <span class="eb" data-lang="pl">…</span>
    <h2 data-lang="en">The question this chapter answers?</h2>
    <h2 data-lang="pl">…?</h2>
    <p class="q" data-lang="en">What the reader cannot understand without this chapter.</p>
    <p class="q" data-lang="pl">…</p>
  </div>

  <div class="pr" data-lang="en"><p>The prose.</p></div>
  <div class="pr" data-lang="pl"><p>…</p></div>

  <div class="dx">
    <div class="dh"><b>path/to/file.ts</b></div>
    <pre class="diff" style="counter-reset:l 56"><code
><i class=c>unchanged line for context</i
><i class=a data-n=1>added line with a <mark>token</mark> the note explains</i
><i class=d>removed line</i
><i class=e style="counter-set:l 82"></i
><i class=c>another unchanged line after the gap</i
></code></pre>
  </div>
  <ol class="nt" start="1" data-lang="en"><li>Why that line is the way it is.</li></ol>
  <ol class="nt" start="1" data-lang="pl"><li>…</li></ol>
</article>
```

**Languages.** Every block of words carries `data-lang`, once per story language and in the same order. Code blocks, trees and diagrams with code-name labels are shared and carry none. An English-only story leaves `data-lang` out everywhere.

**Diff blocks.**
- Line classes:
  - `a`: added
  - `d`: removed
  - `c`: unchanged
  - `e`: elision (⋯)
- `counter-reset:l N`: N is the line **before** the first one shown.
- Every elision declares `counter-set:l N`, where N is the line before the next one shown.
- Numbering follows the file **after** the change. To quote the file **before** it, use `<pre class="diff base">`: removed lines then carry the old numbers.
- Copy each line verbatim from the file, without the leading `+`/`−` (CSS draws the signs) and without added comments. `check.mjs` compares every numbered line with the real file and fails on any mismatch. Leading indentation may be trimmed.
- Escape `<`, `>` and `&` inside a line (`Promise&lt;string&gt;`). Only `<mark>`, `<b>`, `<em>` and `<span>` may appear inside one.
- Keep the split close tags (`</i` then `><i`) so no whitespace lands between lines.
- A block that is not this branch's file gets a header tag. `check.mjs` then skips the content check:
  - `<span class="tag" data-ui="dependency"></span>`
  - `data-ui="unchanged"`, for an unchanged file shown from another ref
  - `data-ui="beforeChange"`
- `data-n=K` pairs a line with note K. `<mark>` marks the one token the note is about.
- The `<ol class="nt" start=K>` after a block starts at that block's first `data-n`, in every language.

**Trees.** For a call tree or file tree, use `<pre class="diff tree">` with the same `<i>` lines:
- indent with spaces;
- `a` means added, `d` removed, `c` already there, `<span class="k">` a dimmed path prefix;
- a file's counts come from `<span class="k" data-stat="path/to/file"></span>`;
- the header carries `<span class="tag" data-ui="callTree"></span>` or `"fileTree"`.

**Behaviour table.** One per language, only rows that actually change, and only what you can point at in the code or tests:

```html
<div class="tb" data-lang="en"><table>
  <tr><th data-ui="given"></th><th data-ui="before"></th><th data-ui="after"></th></tr>
  <tr><td>the input case</td><td class="was">what happened</td><td class="now">what happens now</td></tr>
</table></div>
```

**Callouts**, sparingly: `<aside class="ki" data-lang="en"><p>…</p></aside>` is a key insight; `class="wo"` is a watch out. Their labels come from the page.

**Diagrams.** See `diagrams/lite.md`.

**Last chapter.** It ends with two short lists, each heading from the page, the lists once per language:
- the files that earned no chapter:

  ```html
  <h3 data-ui="cast"></h3>
  <ul class="cast" data-lang="en"><li data-file="exact/path.ts">what it is, and why it needs no chapter.</li></ul>
  ```

  `assemble.mjs` prefixes each item with the path and its `(+N / −N)` and fails on a path the change does not touch.
- where each *why* came from:

  ```html
  <h3 data-ui="sources"></h3>
  <ul class="cast" data-lang="en"><li><b>The PR description</b>: …</li><li><b>Still unanswered</b>: …</li></ul>
  ```

**Stack stories.** Every chapter carries `data-part="#4168 · short PR title"`. Chapters run from the bottom of the stack up, and the rail groups them by part. A mechanism belongs to the PR that introduces it.

## The second language

Translate the prose, notes, captions, table cells and callouts. Keep the same facts, the same notes and the same order: a translation, not a summary. Keep in English, untranslated:

- everything inside `<code>`, file paths, CLI commands and output;
- names from the code: entities, classes, types, functions, tables, columns, endpoints, events, flags, env vars, config keys;
- established programming terms a developer reads in English anyway: commit, branch, merge, pull request, cache, worker, hook, middleware, endpoint, payload, retry, lock, sandbox, migration, feature flag, race condition.

When the settings say `glossFirstUse`, follow an English term's **first** use in the story with its translation in parentheses, for example "worker (proces roboczy)", and never again.

Write the second language in short, plain sentences too; it is not a literal word-for-word copy of the English.

## What a finished chapter looks like

From the reference story (`references/example.html`, a 6-chapter story about a 25-file Vitest PR; open it only when a choice is unclear). Note the size: one question, one dependency line that explains the cause, one added line that fixes it, two notes.

```html
<article>
  <div class="hd">
    <span class="eb">one missing line</span>
    <h2>Who still holds the file's code after the test ends?</h2>
    <p class="q">The sandbox should be deleted when the file ends. But an object outside the sandbox is still pointing to it.</p>
  </div>
  <div class="pr">
    <p>The cause is an unlikely object. It is the tool that makes error messages easy to read.</p>
    <p>That list stays in the worker. The list is never emptied unless you call a function. Vite provides a way to empty it using <code>close()</code>, but Vitest never called it.</p>
  </div>
  <div class="dx">
    <div class="dh"><b>vite · module-runner/sourcemap/interceptor.ts</b><span class="tag" data-ui="dependency"></span></div>
    <pre class="diff" style="counter-reset:l 23"><code
><i class=c data-n=1>const <mark>evaluatedModulesCache</mark> = new Set&lt;EvaluatedModules&gt;()</i
></code></pre>
  </div>
  <ol class="nt" start="1">
    <li>This is the list. It is a plain <code>Set</code> at the top of a module. Because of this, it stays alive as long as the worker lives.</li>
  </ol>
  <div class="dx">
    <div class="dh"><b>packages/vitest/src/runtime/workers/vm.ts</b></div>
    <pre class="diff" style="counter-reset:l 175"><code
><i class=c>  finally {</i
><i class=c>    await traces.$('…environment.teardown', () =&gt; vm.teardown?.())</i
><i class=a data-n=2>await moduleRunner.<mark>close</mark>()</i
><i class=c>  }</i
></code></pre>
  </div>
  <ol class="nt" start="2">
    <li>Adding one line fixes this cause. The line is inside a <code>finally</code> block, so it runs even if a test file fails; and it runs after teardown, so no more stack traces will be needed for that file.</li>
  </ol>
</article>
```
