# SimFi Design System

> Phase 2 deliverable. Locked editorial-luxury spec for the entire frontend rebuild.

---

## Philosophy

**Editorial luxury, not Web3 neon.** Every pixel should feel considered, every motion expensive, every number precise. The interface is a Bloomberg Terminal reimagined for 2026 — data-dense but never cramped, dark but warm, technical but human.

Reference points: Linear (restraint), Stripe (editorial typography), Arc (tasteful translucency), Financial Times (tabular data), Matches Fashion (dark luxury).

---

## Color Tokens

### Base Surfaces
| Token | Hex | HSL | Usage |
|-------|-----|-----|-------|
| `--bg-base` | `#0a0a0b` | `hsl(240 6% 4%)` | Page background, deepest layer |
| `--bg-raised` | `#141416` | `hsl(240 5% 8%)` | Cards, panels, elevated surfaces |
| `--bg-overlay` | `rgba(10, 10, 11, 0.85)` | — | Modals, dropdowns, floating overlays |
| `--bg-hover` | `rgba(255, 255, 255, 0.03)` | — | Subtle hover state on base |
| `--bg-pressed` | `rgba(255, 255, 255, 0.06)` | — | Active/pressed state |

### Borders
| Token | Value | Usage |
|-------|-------|-------|
| `--border-subtle` | `rgba(255, 255, 255, 0.06)` | Default card borders, dividers |
| `--border-strong` | `rgba(255, 255, 255, 0.12)` | Focused inputs, selected states |
| `--border-gain` | `rgba(63, 168, 118, 0.25)` | Gain-related borders (rare) |
| `--border-loss` | `rgba(194, 77, 77, 0.25)` | Loss-related borders (rare) |

### Text
| Token | Hex | HSL | Usage |
|-------|-----|-----|-------|
| `--text-primary` | `#f5f3ee` | `hsl(40 14% 95%)` | Headlines, primary labels, body |
| `--text-secondary` | `#9a9894` | `hsl(40 4% 58%)` | Descriptions, metadata, placeholders |
| `--text-tertiary` | `#5f5d58` | `hsl(40 4% 36%)` | Timestamps, disabled states, subtle hints |
| `--text-inverse` | `#0a0a0b` | `hsl(240 6% 4%)` | Text on light/champagne backgrounds |

### Accents
| Token | Hex | HSL | Usage |
|-------|-----|-----|-------|
| `--accent-gain` | `#3fa876` | `hsl(152 42% 45%)` | Positive P&L, win indicators. **Muted emerald, never neon.** |
| `--accent-loss` | `#c24d4d` | `hsl(0 48% 54%)` | Negative P&L, loss indicators. **Oxblood, never neon red.** |
| `--accent-premium` | `#c9a96e` | `hsl(40 43% 61%)` | Top 3 leaderboard, premium badges, hero moments. **Use sparingly.** |

### shadcn/ui Variable Mapping
The following CSS variables power all existing shadcn primitives. They are mapped to the warm palette above.

| shadcn Variable | Maps To | Value |
|-----------------|---------|-------|
| `--background` | `--bg-base` | `240 6% 4%` |
| `--foreground` | `--text-primary` | `40 14% 95%` |
| `--card` | `--bg-raised` | `240 5% 8%` |
| `--card-foreground` | `--text-primary` | `40 14% 95%` |
| `--popover` | `--bg-raised` + lift | `240 5% 10%` |
| `--popover-foreground` | `--text-primary` | `40 14% 95%` |
| `--primary` | `--text-primary` | `40 14% 95%` |
| `--primary-foreground` | `--bg-base` | `240 6% 4%` |
| `--secondary` | `--bg-raised` lighter | `240 4% 14%` |
| `--secondary-foreground` | `--text-primary` | `40 14% 95%` |
| `--muted` | `--bg-raised` darker | `240 4% 12%` |
| `--muted-foreground` | `--text-secondary` | `40 4% 58%` |
| `--accent` | `--bg-raised` lighter | `240 4% 14%` |
| `--accent-foreground` | `--text-primary` | `40 14% 95%` |
| `--destructive` | `--accent-loss` | `0 48% 54%` |
| `--destructive-foreground` | `--text-primary` | `40 14% 95%` |
| `--border` | `--border-subtle` | `0 0% 100% / 0.06` |
| `--input` | `--bg-raised` darker | `240 4% 12%` |
| `--ring` | `--text-primary` / 20% | `40 14% 95% / 0.2` |
| `--success` | `--accent-gain` | `152 42% 45%` |
| `--success-foreground` | `--text-primary` | `40 14% 95%` |

