import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { stateNames, validateDataset, findCounties, formatValue, valueAt, yearRange, readView, writeView, viewRows, csvText } from '../docs/core.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const data = JSON.parse(await readFile(path.join(root, 'docs/data/counties.json'), 'utf8'));

function parseCsv(text) {
  const rows = [], row = [];
  let field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') { field += '"'; i++; }
      else quoted = !quoted;
    } else if (char === ',' && !quoted) { row.push(field); field = ''; }
    else if (char === '\n' && !quoted) { row.push(field.replace(/\r$/, '')); rows.push([...row]); row.length = 0; field = ''; }
    else field += char;
  }
  if (field || row.length) { row.push(field); rows.push([...row]); }
  const headers = rows.shift();
  return rows.map(values => Object.fromEntries(headers.map((key, i) => [key, values[i]])));
}

test('all study counties have unique identifiers, valid values, and named states', () => {
  assert.equal(validateDataset(data), data);
  assert.equal(data.counties.length, 404);
  assert.equal(new Set(data.counties.map(c => c.state)).size, 25);
  for (const c of data.counties) assert.ok(stateNames[c.state], `Missing state name: ${c.state}`);
  const malformed = structuredClone(data);
  malformed.counties[0].annual[1] = NaN;
  assert.throws(() => validateDataset(malformed));
  malformed.counties[0].annual[1] = 0;
  malformed.counties[1].fips = malformed.counties[0].fips;
  assert.throws(() => validateDataset(malformed));
});

test('availability and original-panel coverage reconcile for every year', () => {
  let valid = 0, baselineValid = 0, originalBaselineValid = 0;
  for (const c of data.counties) {
    assert.equal(valueAt(c, 2010), null);
    assert.equal(c.statuses[0], 'no_source_year');
    data.years.forEach((year, i) => {
      const value = c.annual[i];
      assert.equal(c.statuses[i] === 'available', value !== null);
      if (value !== null) {
        valid++;
        assert.ok(Math.abs(value - (1 - c.shares[i])) < 1e-7);
        if (year <= 2016) {
          baselineValid++;
          if (c.original_panel_years.includes(year)) originalBaselineValid++;
        }
      }
    });
  }
  assert.equal(valid, 4700);
  assert.equal(baselineValid, 2424);
  assert.equal(originalBaselineValid, 2219);
  for (const row of data.coverage) {
    assert.equal(row.available, data.counties.filter(c => valueAt(c, row.year) !== null).length);
    assert.equal(row.original_panel_available, data.counties.filter(c => valueAt(c, row.year) !== null && c.original_panel_years.includes(row.year)).length);
  }
});

test('original county means and classifications remain distinct from complete means', () => {
  let changedMeans = 0, changedGroups = 0;
  for (const c of data.counties) {
    const original = c.original_panel_years.filter(y => y >= 2011 && y <= 2016).map(y => valueAt(c, y)).filter(v => v !== null);
    assert.equal(c.original_mean_n_years, original.length);
    assert.ok(Math.abs(c.original_mean - original.reduce((a, b) => a + b, 0) / original.length) < 1e-7);
    const full = c.annual.slice(1, 7);
    assert.equal(full.filter(v => v !== null).length, 6);
    assert.ok(Math.abs(c.complete_mean - full.reduce((a, b) => a + b, 0) / 6) < 1e-7);
    assert.equal(c.original_high, Number(c.original_mean > data.original_cutoff));
    if (Math.abs(c.original_mean - c.complete_mean) > 1e-6) changedMeans++;
    if (Number(c.complete_mean > data.original_cutoff) !== c.original_high) changedGroups++;
  }
  assert.equal(changedMeans, 51);
  assert.equal(changedGroups, 5);
  const clinton = data.counties.find(c => c.fips === '36019');
  assert.equal(clinton.original_mean, 1);
  assert.ok(Math.abs(clinton.complete_mean - .4507576) < 1e-6);
});

