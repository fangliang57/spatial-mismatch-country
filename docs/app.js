import { stateNames, formatValue, valueAt, yearRange, findCounties, readView, writeView, csvText, viewRows, validateDataset } from './core.js';

const $ = id => document.getElementById(id);
const escapeText = value => String(value).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const colors = ['#222222', '#555555', '#888888'];
$('reload').addEventListener('click', () => location.reload());

let data, view, byFips;
let searchMatches = [], activeSearchIndex = -1, toastTimer;

function toast(message) {
  clearTimeout(toastTimer);
  $('toast').textContent = message;
  $('toast').hidden = false;
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, 3200);
}

function closeSearch() {
  $('county-results').hidden = true;
  $('county-search').setAttribute('aria-expanded', 'false');
  $('county-search').removeAttribute('aria-activedescendant');
  activeSearchIndex = -1;
}

function showSearch() {
  const currentLabel = `${byFips.get(view.county).name}, ${byFips.get(view.county).state}`;
  const query = $('county-search').value === currentLabel ? '' : $('county-search').value;
  const allMatches = findCounties(data.counties, query, $('state-filter').value);
  if (!query) allMatches.sort((a, b) => Number(b.fips === view.county) - Number(a.fips === view.county));
  searchMatches = allMatches.slice(0, 40);
  activeSearchIndex = -1;
  $('county-results').innerHTML = searchMatches.length ? searchMatches.map((c, i) => `<div id="county-option-${i}" class="search-option" role="option" aria-selected="false" data-fips="${c.fips}"><span>${escapeText(c.name)}<small>${escapeText(stateNames[c.state])} · ${c.state}</small></span><span class="option-fips">${c.fips}</span></div>`).join('') : '<div class="search-empty">No study counties match. Try another name or choose “All 25 states”.</div>';
  if (allMatches.length > 40) $('county-results').insertAdjacentHTML('beforeend', `<div class="search-more">Showing 40 of ${allMatches.length} counties. Type to narrow the list.</div>`);
  $('county-results').hidden = false;
  $('county-search').setAttribute('aria-expanded', 'true');
}

