# Changelog

## [Unreleased]

### Changed

- Webhook deliveries time out after 15 s, and every retry backs off through the shared retry
  policy.

## [1.3.0] — 2026-09-02

### Added

- Webhook delivery. A webhook call times out after 10 s.
