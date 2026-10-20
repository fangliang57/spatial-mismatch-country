"""Rebuild the explorer from the project's prepared aggregate source files.

Optional first run: --project '/path/to/Project BTB' copies the three required
aggregate sources into source_data/. No outcome or individual records are copied.
"""
from pathlib import Path
import argparse
import csv
import hashlib
import json
import shutil

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'source_data'
DEST = ROOT / 'docs' / 'data'
VERSION = '0.1.0'
YEARS = list(range(2010, 2023))


def csv_file(path, columns, rows):
    with path.open('w', newline='', encoding='utf-8') as handle:
        writer = csv.DictWriter(handle, fieldnames=columns)
        writer.writeheader()
        writer.writerows(rows)


def build(project=None):
    SOURCE.mkdir(parents=True, exist_ok=True)
    DEST.mkdir(parents=True, exist_ok=True)
    if project:
        project = Path(project)
        shutil.copyfile(project / 'cleaned_data/cbp_zcta_cleaned.dta', SOURCE / 'cbp_zcta_cleaned.dta')
        shutil.copyfile(project / 'y3_y5/Binary/output/county_mismatch_roster.xlsx', SOURCE / 'county_mismatch_roster_original.xlsx')
        panel = pd.read_stata(project / 'cleaned_data/merged_panel.dta', convert_categoricals=False)
        keys = panel[['county_fips', 'year']].copy()
        keys['year'] = keys.year.astype(int)
        keys.to_csv(SOURCE / 'original_panel_keys.csv', index=False)

    cbp = pd.read_stata(SOURCE / 'cbp_zcta_cleaned.dta', convert_categoricals=False)
    roster = pd.read_excel(SOURCE / 'county_mismatch_roster_original.xlsx', sheet_name='County Mismatch Roster', header=3)
    fips = pd.to_numeric(roster.FIPS, errors='coerce')
    roster = roster[fips.notna()].copy()
    roster['county_fips'] = fips[fips.notna()].astype(int).astype(str).str.zfill(5)
    roster = roster.sort_values(['State', 'County'])
    keys = pd.read_csv(SOURCE / 'original_panel_keys.csv', dtype={'county_fips': str})
    assert not keys.duplicated(['county_fips', 'year']).any()
    assert not cbp.duplicated(['county_fips', 'year']).any()
    assert len(roster) == roster.county_fips.nunique() == 404
    key_set = {(row.county_fips, int(row.year)) for row in keys.itertuples()}
    county_set = set(roster.county_fips)
    selected = cbp[cbp.county_fips.isin(county_set)].copy()
    # Stata's original `gen mismatch` uses float32 storage. Preserve that result.
    selected['mismatch'] = (1 - selected.share_large_emp).astype(np.float32)
    lookup = {(r.county_fips, int(r.year)): r for r in selected.itertuples()}
    threshold = float(np.median(roster['Mismatch\n(county mean)'].to_numpy()))
    counties, annual_rows, mean_rows, wide_rows = [], [], [], []

    for _, row in roster.iterrows():
        fips = row.county_fips
        annual, shares, statuses = [], [], []
        panel_years = sorted(y for f, y in key_set if f == fips)
        for year in YEARS:
            source_row = lookup.get((fips, year))
            if source_row is None:
                mismatch = share = None
                status = 'no_source_year'
            elif pd.isna(source_row.mismatch):
                mismatch = share = None
                status = 'zero_reported_large_establishment_denominator'
            else:
                mismatch, share = float(source_row.mismatch), float(source_row.share_large_emp)
                status = 'available'
                assert 0 <= mismatch <= 1
            annual.append(mismatch)
            shares.append(share)
            statuses.append(status)
            annual_rows.append({
                'county_fips': fips, 'county_name': row.County, 'state': row.State,
                'year': year, 'mismatch_annual': mismatch, 'share_large_establishments_low_income': share,
                'status': status, 'in_original_baseline_panel': int(year <= 2016 and (fips, year) in key_set),
                'in_original_extended_panel': int((fips, year) in key_set),
                'post_2017_reporting_break': int(year >= 2017),
            })
        original_values = [annual[y - 2010] for y in panel_years if 2011 <= y <= 2016 and annual[y - 2010] is not None]
        complete_values = [annual[y - 2010] for y in range(2011, 2017)]
        assert len(complete_values) == 6 and all(v is not None for v in complete_values)
        original_mean = float(row['Mismatch\n(county mean)'])
        assert abs(float(np.float32(np.mean(np.array(original_values, dtype=np.float64)))) - original_mean) < 1e-7
        complete_mean = float(np.float32(np.mean(np.array(complete_values, dtype=np.float64))))
        original_high = int(row.mm_high)
        assert original_high == int(original_mean > threshold)
        county = {
            'fips': fips, 'name': str(row.County), 'state': str(row.State),
            'annual': annual, 'shares': shares, 'statuses': statuses, 'original_panel_years': panel_years,
            'original_mean': original_mean, 'original_high': original_high,
            'original_mean_n_years': len(original_values), 'complete_mean': complete_mean,
        }
        counties.append(county)
        mean_rows.append({
            'county_fips': fips, 'county_name': str(row.County), 'state': str(row.State),
            'original_analysis_mean': original_mean, 'original_analysis_high': original_high,
            'original_mean_n_years': len(original_values), 'complete_mean_2011_2016': complete_mean,
            'original_analysis_cutoff': threshold,
        })
        wide_rows.append({'county_fips': fips, 'county_name': str(row.County), 'state': str(row.State), **dict(zip(map(str, YEARS), annual))})

    coverage = []
    for year in YEARS:
        rows = [r for r in annual_rows if r['year'] == year]
        coverage.append({
            'year': year, 'available': sum(r['mismatch_annual'] is not None for r in rows),
            'original_panel_available': sum(r['mismatch_annual'] is not None and r['in_original_extended_panel'] for r in rows),
        })
    changed_means = sum(abs(c['original_mean'] - c['complete_mean']) > 1e-6 for c in counties)
    changed_groups = sum(int(c['complete_mean'] > threshold) != c['original_high'] for c in counties)
    assert changed_means == 51 and changed_groups == 5
    assert sum(r['mismatch_annual'] is not None for r in annual_rows) == 4700
    assert sum(r['mismatch_annual'] is not None and r['year'] <= 2016 for r in annual_rows) == 2424
    assert sum(r['mismatch_annual'] is not None and r['in_original_baseline_panel'] for r in annual_rows) == 2219

    payload = {
        'schema_version': 1, 'version': VERSION, 'release_date': '2026-10-20', 'years': YEARS,
        'county_count': len(counties), 'state_count': roster.State.nunique(), 'original_cutoff': threshold,
        'changed_mean_count': changed_means, 'changed_group_count_original_cutoff': changed_groups,
        'coverage': coverage, 'counties': counties,
    }
    (DEST / 'counties.json').write_text(json.dumps(payload, ensure_ascii=False, separators=(',', ':'), allow_nan=False) + '\n')
    csv_file(DEST / 'county_year_mismatch.csv', list(annual_rows[0]), annual_rows)
    csv_file(DEST / 'county_mismatch_means.csv', list(mean_rows[0]), mean_rows)
    csv_file(DEST / 'county_year_mismatch_wide.csv', list(wide_rows[0]), wide_rows)
    csv_file(DEST / 'coverage_by_year.csv', list(coverage[0]), coverage)
    files = []
    for path in sorted(SOURCE.iterdir()):
        if path.is_file():
            files.append({'file': 'source_data/' + path.name, 'bytes': path.stat().st_size, 'sha256': hashlib.sha256(path.read_bytes()).hexdigest()})
    downloads = ROOT / 'docs' / 'sources'
    downloads.mkdir(exist_ok=True)
    for filename in ['cbp_zcta_cleaned.dta', 'county_mismatch_roster_original.xlsx', 'original_panel_keys.csv']:
        shutil.copyfile(SOURCE / filename, downloads / filename)
    manifest = {
        'data_version': VERSION, 'release_date': '2026-10-20', 'source_files': files,
        'scope': 'The 404 counties in the original CJARS-based study panel; not all US counties.',
        'annual_derivation': 'float32(1 - share_large_emp), from the prepared CBP county-year source.',
        'upstream_limit': 'The prepared CBP source is included. Original Census downloads and the upstream ZIP/ZCTA-income-county assembly are not included.',
    }
    (DEST / 'provenance.json').write_text(json.dumps(manifest, indent=2) + '\n')
    print(json.dumps({'counties': len(counties), 'states': payload['state_count'], 'grid_rows': len(annual_rows), 'valid_annual': 4700, 'baseline_valid': 2424, 'original_baseline_valid': 2219}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--project', type=Path, help='Optional original Project BTB directory for initial source collection.')
    build(parser.parse_args().project)