### Chart Colors
| Token | Value | Usage |
|-------|-------|-------|
| `--chart-1` | `hsl(40 43% 61%)` | Primary line (champagne) |
| `--chart-2` | `hsl(152 42% 45%)` | Gain series (emerald) |
| `--chart-3` | `hsl(0 48% 54%)` | Loss series (oxblood) |
| `--chart-4` | `hsl(40 14% 95%)` | Neutral highlight |
| `--chart-5` | `hsl(40 4% 58%)` | Secondary line |

---

## Typography

### Font Families
| Role | Font | Fallback | Usage |
|------|------|----------|-------|
| Display | **Instrument Serif** | Georgia, serif | Page titles, hero moments, editorial accents |
| UI | **Inter** | system-ui, sans-serif | All interface text, labels, buttons, body |
| Mono | **JetBrains Mono** | 'Fira Code', monospace | Numbers, prices, addresses, timestamps |

### Font Feature Settings
- **Inter:** `font-feature-settings: 'ss01', 'cv11'` enabled globally for the sans stack.
- **All numeric text:** `font-variant-numeric: tabular-nums` — never proportional numbers in data.

### Type Scale
| Token | Size | Line Height | Letter Spacing | Usage |
|-------|------|-------------|----------------|-------|
| `text-display` | `clamp(2.5rem, 6vw, 5rem)` | 1.05 | `-0.02em` | Hero headlines (Instrument Serif) |
| `text-h1` | `2rem` (32px) | 1.1 | `-0.01em` | Page titles |
| `text-h2` | `1.5rem` (24px) | 1.2 | `-0.005em` | Section headers |
| `text-h3` | `1.25rem` (20px) | 1.3 | `0` | Card titles, subsections |
| `text-h4` | `1rem` (16px) | 1.4 | `0` | Small headers, table column labels |
| `text-body` | `0.9375rem` (15px) | 1.5 | `0` | Default body copy (Inter) |
| `text-small` | `0.8125rem` (13px) | 1.4 | `0` | Captions, metadata, badges |
| `text-xs` | `0.75rem` (12px) | 1.3 | `0.01em` | Timestamps, fine print, chain chips |
| `text-mono-lg` | `1.25rem` (20px) | 1.2 | `-0.02em` | Large prices, balance totals |
| `text-mono` | `0.9375rem` (15px) | 1.2 | `0` | Default numeric data |
| `text-mono-sm` | `0.8125rem` (13px) | 1.2 | `0` | Small numbers, table cells |

---

## Spacing & Grid

- **8-point base grid.** All spacing uses multiples of 4px (0.25rem) or 8px (0.5rem).
- **Max content width:** `1280px` (`max-w-5xl` in Tailwind is 1024, so we add `max-w-content: 1280px`).
- **Section vertical rhythm:** `py-16` (64px) to `py-24` (96px) between major sections.
- **Card internal padding:** `p-5` (20px) or `p-6` (24px).
- **Data-dense tables:** `py-3 px-4` row padding, never less than `py-2.5`.

---

## Surfaces

### Card Variants
| Variant | Background | Border | Usage |
|---------|-----------|--------|-------|
| **flat** | `--bg-base` | `--border-subtle` | Embedded lists, nested panels |
| **raised** | `--bg-raised` | `--border-subtle` | Primary cards, main content containers |
| **glass** | `--bg-overlay` + `backdrop-filter: blur(16px)` | `--border-strong` | Floating overlays, modals, dropdowns, sticky navs on scroll |

> Rule: Most cards are **raised**. Glass is reserved for floating overlays only.

### Border Radius
| Token | Value | Usage |
|-------|-------|-------|
| `radius-sm` | `4px` | Buttons, small chips |
| `radius-md` | `6px` | Inputs, badges |
| `radius-lg` | `8px` | Cards, dialogs |
| `radius-xl` | `12px` | Large panels, modals |