function focusSearchOption(index) {
  activeSearchIndex = Math.max(0, Math.min(index, searchMatches.length - 1));
  $('county-results').querySelectorAll('[role=option]').forEach((option, i) => {
    const active = i === activeSearchIndex;
    option.classList.toggle('active', active);
    option.setAttribute('aria-selected', String(active));
    if (active) {
      $('county-search').setAttribute('aria-activedescendant', option.id);
      const list = $('county-results');
      if (option.offsetTop < list.scrollTop) list.scrollTop = option.offsetTop;
      if (option.offsetTop + option.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = option.offsetTop + option.offsetHeight - list.clientHeight;
    }
  });
}

function chooseCounty(fips) {
  if (!byFips.has(fips)) return;
  view.county = fips;
  view.compare = view.compare.filter(value => value !== fips);
  if ($('state-filter').value && $('state-filter').value !== byFips.get(fips).state) $('state-filter').value = '';
  closeSearch();
  render();
}

function chooseYear(year) {
  if (!yearRange(view.scope).includes(year)) return;
  view.year = year;
  render();
}

function render() {
  const county = byFips.get(view.county);
  const years = yearRange(view.scope);
  const annual = valueAt(county, view.year);
  $('county-search').value = `${county.name}, ${county.state}`;
  $('county-location').textContent = `${stateNames[county.state]} · UNITED STATES`;
  $('county-title').textContent = county.name;
  $('fips-label').textContent = `COUNTY FIPS ${county.fips}`;
  $('year-select').innerHTML = years.map(y => `<option value="${y}" ${y === view.year ? 'selected' : ''}>${y}</option>`).join('');
  $('previous-year').disabled = view.year === years[0];
  $('next-year').disabled = view.year === years.at(-1);
  document.querySelectorAll('[data-window]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.window === view.scope)));
  $('window-select').value = view.scope;
  $('value-label').textContent = `Mismatch in ${view.year}`;
  $('annual-value').textContent = annual === null ? 'Not available' : formatValue(annual);
  $('annual-value').classList.toggle('unavailable', annual === null);
  const indicator = document.querySelector('.measure-scale i');
  if (indicator) { indicator.style.visibility = annual === null ? 'hidden' : 'visible'; indicator.style.left = `${(annual ?? 0) * 100}%`; }
  $('original-mean').textContent = formatValue(county.original_mean);
  $('original-years').textContent = `${county.original_mean_n_years} ${county.original_mean_n_years === 1 ? 'year' : 'years'}`;
  $('complete-mean').textContent = formatValue(county.complete_mean);
  $('original-group').textContent = county.original_high ? 'High mismatch' : 'Low mismatch';
  $('original-group').classList.toggle('high', Boolean(county.original_high));
  const selectedCounties = [county, ...view.compare.map(fips => byFips.get(fips))];
  $('chart-legend').innerHTML = selectedCounties.map((c, i) => `<span><i class="legend-line ${i === 1 ? 'dashed' : ''}" style="--legend-color:${colors[i]}"></i>${escapeText(c.name)}, ${c.state}</span>`).join('') + (view.compare.length ? '' : '<span><i class="legend-line dashed" style="--legend-color:#999999"></i>Original analysis mean</span>');
  $('compare-chips').innerHTML = view.compare.map((fips, i) => { const c = byFips.get(fips); return `<div class="compare-chip"><span><i style="color:${colors[i + 1]}" aria-hidden="true">●</i> ${escapeText(c.name)}, ${c.state}</span><button data-remove="${fips}" aria-label="Remove ${escapeText(c.name)}, ${c.state}">×</button></div>`; }).join('');
  const candidates = data.counties.filter(c => c.fips !== view.county && !view.compare.includes(c.fips));
  $('compare-select').innerHTML = '<option value="">Add a county…</option>' + candidates.map(c => `<option value="${c.fips}">${escapeText(c.name)}, ${c.state} (${c.fips})</option>`).join('');
  $('compare-select').disabled = view.compare.length >= 2;
  $('add-compare').disabled = true;
  renderTable(selectedCounties);
  renderChart();
  history.replaceState(null, '', writeView(view));
  $('announcement').textContent = `${county.name}, ${county.state}, ${view.year}: ${annual === null ? 'annual mismatch unavailable' : 'annual mismatch ' + formatValue(annual)}.`;
}

function renderTable(selectedCounties) {
  const compare = selectedCounties.length > 1;
  const headings = compare ? ['Year', ...selectedCounties.map(c => `${c.name}, ${c.state}`)] : ['Year', 'Annual mismatch', 'Original panel'];
  $('annual-table').querySelector('thead').innerHTML = '<tr>' + headings.map(text => `<th scope="col">${escapeText(text)}</th>`).join('') + '</tr>';
  $('annual-table').querySelector('tbody').innerHTML = yearRange(view.scope).map(year => {
    const values = selectedCounties.map(c => `<td>${formatValue(valueAt(c, year))}</td>`).join('');
    const sourceOnly = !selectedCounties[0].original_panel_years.includes(year);
    const statusLabel = sourceOnly ? (valueAt(selectedCounties[0], year) === null ? 'Outside panel' : 'Source only') : 'Included';
    const status = compare ? '' : `<td><span class="panel-status ${sourceOnly ? 'source-only' : ''}">${statusLabel}</span></td>`;
    return `<tr class="${year === view.year ? 'selected' : ''}"><th scope="row" style="text-align:left;font-weight:400;padding:11px 9px;border-bottom:1px solid #eef1ed"><button data-year="${year}" class="inline-button" aria-label="Inspect ${year}" ${year === view.year ? 'aria-current="true"' : ''}>${year}</button></th>${values}${status}</tr>`;
  }).join('');
}

function renderChart() {
  if (!data || !view || $('explorer').hidden) return;
  const county = byFips.get(view.county);
  const selected = [county, ...view.compare.map(f => byFips.get(f))];
  const years = yearRange(view.scope);
  const width = Math.max(280, Math.round($('profile-chart').clientWidth || 650));
  const height = 248, left = 39, right = width - 15, top = 25, bottom = 213;
  const x = year => left + (year - years[0]) / (years.at(-1) - years[0]) * (right - left);
  const y = value => bottom - value * (bottom - top);
  const parts = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Annual spatial mismatch for ${escapeText(selected.map(c => `${c.name}, ${c.state}`).join('; '))}" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif"><title>Annual spatial mismatch; 0 to 1</title>`];
  if (view.scope === 'extended') {
    parts.push(`<rect x="${x(2016.5)}" y="${top}" width="${right - x(2016.5)}" height="${bottom - top}" fill="#f7f7f7"/><line x1="${x(2016.5)}" x2="${x(2016.5)}" y1="${top}" y2="${bottom}" stroke="#aaaaaa" stroke-dasharray="3 4"/><text x="${right}" y="12" text-anchor="end" font-size="9" fill="#777777">2017 reporting change</text>`);
  }
  parts.push(`<line x1="${x(view.year)}" x2="${x(view.year)}" y1="${top}" y2="${bottom}" stroke="#bbbbbb" stroke-width="1"/>`);
  for (const tick of [0, .25, .5, .75, 1]) parts.push(`<line x1="${left}" x2="${right}" y1="${y(tick)}" y2="${y(tick)}" stroke="#eeeeee" stroke-width="1"/><text x="${left - 10}" y="${y(tick) + 3.5}" text-anchor="end" font-size="9" fill="#777777">${tick.toFixed(2)}</text>`);
  const tickStep = width < 420 ? (view.scope === 'extended' ? 3 : 2) : (width < 650 && view.scope === 'extended' ? 2 : 1);
  years.forEach((year, index) => { if (index % tickStep === 0 || index === years.length - 1) parts.push(`<text x="${x(year)}" y="${bottom + 24}" text-anchor="middle" font-size="9" fill="${year === view.year ? '#222222' : '#777777'}" font-weight="${year === view.year ? '650' : '400'}">${year}</text>`); });

  if (selected.length === 1) parts.push(`<line x1="${x(2011)}" x2="${x(2016)}" y1="${y(county.original_mean)}" y2="${y(county.original_mean)}" stroke="#999999" stroke-width="1" stroke-dasharray="4 4"/>`);
  selected.forEach((c, seriesIndex) => {
    let segment = [];
    const segments = [];
    years.forEach(year => {
      const value = valueAt(c, year);
      if (value === null || year === 2017) { if (segment.length) segments.push(segment); segment = []; }
      if (value !== null) segment.push({ year, value });
    });
    if (segment.length) segments.push(segment);
    const dash = seriesIndex === 1 ? 'stroke-dasharray="6 4"' : seriesIndex === 2 ? 'stroke-dasharray="2 4"' : '';
    segments.forEach(points => {
      const coords = points.map(p => `${x(p.year)},${y(p.value)}`).join(' ');
      if (seriesIndex === 0 && selected.length === 1 && points.length > 1) parts.push(`<polygon points="${x(points[0].year)},${bottom} ${coords} ${x(points.at(-1).year)},${bottom}" fill="#222222" opacity=".045"/>`);
      if (points.length > 1) parts.push(`<polyline points="${coords}" fill="none" stroke="${colors[seriesIndex]}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ${dash}/>`);
      points.forEach(p => {
        const selectedYear = p.year === view.year;
        parts.push(`<g class="${seriesIndex === 0 ? 'chart-point' : ''}" ${seriesIndex === 0 ? `data-year="${p.year}" tabindex="0" role="button" aria-label="Inspect ${p.year}, mismatch ${formatValue(p.value)}"` : ''}><title>${escapeText(c.name)}, ${c.state} · ${p.year}: ${formatValue(p.value)}</title><circle cx="${x(p.year)}" cy="${y(p.value)}" r="${selectedYear ? 5 : 3.2}" fill="${selectedYear ? colors[seriesIndex] : '#fff'}" stroke="${colors[seriesIndex]}" stroke-width="1.6"/></g>`);
      });
    });
  });
  parts.push('</svg>');
  $('profile-chart').innerHTML = parts.join('');
}

