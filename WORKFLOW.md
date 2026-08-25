# MAJO Codex — build & data workflow (read me first)

## Deploy loop
1. Edit files in this repo (mostly `src/data/*.json`).
2. Repackage the **single zip** `majo-codex-site.zip` with the top-level `site/` folder, excluding `node_modules/`, `dist/`, `.astro/`.
   ```
   zip -rq majo-codex-site.zip site -x 'site/node_modules/*' 'site/dist/*' 'site/.astro/*'
   ```
3. Push to the private GitHub repo → **Cloudflare** (Astro on Workers, `wrangler.jsonc` → `assets.directory: ./dist`) rebuilds automatically.

## Data model (`src/data/`)
- **`skills.json`** — flat list, one row per `ability_id` (`Wxxx_slot`). Feeds the per-witch detail page (`src/pages/witch/[id].astro` via `SkillBox.astro`). Key fields: `name`, `description`, `mechanics` (curated prose), `has_plus`, `plus_unlocks_at_star` (`"5*"`/`"6*"` — drives the star-selector plus lock/unlock), `plus_description`. **Enriched (2026-08) from the in-game skill capture** with: `required_rank`, `cooldown_s`, `charge`, `range`, `tags`, `base_text`, `coefficients`, `plus_text`, `plus_coefficients`.
- **`abilities.json`** — combat "frames" (hit_count, total_damage_pct, cd, charge, range, stagger, tags). `SkillBox` builds the mono frame line from the **base** variant.
- **`tier_synergy.json`** — role/cluster/interference-fit + weighting-model inputs + the cross-witch synergy notes. Feeds tier-list reasoning & recommended comps.
- `witches.json` (roster), `class_growth.json` / `class_base_stats.json` / `class_offense.json` (shared class stats), `stars.json` (rank→level table), `enemies.json`, `tags.json`, `constants.json`, `team_mechanics.json`.

## Coefficient scaling (the star-rank calculator input)
Each skill's `coefficients[]` give **linear per-level scaling**: `value_at_level(L) = val_low + per_level*(L-1)` (flat effects have `per_level: 0`). Rank→level caps: **SR 1–6**, **SSR 1–9** (EX1–3 = levels 7–9). This is the data the detail page needs to turn the star selector into a live scaling calculator (not yet wired into the page — next build task).

## Source of truth
The authoritative capture is `majo_skill_data_captured.json` (+ `.md`), maintained separately: all 23 witches, 46/46 plus-unlocks confirmed, with a `_meta.canonical_discrepancies` list. Two repo corrections are already applied here (Xini Special-plus 355 not 395; Patra Class = [Charge Amp], not a Physical damage skill).

## Update 2026-08-24 (evening)
- **Detail page now uses the coefficients**: `SkillBox.astro` renders a live per-level readout (`.sk-scale-cur`) + an "All levels" caret table; the star selector script in `src/pages/witch/[id].astro` recomputes values on rank change (`value = val_low + per_level*(level-1)`), swaps to plus coefficients once `rank >= plus_unlocks_at`, and highlights the active level row.
- **Star selector fixed**: min rank enforced (SSR 2 / SR 1), EX1-3 buttons only render for SSR (SR caps at 6). `data-min`/`data-max` on `#rank`.
- **Icons uniform** (52px); the Extreme card keeps its emphasis via border/background only.
- **"How to deploy" section** on each detail page, fed by `tier_synergy.json` (How she plays / Interference fit / Team-synergy clusters).
- **New pages**: `src/pages/tier.astro` (+ `src/data/guides.json`) and `src/pages/codes.astro` (+ `src/data/codes.json`). Nav in `Base.astro` points to `/tier` and `/codes`.
- **Boss art**: drop files at `public/img/boss/<id>.png` (e.g., `abyssal-slime.png`).
- **OPEN DECISION**: rank→skill-level mapping. `stars.json` says 6★ = skill level 6 (SR max) and SSR EX1-3 = levels 7-9; the calculator uses that. If in-game 6★ is actually level 7, change the mapping in `SkillBox.astro` (`maxLevel`) and the page script.

## Update 2026-08-24 (late)
- **Skill-level mapping**: `SkillBox.astro` maxLevel = SSR 10 / SR 7; the page script computes `level = rank + 1` (so 6★ shows Lv7, SSR EX1-3 show Lv8-10). All-levels caret lists 1..max. *(Floor labeling — whether a fresh 1★ reads Lv1 or Lv2 — is the one open question.)*
- **Star selector**: min rank enforced (SR 1 / SSR 2); EX only for SSR; character-page stars all turn **yellow at rank ≥ 4** (matches in-game character screen; roster tiles keep the red/red+yellow mix).
- **Detail page**: added a **quick-verdict** callout (archetype from the synergy note + rarity/class/element) and moved **How to deploy** above Skills (BLUF).
- **Codes** (`/codes`, `codes.json`): 14 live codes populated (rewards TBD), tap-to-copy with mobile-friendly layout.
- **Tier** (`/tier`, `guides.json`): Abyssal Slime now lists **Control for the Wake-up Kickback** (Carmen, Dusan, Xini) and an **auto-generated "all {weakness} dealers"** list derived from `witches.json` (the boss-weakness → dealers auto-suggestion).
- **Roster tiles** (`index.astro`): damage/weakness icons enlarged and corner-anchored (bottom-left / bottom-right); rarity icon enlarged and lowered so its centerline sits on the portrait's bottom border. `.portrait` clipping moved to the image so icons can straddle the edge.

## Update 2026-08-25
- Fixed literal `\uXXXX` escapes that were rendering as text (·, ★, ×, — now real glyphs).
- Skill cards: icons enlarged to 64px; a gold **evolution badge** sits on the icon's top-right (greyscale until the star unlocks the plus, then lit). Extreme card text re-aligned to match the others (emphasis via border/bg only).
- Roster: added **Traits** filter row (tri-state) from `tier_synergy` clusters+role_tags; cards carry `data-tags`; trait keywords also feed search.
- Corrected all synergy notes that implied a witch's own interference buffs herself — interference only ever buffs the carry she's slotted behind (fixed in site + outputs `tier_synergy.json` and the source record).
- Detail page: art + star selector now a **sticky left rail** (`position:sticky`) so the star control stays in view while scrolling skills; collapses to inline (non-sticky, ~280px art) under 860px so it doesn't dominate mobile.
- NEXT: skill-up priority + weighting formula (max unit ATK × max skill coefficient × over-stat/per-witch modifiers).
