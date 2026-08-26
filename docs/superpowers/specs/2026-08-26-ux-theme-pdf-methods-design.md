# DBO UX Refresh, PDF Report & Data/Methods Page — Design

Date: 2026-08-26
Status: Approved

## Goal

Make the DBO prototype look polished and professional with an identity that
matches its domain (energy, decarbonization, engineering), and give the user a
PDF summary export that explains the rationale of the recommended packages.
Additionally expose the data sources and methods behind every number to
communicate trustworthiness ("no black box").

## Part A — "Clean-tech light" theme

- Tailwind v4 CSS-first `@theme` tokens in `app/globals.css`:
  - Brand primary: deep teal (~#0f766e scale) replacing blue-600.
  - Emerald accent for savings / decarbonization wins; amber for caution;
    red unchanged for errors. Slate neutrals retained.
- Typography: IBM Plex Sans body, IBM Plex Mono for KPI numerals, self-hosted
  via `@fontsource` (no network at build).
- New shared primitives in `components/ui/`: `Card`, `Button`, `Badge`,
  `SectionHeading`. Extracted from the existing repeated class pattern;
  behavior unchanged everywhere.
- Wizard shell: branded header with SVG mark (bolt in building silhouette),
  product name, and a "Data & Methods" link to `/methods`.
- Step indicator redesigned as a labeled connector rail: completed = emerald,
  active = brand teal, locked = slate.
- Chart palettes updated via `lib/palette.ts`; heatmap ramps and series colors
  follow the new scheme.

## Part B — PDF technical report (summary page)

- Dependency: `@react-pdf/renderer`. Generated client-side so it works in both
  live and mock modes.
- `lib/pdf/narrative.ts`: pure, unit-testable functions composing rationale
  text from store state (the API returns no rationale strings):
  per-asset reasoning (PV / BESS / heat pump sizing vs climate zone, load and
  objective mode), financial verdict (CapEx vs EaaS), target verdict,
  resilience narrative (using API `hazards[].mitigations`), provenance note.
- `components/pdf/SummaryReport.tsx`: branded document — cover band,
  baseline snapshot, recommended package + per-asset rationale, financial
  comparison table, emissions trajectory table, resilience section,
  methodology footnote.
- Summary page gains "Download PDF report" (dynamic import keeps the main
  bundle lean); disabled until baseline+optimize exist;
  filename `dbo-report-{zip}.pdf`.

## Part C — Data & Methods page (`/methods`)

Option A (approved): reference page outside the wizard steps, linked from the
header on every step plus a link at the bottom of the Summary page (trust at
the deliverable moment).

- `lib/methodology.ts`: typed entries `{ id, title, category, source,
  description, url? }` grounded in what the codebase actually does:
  - US Census 2020 ZCTA→county crosswalk (data_pipeline/build_crosswalk.py)
  - Representative Meteorological Year: deterministic physics-based synthetic
    profiles, seed 42 (data_pipeline/build_tmy.py)
  - FEMA NRI county hazard scores with offline fallback
    (data_pipeline/build_nri.py)
  - CBECS 2018 medians EUI benchmarks
  - eGRID2022 subregion averages + EIA state tariffs
  - ASHRAE-style climate zone groups
  - Hourly LP dispatch optimization; NPV/IRR/payback finance model
- Categories rendered as badges: "Public dataset", "Synthetic approximation",
  "Open method". Closing honesty callout from the README.

## Testing

- Vitest units for narrative functions (max_npv and target_co2 branches,
  null-sizing case, EaaS-vs-CapEx polarity) and methodology integrity.
- Full `npm test` green; manual walkthrough of all five steps in live mode;
  PDF opens correctly.

## Out of scope

Backend changes, new API fields, dark mode, chart images inside the PDF.
