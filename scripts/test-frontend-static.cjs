// Run: node scripts/test-frontend-static.cjs
// Validate the deployed entry points, rather than the divergent readable sources.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const dist = path.resolve(__dirname, '../frontend/dist');
const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script\b[^>]*src="([^"]+)"[^>]*>/g)];
assert(scripts.length > 0);
for (const [, src] of scripts) {
  const filename = path.join(dist, src.split('?')[0]);
  new vm.Script(fs.readFileSync(filename, 'utf8'), { filename });
  console.log('PARSE PASS', src);
}
const enhancer = fs.readFileSync(path.join(dist, 'compat/result-enhancer.js'), 'utf8');
assert(enhancer.includes('.dataset-mode-links'));
assert(enhancer.includes('.match-gender-picker'));
assert(!enhancer.includes('.community-share'));
for (const file of ['compat/result-enhancer.js', 'compat/site-nav.js']) {
  assert(!/href=["']\/(?:feed|community)(?:["'?/])/.test(fs.readFileSync(path.join(dist, file), 'utf8')), file);
}
const urls = scripts.map(([, src]) => src.split('?')[0]);
assert(urls.indexOf('/compat/festival-cards.js') < urls.indexOf('/compat/result-enhancer.js'));
assert(urls.indexOf('/compat/result-enhancer.js') < urls.indexOf('/compat/analysis-experience.js'));
assert(urls.indexOf('/compat/analysis-experience.js') < urls.indexOf('/compat/admin-access.js'));
console.log('STATIC PASS');
