# Instructional Spend Analysis

## Quick Reference

- `bun run report` — Regenerate HTML report from cached `output/results.json`. Fast, no network needed. Use this after changing `src/report.ts`.
- `bun run generate` — Full pipeline: LDAP + CIS + analysis + report. Slow, requires VPN/network access.
- `bun run start` — Dev server for viewing the report locally.

## Important

- **Do NOT run `bun run generate` or `bun run src/index.ts` unless explicitly asked.** It requires LDAP/network access and takes a long time. For report-only changes (HTML, CSS, JS in `src/report.ts`), use `bun run report` instead.
- The generated `index.html` at the project root is deployed via GitHub Pages. It must be committed after regeneration.
- `output/` is gitignored. `index.html` at the root is not.