function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = name;
  document.body.append(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function saveChart() {
  const svg = $('profile-chart').querySelector('svg');
  const [,, width, height] = svg.getAttribute('viewBox').split(' ').map(Number);
  const countyNames = [view.county, ...view.compare].map(f => { const c = byFips.get(f); return `${c.name}, ${c.state}`; }).join(' · ');
  const exported = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height + 56}" width="${width * 2}" height="${(height + 56) * 2}"><rect width="100%" height="100%" fill="white"/><text x="39" y="22" font-family="Georgia,serif" font-size="16" fill="#171717">Annual spatial mismatch</text><text x="39" y="40" font-family="sans-serif" font-size="10" fill="#666666">${escapeText(countyNames)}</text><g transform="translate(0,48)">${svg.innerHTML}</g></svg>`;
  download(`mismatch-profile-${view.county}.svg`, exported, 'image/svg+xml');
  toast('Chart saved as SVG.');
}

function togglePresentation(force) {
  const active = typeof force === 'boolean' ? force : !document.body.classList.contains('presentation');
  document.body.classList.toggle('presentation', active);
  $('presentation').setAttribute('aria-pressed', String(active));
  $('presentation').textContent = active ? 'Exit presentation' : 'Present';
  if (active) $('profile-details').open = true;
  requestAnimationFrame(renderChart);
}

