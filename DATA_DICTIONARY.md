# Data dictionary · version 0.1.0

## Population and period

All browser-ready exports select the 404 county FIPS in the original study roster, covering 25 states. The source Stata file has a broader county universe. The annual grid covers 2010–2022; the baseline view covers 2010–2016. Annual source data start in 2011.

The complete baseline indicator source has 2,424 valid county-year values in 2011–2016. The original baseline regression panel contains 2,219 of those values. Across 2010–2022, the grid has 5,252 rows and 4,700 valid annual values. A row in the original panel does not guarantee a nonmissing outcome or membership in any particular regression's estimation sample.

## Annual long table: `docs/data/county_year_mismatch.csv`

One row per county FIPS × year. County FIPS is a **five-character text identifier**, including leading zeros. When importing CSV into Excel, import this column as Text.

| Column | Type | Meaning |
| --- | --- | --- |
| `county_fips` | Text | Five-character county FIPS from the study roster. |
| `county_name` | Text | Original roster county name; county-equivalents can be independent cities. |
| `state` | Text | Two-character state abbreviation. |
| `year` | Integer | Calendar year. |
| `mismatch_annual` | Number or blank | Float32 result of `1 - share_large_emp` from the prepared source; range [0, 1]. |
| `share_large_establishments_low_income` | Number or blank | The original `share_large_emp` source value: low-income-ZCTA large-establishment count divided by county large-establishment count. |
| `status` | Text | Availability reason, defined below. |
| `in_original_baseline_panel` | 0/1 | The county-year key appeared in the original merged panel and the year is at most 2016. This does not identify each outcome-specific regression sample. |
| `in_original_extended_panel` | 0/1 | The county-year key appeared in the original 2010–2022 merged panel. |
| `post_2017_reporting_break` | 0/1 | 1 in 2017 and later; a reporting comparability flag. |

Availability reasons:

| Status | Meaning |
| --- | --- |
| `available` | Source share and annual mismatch are nonmissing. |
| `no_source_year` | There is no prepared source record for this county-year; in the current 404-county export this is 2010. |
| `zero_reported_large_establishment_denominator` | Source share is missing due to a zero recorded denominator. The missing-share/zero-denominator relationship was checked against the project's ZCTA-level input. Suppression and reporting changes mean this does not establish the absence of actual large employers. |

## County mean table: `docs/data/county_mismatch_means.csv`

One row per study county. County name, state, and FIPS use the same definitions as the annual table.

| Column | Meaning |
| --- | --- |
| `original_analysis_mean` | Unchanged mean from the original roster, using the county's available 2011–2016 mismatch values within the original panel. The exporter checks it against the original county-year membership. |
| `original_analysis_high` | Unchanged original group: 1 for an original mean strictly above the original cutoff; 0 otherwise. Fixed within county. |
| `original_mean_n_years` | Number of nonmissing original-panel annual values contributing to the original mean. The distribution is 36 counties with 1 year, one each with 2, 3, and 4 years, 16 with 5 years, and 349 with 6 years. |
| `complete_mean_2011_2016` | Mean of the six annual indicator-source values, independent of CJARS panel availability. |
| `original_analysis_cutoff` | 0.7431652545928955, the median of the original 404 roster means. |

`complete_mean_2011_2016` is provided for reference. It does not replace `original_analysis_mean` or change the original group. The 1e-6 tolerance used to count mean differences avoids classifying floating-point rounding as a substantive difference.

## Other exports

- `county_year_mismatch_wide.csv`: one row per county; columns 2010–2022 contain the annual mismatch values. Blank is missing.
- `coverage_by_year.csv`: `available` counts nonmissing indicator-source values among the study counties. `original_panel_available` counts those with a county-year key in the original merged panel.
- `counties.json`: browser representation. Each county has `annual`, `shares`, and `statuses` arrays in the order of the top-level `years` array. Missing numeric values are JSON `null`. `original_panel_years` records original merged-panel key membership. `original_mean`, `original_high`, `original_mean_n_years`, and `complete_mean` correspond to the county mean table.
- `provenance.json`: input filenames, sizes, fingerprints, version, scope, and the limit of upstream reproducibility. Timestamps describe the explorer release, not the original observation vintage.

## Construction rules and limits

The original source construction ranks ZCTAs within each county-year by median household income and sets low income when `rank / total_zcta <= 0.25`. It adds establishment counts in employee-size categories 250–499, 500–999, and 1000+. The count share in low-income ZCTAs is subtracted from 1. This is not an employee-weighted share, population-weighted quartile, or travel-time measure.

The prepared input preserves the original project's geographic matching and missing-income/rank treatment. This release does not reconstruct or independently validate the upstream ZIP-to-ZCTA, ZCTA-to-county, and income-data assembly. See the original project for that upstream work.

Beginning with 2017 Census publishes a cell only when it contains three or more establishments: [CBP methodology](https://www.census.gov/programs-surveys/cbp/technical-documentation/methodology.html). The extended view is separated at this break, and suppressed or unavailable data are not interpreted as genuine zeros.
