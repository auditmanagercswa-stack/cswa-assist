/**
 * Builds a single self-contained HTML file (CSS + JS inlined, no server
 * needed) for sharing a preview of the site: dist-preview/cswa-preview.html
 */
import { build } from 'vite';
import fs from 'node:fs';
import path from 'node:path';

const outDir = path.resolve('dist-preview');
process.env.VITE_STATIC = 'true';
await build({ base: './', build: { outDir, emptyOutDir: true, assetsInlineLimit: 100000000 }, logLevel: 'warn' });

let html = fs.readFileSync(path.join(outDir, 'index.html'), 'utf8');
const read = (href) => fs.readFileSync(path.join(outDir, href), 'utf8');
const favicon = `data:image/svg+xml,${encodeURIComponent(read('favicon.svg'))}`;

html = html
  .replace(/<link rel="stylesheet"[^>]*href="\.\/(assets\/[^"]+\.css)"[^>]*>/, (_, f) => `<style>${read(f)}</style>`)
  .replace(/<script type="module"[^>]*src="\.\/(assets\/[^"]+\.js)"[^>]*><\/script>/, '')
  .replace('href="./favicon.svg"', `href="${favicon}"`);
const js = read(fs.readdirSync(path.join(outDir, 'assets')).map((f) => `assets/${f}`).find((f) => f.endsWith('.js')));
// Script goes after #root so the DOM exists when it runs.
// Replacer function, so `$&`-style sequences in the minified JS stay literal.
const inlineScript = `<script type="module">${js.replace(/<\/script/g, '<\\/script')}</script>\n</body>`;
html = html.replace('</body>', () => inlineScript);

fs.writeFileSync(path.join(outDir, 'cswa-preview.html'), html);
console.log(`Preview written to ${path.join(outDir, 'cswa-preview.html')} (${(html.length / 1024).toFixed(0)} KB)`);
