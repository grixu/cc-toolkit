---
title: Installation
description: Add the cc-toolkit marketplace to Claude Code, install a plugin, and keep it up to date.
group: start
sidebar:
  order: 2
---

This page shows how to add the cc-toolkit marketplace, install a plugin from it, and update it later. Claude Code must already be installed.

## Install a plugin

1. In a Claude Code session, add the marketplace:

   ```
   /plugin marketplace add grixu/cc-toolkit
   ```

2. Install a plugin by name:

   ```
   /plugin install code-review@cc-toolkit
   ```

3. Review what the plugin adds, then choose a scope:
   - **User:** you get the plugin in every project on this machine.
   - **Project:** the plugin is enabled for everyone who works in this repository. Claude Code writes it to `.claude/settings.json`.
   - **Local:** you get the plugin in this repository only.

To check that it worked, type `/` and look for entries that start with the plugin name, such as `/code-review:start-cr`. Run `/plugin` with no arguments to browse every plugin in the marketplace.

## Install from your shell

You can also install without opening a session:

```sh
claude plugin marketplace add grixu/cc-toolkit
claude plugin install code-review@cc-toolkit
```

The shell install uses the user scope. Pass `--scope project` or `--scope local` to change it. Plugins installed this way load the next time you start Claude Code, or after `/reload-plugins` in an open session.

## Update plugins

Auto-update is off by default for third-party marketplaces like this one. To update from a session, run `/plugin`, open the **Marketplaces** tab, select `cc-toolkit`, and choose **Update marketplace**. On the same tab you can turn on auto-update.

To update from your shell, fetch the new marketplace first, then update the plugin:

```sh
claude plugin marketplace update cc-toolkit
claude plugin update dev-kit@cc-toolkit
```

Run `/reload-plugins` in open sessions, or restart them, to load the new version.

## Renamed and removed plugins

- `comment-review` and `quality-review` were replaced by [code-review](/plugins/code-review/) and are no longer published. Uninstall them if you still have them, or you'll see duplicate skill names.
- `feature-delivery` was removed. Use [fd3](/plugins/fd3/) instead, and uninstall it if you still have it.
