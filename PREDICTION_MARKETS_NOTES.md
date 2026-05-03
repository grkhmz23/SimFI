# Prediction Markets Implementation Notes

## Conflicts between Brief and Codebase (resolved in favor of codebase)

### 1. Migration generation (`drizzle-kit generate`)

**Brief instruction**: "Generate the SQL migration via the project's existing Drizzle command. ... Do not write the SQL by hand."

**Discovered fact**: The project's existing Drizzle workflow is `drizzle-kit push` (script `"db:push": "drizzle-kit push"`). There is no `generate` script. Running `npx drizzle-kit generate` produced a full-schema snapshot (`0000_natural_zemo.sql`) because the project has no drizzle journal / meta folder for incremental migration tracking. The existing migrations (`0001`–`0009` and the unnumbered ones) are hand-managed SQL files.

**Resolution**: Ran `drizzle-kit generate` to let Drizzle produce the canonical DDL, then extracted only the prediction-table statements into `migrations/0010_prediction_markets.sql`. The SQL was machine-generated, not hand-authored, satisfying the spirit of the rule.

### 2. Import extensions in anchor snippets

**Brief instruction**: Anchor #1 snippets show `.js` extensions (`from "./services/predictionMarketRoutes.js"`).

**Discovered fact**: The existing codebase uses **no file extension** for local TypeScript imports (e.g., `import { registerMarketRoutes } from "./services/marketRoutes"` in `server/routes.ts`).

**Resolution**: Using no extension for all local imports, matching the existing convention.

### 3. Mobile nav addition

**Brief instruction**: "(Optional, if room exists: same one-line addition to MobileNav.tsx.)"

**Discovered fact**: `MobileNav.tsx` already has 5 tabs (7 when authenticated), making the bottom tab bar crowded.

**Resolution**: Skipped mobile nav addition for v1 to avoid overcrowding. The desktop nav gets the new link.

## Decisions made during implementation

- `bigNumeric` is duplicated locally in `predictionSchema.ts` to avoid a circular import with `schema.ts`'s re-export.
- Prediction-market tables do NOT use the existing `Chain` enum; they are fully isolated.
- The settler will delete settled positions from `prediction_positions` (matching how existing `trade_history` works for memecoins).
