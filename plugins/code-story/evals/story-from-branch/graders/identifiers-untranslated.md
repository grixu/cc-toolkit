---
type: regex
target: { source: file, path: .scratch/code-story/feat-retry-cap/story.html }
pattern: 'data-lang="pl"[^>]*>(?:(?!data-lang=)[\s\S])*?<code>(?:computeDelay|MAX_DELAY_MS|RETRYABLE_STATUSES)'
---
