# MCP Fallback Reference

Instructions for the namesmith skill when domain availability checking fails or is unavailable.

---

## Detection Probe

Before running domain checks, probe MCP health with a single lightweight call:

```
search_domains(query: "[first-survivor-name]", tlds: [".com"])
```

- **Success** → MCP is healthy; proceed with full domain checks
- **Tool not found** → UNAVAILABLE state
- **HTTP error, timeout, or transport error** → DEGRADED state
- **Do not retry more than once** — if the probe fails, go straight to fallback

---

## UNAVAILABLE Notice

Use when the `instant-domain-search` MCP tool is not found (service down, plugin not yet activated, or streamable-HTTP transport issue).

```
> **Domain availability check unavailable**
> The Instant Domain Search MCP did not respond. Names are shown below without domain data.
> Check availability manually: https://instantdomainsearch.com
```

---

## DEGRADED Notice

Use when the tool is found but returns an HTTP error or unexpected response.

```
> **Domain availability check degraded** ([error detail])
> This may be caused by a known Claude Code issue with streamable-HTTP transport.
> Names are shown below without domain data.
> Check availability manually: https://instantdomainsearch.com
```

Replace `[error detail]` with the actual error message or HTTP status code if available.

---

## Fallback Table Format

When domain data is unavailable, replace the `.com` / `.io` / `.app` columns with a single `Domain` column:

```
| Name      | Type     | Domain (check manually)                            |
|-----------|----------|----------------------------------------------------|
| Veltora   | Coined   | https://instantdomainsearch.com/?q=veltora         |
| NestRun   | Compound | https://instantdomainsearch.com/?q=nestrun         |
```

Construct the URL as: `https://instantdomainsearch.com/?q=[name-lowercase-no-spaces]`

---

## Known Issue Note

There is a known Claude Code bug affecting streamable-HTTP MCP transport. If users report consistent failures with the bundled `instant-domain-search` MCP, they can add it manually to their global MCP settings as a fallback:

```
URL: https://instantdomainsearch.com/mcp/streamable-http
Transport: streamable-http
```

This is a known issue tracked in the Claude Code repository; the namesmith skill handles it gracefully by design.