---

## Motion

### Principles
- **No bouncy springs on data.**
- **Hover states on interactive elements only.**
- **Respect `prefers-reduced-motion`.**

### Easing
| Name | Value | Usage |
|------|-------|-------|
| `ease-out-expo` | `[0.16, 1, 0.3, 1]` | Primary motion — feels expensive |
| `ease-out-quart` | `[0.25, 1, 0.5, 1]` | Secondary motion — snappy |

### Durations
| Context | Duration |
|---------|----------|
| Page transition | `240ms` |
| Hover state | `150ms` |
| Modal open/close | `200ms` |
| Toast enter/exit | `300ms` |
| Number counter | `600ms` (tasteful, not casino) |

### Key Animations
- **Page in:** `opacity: 0 → 1`, `translateY(4px) → 0`, `240ms`, `ease-out-expo`
- **Skeleton shimmer:** subtle, `1.5s` cycle, `linear`
- **Data cell flash:** brief `background-color` pulse on value change, `300ms`

---

## Iconography

- **Library:** Lucide React only.
- **Stroke width:** `1.5`
- **Default size:** `16px` (`w-4 h-4`)
- **Large size:** `20px` (`w-5 h-5`)
- **Never mix icon libraries.**
- **No emoji in UI chrome.**

---

## Component Primitives

### Button Variants
| Variant | Background | Text | Border | Hover |
|---------|-----------|------|--------|-------|
| **primary** | `--text-primary` | `--bg-base` | none | `opacity: 0.9` |
| **secondary** | `--bg-raised` lighter | `--text-primary` | `--border-subtle` | `bg-hover` |
| **ghost** | transparent | `--text-secondary` | none | `bg-hover`, text → `--text-primary` |
| **danger** | `--accent-loss` / 15% | `--accent-loss` | `--accent-loss` / 25% | `--accent-loss` / 25% |
| **premium** | `--accent-premium` | `--bg-base` | none | `brightness(1.1)` |

### Input
- Background: `--bg-raised` darker
- Border: `--border-subtle`
- Focus ring: `1px solid --border-strong` + outer `0 0 0 2px rgba(245, 243, 238, 0.08)`
- Placeholder: `--text-tertiary`
- Height: `40px` (2.5rem)
- Padding: `px-3`

### Badge
- Height: `20px` (1.25rem)
- Padding: `px-2`
- Border radius: `radius-md`
- Font: `text-xs`, `font-medium`
- Variants: neutral, gain, loss, premium

### DataCell (new)
- Font: mono, tabular-nums
- Color: `--text-primary` by default
- Gain: `--accent-gain`
- Loss: `--accent-loss`
- Optional diff indicator: small arrow + percentage

### AddressPill (new)
- Font: mono, truncated with middle ellipsis
- Background: `--bg-raised`
- Border: `--border-subtle`
- Copy icon on hover
- Click to copy to clipboard

### ChainChip (new)
- Base: subtle blue tint background (`#1e3a5f` / 20%) + "Base" wordmark
- Solana: subtle purple tint background (`#3b2a5a` / 20%) + "Solana" wordmark
- No logo stickers. Text-only with subtle color coding.
- Font: `text-xs`, `font-medium`, `tracking-wide`

---

## Imagery

- **Token logos:** From DexScreener response. Render at consistent size (`24px` or `32px`) with `rounded-md` mask and fallback initial.
- **No stock illustrations.**
- **No generic "crypto art."**
- **Landing hero:** Optional WebGL gradient mesh (restrained, single slow movement). Must respect `prefers-reduced-motion`.

---

## Quality Gates (Design System)

- [ ] No stray hex values outside `tokens.css`
- [ ] All numeric values use tabular mono
- [ ] Gain/loss colors are muted palette, not neon
- [ ] `prefers-reduced-motion` respected on all non-essential motion
- [ ] Mobile passes at 360px without horizontal scroll
- [ ] Dark theme only
- [ ] `tsc --noEmit` passes
- [ ] No `any` types in new code

---

*End of DESIGN_SYSTEM.md. Locked for Phase 3+ rebuild.*
