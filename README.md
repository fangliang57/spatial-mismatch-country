# County Spatial Mismatch Explorer

Leon's small, self-contained research companion for the BTB project.

**Scope:** the original 404 study counties across 25 states. This is not a nationwide county dataset. Version 0.1.0, assembled October 20, 2026.


```sh
npm start
```

## What the explorer does

- Search by county name, state, or five-character county FIPS. State filters distinguish names repeated across states.
- The interface is a plain monochrome query form and result. The top navigation contains only Download Data and Prepared source files. Comparisons, original analysis references, the annual chart, and the year-by-year table are expandable.
- Select a year, including an explicit unavailable state for 2010.
- Switch between the baseline window (2010–2016) and the extended window (2010–2022).
- Compare up to three counties on a common 0–1 axis. Missing data leave gaps. The chart does not connect 2016 to 2017 across the reporting break.
- Preserve a selected county, year, window, and comparison counties in the URL fragment.
- Download the current view as CSV or the chart as SVG. Presentation mode removes the search controls; Escape returns to the normal view.
- Download annual long and wide tables, county means, the original prepared aggregate inputs, and provenance fingerprints.

E