test('long CSV is a unique complete grid and exactly agrees with browser values', async () => {
  const rows = parseCsv(await readFile(path.join(root, 'docs/data/county_year_mismatch.csv'), 'utf8'));
  assert.equal(rows.length, 5252);
  const byFips = new Map(data.counties.map(c => [c.fips, c]));
  const keys = new Set();
  for (const row of rows) {
    assert.match(row.county_fips, /^\d{5}$/);
    const key = `${row.county_fips}:${row.year}`;
    assert.ok(!keys.has(key)); keys.add(key);
    const county = byFips.get(row.county_fips), year = Number(row.year);
    assert.equal(row.mismatch_annual === '' ? null : Number(row.mismatch_annual), valueAt(county, year));
    assert.equal(row.status, county.statuses[year - 2010]);
    assert.equal(Number(row.in_original_extended_panel), Number(county.original_panel_years.includes(year)));
  }
});

test('source fingerprints and downloadable copies match the canonical inputs', async () => {
  const manifest = JSON.parse(await readFile(path.join(root, 'docs/data/provenance.json'), 'utf8'));
  for (const entry of manifest.source_files) {
    const original = await readFile(path.join(root, entry.file));
    const downloadable = await readFile(path.join(root, 'docs/sources', path.basename(entry.file)));
    assert.equal(original.length, entry.bytes);
    assert.equal(createHash('sha256').update(original).digest('hex'), entry.sha256);
    assert.deepEqual(downloadable, original);
  }
});

test('search handles accents, leading-zero FIPS, full state names, and ambiguous county names', () => {
  assert.equal(findCounties(data.counties, '04013')[0].name, 'Maricopa County');
  assert.equal(findCounties(data.counties, 'berks pennsylvania')[0].fips, '42011');
  assert.equal(findCounties(data.counties, 'dona ana')[0].fips, '35013');
  assert.equal(findCounties(data.counties, 'Clinton', 'NY')[0].fips, '36019');
  assert.equal(findCounties(data.counties, 'Berks', 'NY').length, 0);
  assert.ok(findCounties(data.counties, 'Washington').length > 1);
  assert.equal(findCounties(data.counties, 'not-a-real-county').length, 0);
});

test('share links round-trip and reject unknown counties, years, or duplicate comparisons', () => {
  const view = { county:'42029', year:2022, scope:'extended', compare:['42011', '42017'] };
  assert.deepEqual(readView(writeView(view), data), view);
  const safe = readView('#county=00000&year=2022&compare=42011,42011,42017,42029,99999', data);
  assert.equal(safe.county, '42011');
  assert.equal(safe.year, 2016);
  assert.deepEqual(safe.compare, ['42017', '42029']);
  assert.equal(readView('#year=2012abc', data).year, 2016);
  assert.deepEqual(yearRange('baseline'), [2010, 2011, 2012, 2013, 2014, 2015, 2016]);
});

test('CSV downloads preserve zeros, missingness, text identifiers, and selected scope', () => {
  assert.equal(formatValue(0), '0.0000');
  assert.equal(formatValue(null), '—');
  const rows = viewRows({ county:'04013', year:2010, scope:'baseline', compare:['42011'] }, data);
  assert.equal(rows.length, 14);
  assert.equal(rows[0].county_fips, '04013');
  assert.equal(rows[0].mismatch_annual, null);
  assert.equal(rows.at(-1).year, 2016);
  const output = csvText(['fips', 'value', 'label'], [{ fips:'04013', value:null, label:'A, "B"' }, { fips:'05007', value:0, label:'Zero' }]);
  const parsed = parseCsv(output);
  assert.equal(parsed[0].fips, '04013');
  assert.equal(parsed[0].value, '');
  assert.equal(parsed[0].label, 'A, "B"');
  assert.equal(parsed[1].value, '0');
});

test('offline package embeds identical data and executable scripts without external assets', async () => {
  const html = await readFile(path.join(root, 'docs/offline.html'), 'utf8');
  const embedded = html.match(/<script type="application\/json" id="embedded-data">([\s\S]*?)<\/script>/);
  assert.ok(embedded);
  assert.deepEqual(JSON.parse(embedded[1]), data);
  assert.doesNotMatch(html, /<script[^>]+src=/i);
  assert.doesNotMatch(html, /<link[^>]+rel="stylesheet"/i);
  const inline = html.match(/<script>\s*([\s\S]*?)<\/script>/);
  assert.ok(inline);
  assert.doesNotThrow(() => new vm.Script(inline[1]));
  const index = await readFile(path.join(root, 'docs/index.html'), 'utf8');
  for (const match of index.matchAll(/(?:href|src)="\.\/([^"#]+)"/g)) {
    assert.ok((await readFile(path.join(root, 'docs', match[1]))).length > 0, `Missing ${match[1]}`);
  }
});