function bindEvents() {
  const input = $('county-search');
  input.addEventListener('focus', () => { input.select(); showSearch(); });
  input.addEventListener('input', showSearch);
  input.addEventListener('blur', () => setTimeout(closeSearch, 120));
  input.addEventListener('keydown', event => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if ($('county-results').hidden) showSearch();
      if (searchMatches.length) focusSearchOption(activeSearchIndex + (event.key === 'ArrowDown' ? 1 : -1));
    } else if (event.key === 'Enter' && !$('county-results').hidden && searchMatches.length) {
      event.preventDefault(); chooseCounty(searchMatches[Math.max(0, activeSearchIndex)].fips); input.blur();
    } else if (event.key === 'Escape') closeSearch();
  });
  $('county-results').addEventListener('mousedown', event => event.preventDefault());
  $('county-results').addEventListener('click', event => { const option = event.target.closest('[data-fips]'); if (option) { chooseCounty(option.dataset.fips); input.blur(); } });
  $('state-filter').addEventListener('change', () => { input.value = ''; input.focus(); showSearch(); });
  $('year-select').addEventListener('change', event => chooseYear(Number(event.target.value)));
  $('previous-year').addEventListener('click', () => chooseYear(view.year - 1));
  $('next-year').addEventListener('click', () => chooseYear(view.year + 1));
  $('window-select').addEventListener('change', event => { view.scope = event.target.value; if (!yearRange(view.scope).includes(view.year)) view.year = 2016; render(); });
  document.querySelectorAll('[data-example]').forEach(button => button.addEventListener('click', () => chooseCounty(button.dataset.example)));
  $('compare-select').addEventListener('change', () => { $('add-compare').disabled = !$('compare-select').value || view.compare.length >= 2; });
  $('add-compare').addEventListener('click', () => { const fips = $('compare-select').value; if (fips && fips !== view.county && !view.compare.includes(fips) && view.compare.length < 2) { view.compare.push(fips); render(); $('profile-details').open = true; } });
  $('compare-chips').addEventListener('click', event => { const button = event.target.closest('[data-remove]'); if (button) { view.compare = view.compare.filter(f => f !== button.dataset.remove); render(); } });
  $('annual-table').addEventListener('click', event => { const button = event.target.closest('[data-year]'); if (button) chooseYear(Number(button.dataset.year)); });
  $('profile-chart').addEventListener('click', event => { const point = event.target.closest('[data-year]'); if (point) chooseYear(Number(point.dataset.year)); });
  $('profile-chart').addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { const point = event.target.closest('[data-year]'); if (point) { event.preventDefault(); chooseYear(Number(point.dataset.year)); } } });
  $('share-view').addEventListener('click', async () => {
    if (location.protocol === 'file:') { toast('This is a local file. Publish the project to share a web link.'); return; }
    try { if (!navigator.clipboard) throw new Error('Clipboard unavailable'); await navigator.clipboard.writeText(location.href); toast('Link copied with this county, year, and comparison.'); }
    catch { toast('Copy the address in your browser to share this view.'); }
  });
  $('download-view').addEventListener('click', () => {
    const rows = viewRows(view, data);
    download(`mismatch-${view.county}-${view.scope}.csv`, csvText(Object.keys(rows[0]), rows), 'text/csv;charset=utf-8');
    toast('Current view downloaded as CSV.');
  });
  $('save-chart').addEventListener('click', saveChart);
  $('presentation').addEventListener('click', () => togglePresentation());
  document.addEventListener('keydown', event => { if (event.key === 'Escape') togglePresentation(false); });
  window.addEventListener('hashchange', () => { view = readView(location.hash, data); render(); });
  let lastWidth = 0;
  const observer = new ResizeObserver(entries => { const width = Math.round(entries[0].contentRect.width); if (width !== lastWidth) { lastWidth = width; renderChart(); } });
  observer.observe($('profile-chart'));
}

async function init() {
  try {
    const embedded = document.getElementById('embedded-data');
    const response = embedded ? { ok: true, json: async () => JSON.parse(embedded.textContent) } : await fetch('./data/counties.json');
    if (!response.ok) throw new Error(`Data request failed: ${response.status}`);
    data = validateDataset(await response.json());
    byFips = new Map(data.counties.map(c => [c.fips, c]));
    view = readView(location.hash, data);
    const states = [...new Set(data.counties.map(c => c.state))].sort((a, b) => stateNames[a].localeCompare(stateNames[b]));
    $('state-filter').innerHTML = `<option value="">All ${states.length} states</option>` + states.map(state => `<option value="${state}">${escapeText(stateNames[state])} (${state})</option>`).join('');
    $('loading').hidden = true;
    $('explorer').hidden = false;
    bindEvents(); render();
    if (view.compare.length) { $('comparison-options').open = true; $('profile-details').open = true; }
  } catch (error) {
    console.error('Explorer could not initialize:', error);
    $('loading').hidden = true;
    $('load-error').hidden = false;
  }
}

init();
