// Runs api/generate.js against a fake Claude client (no API key needed):
// a correct case is accepted; a broken one is sent back with the simulator's problems.
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');
process.env.ANTHROPIC_API_KEY = 'test';
let fails = 0;
const good = {
  kind: 'fix', level: 'intermediate', title: 'Move uploads off EFS', story: ['A photo app stores uploads on EFS.'],
  requirements: [
    { text: 'Users reach the app through a load balancer.', hint: 'Users -> ALB -> Auto Scaling', check: { op: 'flow', a: ['users'], b: ['asg'], via: ['alb'], n: 0, key: '', value: '' } },
    { text: 'Uploads are stored in S3.', hint: 'ASG -> S3', check: { op: 'flow', a: ['asg'], b: ['s3'], via: [], n: 0, key: '', value: '' } },
  ],
  solution: { nodes: [{ key: 'u', svc: 'users', zone: '', label: '', props: [] }, { key: 'lb', svc: 'alb', zone: 'pub', label: '', props: [{ key: 'azs', value: '2' }] },
    { key: 'app', svc: 'asg', zone: 'priv', label: 'App', props: [{ key: 'azs', value: '2' }] }, { key: 's3', svc: 's3', zone: '', label: 'Uploads', props: [] }],
    edges: [{ from: 'u', to: 'lb' }, { from: 'lb', to: 'app' }, { from: 'app', to: 's3' }] },
  start: { nodes: [{ key: 'u', svc: 'users', zone: '', label: '', props: [] }, { key: 'lb', svc: 'alb', zone: 'pub', label: '', props: [{ key: 'azs', value: '2' }] },
    { key: 'app', svc: 'asg', zone: 'priv', label: 'App', props: [{ key: 'azs', value: '2' }] }, { key: 'fs', svc: 'efs', zone: 'priv', label: 'Uploads', props: [] }],
    edges: [{ from: 'u', to: 'lb' }, { from: 'lb', to: 'app' }, { from: 'app', to: 'fs' }] },
};
const bad = JSON.parse(JSON.stringify(good));
bad.solution.edges.push({ from: 'u', to: 'app' }); // users -> private ASG: must be rejected
const replies = [bad, good];
const seen = [];
// swap the SDK module for a subclass whose client answers with the canned cases
const fake = { messages: { create: async (p) => { seen.push(p); const spec = replies.shift(); return { stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(spec) }] }; } } };
class FakeAnthropic extends Anthropic { constructor(o) { super(o); this.beta = fake; } }
Object.getOwnPropertyNames(Anthropic).forEach((k) => { if (!(k in FakeAnthropic)) try { FakeAnthropic[k] = Anthropic[k]; } catch (e) { /* read-only */ } });
require.cache[require.resolve('@anthropic-ai/sdk')].exports = FakeAnthropic;
const handler = require(path.join(__dirname, '../api/generate.js'));
const res = { code: 0, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; } };
handler({ method: 'POST', body: { level: 'intermediate', kind: 'fix', avoid: ['Old case'] } }, res).then(() => {
  const ok = res.code === 200 && res.body.rounds === 2 && seen.length === 2 && /rejected/.test(JSON.stringify(seen[1].messages[2].content)) && seen[0].output_config.format.type === 'json_schema' && seen[0].model === 'claude-opus-5-5';
  console.log((ok ? 'ok  ' : 'FAIL') + ' bad case is sent back with simulator problems, corrected case accepted (status ' + res.code + ', rounds ' + (res.body && res.body.rounds) + ')');
  if (!ok) { fails++; console.log(JSON.stringify(res.body).slice(0, 500)); }
  process.exit(fails ? 1 : 0);
});
