---
title: pr-proof
description: Records a narrated walkthrough video of a pull request's change against your running app and attaches it once you accept it.
---

pr-proof shows that a pull request's change works, in a form a reviewer can check without running the branch. It records a narrated video of the feature against your running app and reports the defects it saw on camera.

## Install

```
/plugin install pr-proof@cc-toolkit
```

pr-proof needs a web app that runs locally, plus these tools:

- Node.js 22.18 or later and `pnpm`
- `ffmpeg` with libass
- `timeout` (from coreutils on macOS)
- `gh` 2.103 or later

## What it does

| Command or skill | What it does |
|---|---|
| `/pr-proof:walkthrough-video` | Records a narrated MP4 of a feature or a pull request's change with playwright-recast, from its spec or from requirements reconstructed out of the code. Attaches it to the pull request once you accept it. |

The skill also starts on its own when you describe the task, for example "record a demo of this PR." Another agent can dispatch it too.

Before it writes the scenario, it asks you to confirm every derived requirement and open decision, such as real or staged data. A defect seen on camera goes into the report and is never captioned as a success.

## Usage

- Record the change in a pull request:

  ```
  /pr-proof:walkthrough-video 42
  ```

  The video shows what the pull request made different for a user.

- Record a feature from its spec, for a named viewer and request:

  ```
  /pr-proof:walkthrough-video docs/specs/invites.md "product owner, the invite flow end to end"
  ```

  Without a pull request or branch, the video shows the whole feature.

Once you accept the video, it's copied to `~/Downloads/<ticket-or-PR>-<slug>.mp4`. It's also attached under a `### Video walkthrough` section at the end of the pull request description.

The [plugin README](https://github.com/grixu/cc-toolkit/blob/main/plugins/pr-proof/README.md) has every option.
