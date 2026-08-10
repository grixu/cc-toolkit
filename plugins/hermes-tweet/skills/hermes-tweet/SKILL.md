---
name: hermes-tweet
description: Use when a Claude Code user wants to install or operate Hermes Tweet, the native Hermes Agent X/Twitter plugin for Xquik workflows.
---

# Hermes Tweet

Use this skill when the user wants Hermes Agent to search, inspect, summarize,
or act on X/Twitter through Hermes Tweet.

## Scope

Hermes Tweet is a native Hermes Agent plugin published at
<https://github.com/Xquik-dev/hermes-tweet>. This Claude Code plugin is an
operator guide for installing and using that Hermes plugin. It does not replace
the Hermes Agent runtime package.

## Install

Recommended Hermes install:

```bash
hermes plugins install Xquik-dev/hermes-tweet --enable
```

If Hermes discovers the plugin but leaves it disabled, run:

```bash
hermes plugins enable hermes-tweet
```

Hermes prompts for `XQUIK_API_KEY` during interactive install. In
non-interactive installs, configure it in the Hermes runtime environment or in
`~/.hermes/.env`. Do not ask the user to paste API keys into chat.

## Workflow

1. Use `tweet_explore` to discover the catalog route.
2. Use `tweet_read` for read-only X/Twitter endpoints.
3. Use `tweet_action` only after the user approves a write, private read,
   monitor, webhook, extraction job, giveaway draw, or media operation.

## Decision Rules

- Use `tweet_explore` first for endpoint discovery.
- Use `tweet_read` only after a read-only endpoint is known.
- Use `tweet_action` only for non-GET routes, private account state, or
  account-changing operations.
- Keep `HERMES_TWEET_ENABLE_ACTIONS=false` unless the session intentionally
  needs controlled actions.
- If `tweet_action` is unavailable, explain that actions are intentionally
  gated by `HERMES_TWEET_ENABLE_ACTIONS=true`.
- If `XQUIK_API_KEY` is missing, ask the user to configure it in the Hermes
  runtime environment without sharing the value.

## Good Fits

- Social listening
- Launch monitoring
- Support triage
- Creator or brand research
- Giveaway and community audits
- Controlled publishing with explicit approval

## Safety

- Never request, reveal, or place credentials in tool arguments.
- Never use account connection, re-authentication, API key, billing, credit
  top-up, or support-ticket endpoints.
- Do not guess endpoint paths. Use the catalog returned by `tweet_explore`.
- Summarize any write or private action before calling `tweet_action`.

## Checks

After installing or upgrading Hermes Tweet:

```bash
hermes plugins list
hermes tools list
```

Confirm `hermes-tweet` is enabled, `tweet_explore` is available, and `tweet_read`
appears only after `XQUIK_API_KEY` is configured.
