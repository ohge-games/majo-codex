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
