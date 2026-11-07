// Every generated question's sample answer must pass its own requirements
// with strict networking checks and zero errors.   node tests/check-scenarios.js
const path = require('path');
['services', 'engine', 'scenarios'].forEach((f) => require(path.join(__dirname, '../js', f + '.js')));
const S = globalThis.AWSSIM;
let fails = 0, runs = 0;
const warnSeen = new Map();
for (const t of S.TEMPLATES) {
  for (let seed = 1; seed <= 40; seed++) {
    const sc = S.generateScenario(t.level, seed * 7919, t.id);
    const g = S.layoutSolution(sc.sol);
    const res = S.evaluate(g, { strict: true, requirements: sc.reqs, level: t.level });
    runs++;
    const bad = res.issues.filter((i) => i.level === 'error');
    const req = res.requirements.filter((r) => !r.ok);
    if (bad.length || req.length) {
      fails++;
      if (fails <= 15) {
        console.log('FAIL', t.id, 'seed', seed);
        bad.forEach((i) => console.log('   error:', i.title, '|', i.detail));
        req.forEach((r) => console.log('   requirement:', r.text));
      }
    }
    res.issues.filter((i) => i.level === 'warn').forEach((i) => warnSeen.set(t.id + ': ' + i.title, 1));
  }
}
for (const k of warnSeen.keys()) console.log('warn', k);
console.log(runs + ' scenarios checked, ' + fails + ' failed');
process.exit(fails ? 1 : 0);
