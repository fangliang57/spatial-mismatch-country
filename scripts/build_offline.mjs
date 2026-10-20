import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../docs');
const read = name => readFile(path.join(root, name), 'utf8');
const [html, css, core, app, config, json, icon] = await Promise.all([
  read('index.html'), read('styles.css'), read('core.js'), read('app.js'), read('config.js'), read('data/counties.json'), read('favicon.svg'),
]);
JSON.parse(json);
const code = [config, core].map(source => source.replace(/^export /gm, '')).join('\n') + '\n' + app.replace(/^import .*;\n/gm, '');
const inline = code.replace(/<\/script/gi, '<\\/script');
let standalone = html.replace('  <link rel="stylesheet" href="./styles.css">', `<style>\n${css}\n</style>`)
  .replace('  <script type="module" src="./app.js"></script>', '')
  .replace('href="./favicon.svg"', `href="data:image/svg+xml;base64,${Buffer.from(icon).toString('base64')}"`)
  .replace('</body>', `<script type="application/json" id="embedded-data">${json.replaceAll('<', '\\u003c')}</script>\n<script>\n(() => {\n${inline}\n})();\n</script>\n</body>`);
await writeFile(path.join(root, 'offline.html'), standalone);
console.log(`Offline version ready: docs/offline.html (${Buffer.byteLength(standalone)} bytes)`);
