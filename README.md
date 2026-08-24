# MAJO Codex

Unofficial fan compendium for MAJO — witch roster, skills, combat frames, and stats.
Built with Astro (static output), deployed on Cloudflare Pages.

## Run locally
```bash
npm install
npm run dev        # http://localhost:4321
npm run build      # outputs static site to ./dist
```

## Data
All game data lives in `src/data/*.json` (16 canonical tables, recovered from the
source workbook). Regenerate/replace these to update the site — pages rebuild from them.
Roster is `witches.json`; per-witch skills in `skills.json`, combat frames in `abilities.json`.

## Deploy (Cloudflare Pages)
Framework preset: **Astro**. Build command: `npm run build`. Output dir: `dist`.
