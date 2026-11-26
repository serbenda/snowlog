# 0007 — The license: all rights reserved, no use by AI

- **Status:** accepted
- **Date:** 2026-11-26

## Context
Snowlog is public on GitHub and its README said "No license: all rights reserved", with no license file, no
reservation against use by AI and nothing in the code itself. The owner chose a proprietary license for bsketch
(bsketch's ADR 0006), whose editor Snowlog embeds, and wants the same protection for Snowlog.

## Options
| Option | Pros | Cons |
|---|---|---|
| A. Leave it as it is | Nothing to do | No written terms beyond one line; no AI or text-and-data-mining reservation |
| B. bsketch's license, adapted: all rights reserved, viewing and personal evaluation only, an explicit AI and text-and-data-mining reservation, a notice with a marker in every source file | The same terms in both projects; the code stays public (CI, Pages, Scorecard) | A license is a legal tool, not a technical lock |
| C. B plus a private repository | The source is no longer public | Actions and Pages cost money on private repositories |

## Challenge
None formal: it applies a decision the owner already made for bsketch ("que me proteja la propiedad intelectual";
"no puede reutilizarse por ninguna IA, bot").

## Decision
B. `LICENSE` is bsketch's, adapted to Snowlog (its name, site and parts). Every source file of Snowlog's own carries the
notice and the marker `snowlog-b50d2624`. The drawing editor copied from bsketch keeps bsketch's notice and license.
The page asks AI crawlers not to use it (`<meta name="robots" content="noai, noimageai">`). The desktop app carries
the copyright, and `package.json` says `UNLICENSED`.

## Consequences
- Contributions need a prior agreement with the owner.
- Crawlers that ignore meta tags or licenses are not stopped by them: the license gives legal ground, not technical
  protection.
- Not legal advice: the owner may want a lawyer's review.
