export const stateNames = { AR:'Arkansas', AZ:'Arizona', CO:'Colorado', FL:'Florida', IL:'Illinois', IN:'Indiana', KS:'Kansas', MD:'Maryland', MI:'Michigan', MN:'Minnesota', NC:'North Carolina', ND:'North Dakota', NE:'Nebraska', NJ:'New Jersey', NM:'New Mexico', NV:'Nevada', NY:'New York', OH:'Ohio', OK:'Oklahoma', OR:'Oregon', PA:'Pennsylvania', SC:'South Carolina', TX:'Texas', VA:'Virginia', WI:'Wisconsin' };

export const formatValue = value => value === null || value === undefined ? '—' : Number(value).toFixed(4);
export const valueAt = (county, year) => county.annual[year - 2010] ?? null;
export const yearRange = scope => Array.from({ length: scope === 'extended' ? 13 : 7 }, (_, i) => 2010 + i);
export const normalizeQuery = value => String(value).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export function findCounties(counties, query, state = '') {
  const terms = normalizeQuery(query).split(' ').filter(Boolean);
  return counties.filter(c => (!state || c.state === state) && terms.every(term => normalizeQuery(`${c.name} ${c.state} ${stateNames[c.state] || ''} ${c.fips}`).includes(term)));
}

export function readView(hash, data) {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const exists = fips => data.counties.some(c => c.fips === fips);
  const fallback = exists('42011') ? '42011' : data.counties[0].fips;
  const county = exists(params.get('county')) ? params.get('county') : fallback;
  const scope = params.get('window') === 'extended' ? 'extended' : 'baseline';
  const inputYear = Number(params.get('year'));
  const year = yearRange(scope).includes(inputYear) ? inputYear : 2016;
  const compare = [...new Set((params.get('compare') || '').split(','))].filter(fips => fips !== county && exists(fips)).slice(0, 2);
  return { county, year, scope, compare };
}

export function writeView(view) {
  const params = new URLSearchParams({ county: view.county, year: String(view.year) });
  if (view.scope === 'extended') params.set('window', 'extended');
  if (view.compare.length) params.set('compare', view.compare.join(','));
  return '#' + params.toString();
}

export function csvText(columns, rows) {
  const escape = value => {
    if (value === null || value === undefined) return '';
    const string = String(value);
    return /[",\r\n]/.test(string) ? '"' + string.replaceAll('"', '""') + '"' : string;
  };
  return [columns.map(escape).join(','), ...rows.map(row => columns.map(key => escape(row[key])).join(','))].join('\r\n') + '\r\n';
}

export function viewRows(view, data) {
  return [view.county, ...view.compare].flatMap(fips => {
    const county = data.counties.find(c => c.fips === fips);
    return yearRange(view.scope).map(year => ({
      county_fips: county.fips, county_name: county.name, state: county.state, year,
      mismatch_annual: valueAt(county, year), status: county.statuses[year - 2010],
      in_original_panel: Number(county.original_panel_years.includes(year)),
      original_analysis_mean: county.original_mean, original_analysis_high: county.original_high,
      complete_mean_2011_2016: county.complete_mean,
    }));
  });
}

export function validateDataset(data) {
  if (data.schema_version !== 1 || !Array.isArray(data.counties) || data.counties.length !== data.county_count) throw new Error('Unsupported dataset.');
  const seen = new Set();
  for (const county of data.counties) {
    if (!/^\d{5}$/.test(county.fips) || seen.has(county.fips)) throw new Error('Invalid or duplicate county FIPS.');
    seen.add(county.fips);
    if (county.annual.length !== 13 || county.statuses.length !== 13 || county.shares.length !== 13) throw new Error('Invalid annual coverage.');
    for (const value of county.annual) if (value !== null && (!Number.isFinite(value) || value < 0 || value > 1)) throw new Error('Invalid mismatch value.');
  }
  return data;
}
