// Every local "fix a broken design" exercise must start failing and have a passing answer.
const path = require('path');
['services', 'engine', 'scenarios'].forEach((f) => require(path.join(__dirname, '../js', f + '.js')));
const S = globalThis.AWSSIM;
let bad = 0, n = 0;
for (const L of S.LEVELS) for (let s = 1; s <= 60; s++) {
  const f = S.generateFixExercise(L, s * 31); n++;
  if (!f) { bad++; continue; }
  const opts = { strict: L !== 'beginner', simple: L === 'beginner', requirements: f.reqs, level: L };
  if (S.evaluate(f.startGraph, opts).passed) { bad++; console.log('starts passing:', L, s); }
  if (!S.evaluate(S.layoutSolution(f.sol), opts).passed) { bad++; console.log('answer fails:', L, s); }
}
console.log(n + ' fix exercises checked, ' + bad + ' problems');
process.exit(bad ? 1 : 0);
