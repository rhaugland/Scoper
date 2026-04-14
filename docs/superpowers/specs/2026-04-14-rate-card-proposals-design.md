# Rate Card & Proposal Generation — Design Spec

## Goal

Add internal pricing (rate card) and one-click client proposal generation (PDF) to Scoper, so a completed scope turns directly into a sendable proposal without leaving the app.

## Architecture

Rate configuration is stored per-project. When the user clicks "Generate Proposal," the backend assembles the full scope state + rate config, sends it to Claude with a structured proposal prompt, receives markdown back, renders it to a styled PDF via Puppeteer, and returns the file for download. Proposals are stored for history.

## Rate Card & Internal Pricing

### Storage

Three new columns on the `projects` table:

- `blended_rate` — integer, cents per hour (e.g., 15000 = $150/hr). Nullable, no default.
- `margin_percent` — integer, nullable. Optional markup on top of the blended rate.
- `weekly_capacity` — integer, default 30. Used to derive timeline from hours.

No separate rate card table. Rates are per-project because different clients/engagements may have different rates.

### Effective Rate Calculation

```
effectiveRate = blendedRate * (1 + marginPercent / 100)
phasePrice = sum(item.likelyHours) * effectiveRate   // for each phase
totalPrice = sum(all phasePrice)
```

Three price points displayed (using optimistic/realistic/pessimistic hours):
- Optimistic price = totalOptimisticHours * effectiveRate
- Realistic price = totalLikelyHours * effectiveRate
- Pessimistic price = totalPessimisticHours * effectiveRate

### UI

Rate config sits at the top of the right panel, above the phase breakdown. Three inline fields using the same pencil-to-edit pattern as hour estimates:

- Blended rate ($/hr)
- Margin % (optional)
- Weekly capacity (hrs/week)

Once a rate is set, dollar amounts appear alongside hours:

- Each phase subtotal shows: `45 — 62 — 80h | $6,750 — $9,300 — $12,000`
- Bottom total section shows a 2-row grid:

```
              Optimistic    Realistic    Pessimistic
Hours            45h           62h           80h
Price          $6,750        $9,300       $12,000
```

### API

- `PATCH /api/projects/:id` — already exists for project updates; extend to accept `blendedRate`, `marginPercent`, `weeklyCapacity` fields.

## Proposal Generation

### Storage

New `proposals` table:

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK, default random |
| project_id | uuid | FK to projects |
| content | text | Generated markdown content |
| pricing_mode | varchar(20) | "per_phase" or "retainer" |
| retainer_months | integer | Nullable, only set for retainer mode |
| created_at | timestamp | Default now |

### Proposal Sections

All sections are generated from scope data. Each section is toggleable (included/excluded) at generation time.

1. **Cover Page** — project name, client name, company name (hardcoded to "w3" for now, configurable later), date
2. **Executive Summary** — AI-generated from scope summary + Q&A decisions. 2-3 paragraphs explaining what will be built and why.
3. **Phased Deliverables** — each phase with an AI-generated description paragraph, then its deliverables listed. Descriptions synthesized from scope items + question/answer context.
4. **Timeline** — phases laid out sequentially, duration per phase derived from `likelyHours / weeklyCapacity` rounded to nearest week.
5. **Pricing** — per-phase pricing table (default) or monthly retainer framing (toggle). Shows the realistic price as the primary number, with optimistic-pessimistic as a range note.
6. **Assumptions & Exclusions** — pulled directly from scope assumptions. Each assumption becomes a bullet.
7. **Terms** — editable text block with sensible defaults: 50% upfront / 50% on completion, 2 revision rounds included, additional work at hourly rate.

### Generation Flow

1. User clicks "Generate Proposal" (right panel or top bar)
2. Frontend sends `POST /api/proposals/:projectId/generate` with `{ pricingMode, retainerMonths?, excludeSections? }`
3. Backend assembles context: scope state, rate config, Q&A history, project metadata
4. Backend calls Claude with a proposal prompt (new prompt in `services/ai/prompts.ts`)
5. Claude returns structured markdown with section headers
6. Backend renders markdown to PDF:
   - Convert markdown to HTML
   - Wrap in a styled HTML template (inline CSS, clean typography, proper page breaks)
   - Render to PDF via Puppeteer (`puppeteer-core` with system Chromium)
7. Store the proposal row (markdown content + metadata)
8. Return PDF as binary download

### PDF Styling

Single HTML template file at `apps/api/src/services/proposal-template.html`:

- Clean sans-serif typography (system fonts)
- Forest green accent color for headers and rules (matches Scoper UI)
- Proper page breaks: cover page alone, then between major sections
- Tables styled with alternating row backgrounds
- Footer with page numbers

### API Endpoints

- `POST /api/proposals/:projectId/generate` — generate a new proposal, returns PDF binary
- `GET /api/proposals/:projectId/list` — list past proposals for a project
- `GET /api/proposals/:proposalId/download` — re-download a previously generated PDF

### Claude Prompt Strategy

The proposal prompt receives:
- Project name, client name
- Scope summary
- All scope items grouped by phase with hours
- All assumptions
- All risks
- All Q&A (answered questions and their answers)
- Pricing data (per-phase and total)
- Timeline data (weeks per phase)

Claude is instructed to write in a professional, confident consulting tone. No filler. No jargon. Direct language that inspires client confidence. The output is structured markdown with specific section headers that the template parser expects.

## UI Changes Summary

### Right Panel Additions

1. Rate config fields (top of panel, above phases)
2. Dollar amounts on phase subtotals and bottom total
3. "Generate Proposal" button (bottom of panel, below risks)

### Generate Proposal Button

- Disabled until scope is complete AND blended rate is set
- Click opens a small inline options panel:
  - Pricing mode toggle: "Per phase" / "Monthly retainer"
  - If retainer: number of months input
  - Section checkboxes (all checked by default): Executive Summary, Deliverables, Timeline, Pricing, Assumptions, Terms
  - "Generate" button
- Shows loading state with "Generating proposal..." (~10-15 seconds)
- Auto-downloads PDF on completion

## Dependencies

- `puppeteer` (or `puppeteer-core`) — PDF rendering in the API
- `marked` (or similar) — markdown to HTML conversion

## Out of Scope

- Custom branding/logo upload (future)
- Proposal editing before download (future — for now, regenerate)
- E-signature integration (future)
- Multi-currency support (future)
- Per-role rate cards (future)
