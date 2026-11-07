// Spot checks that common mistakes fail with the right explanation.  node tests/check-rules.js
const path = require('path');
['services', 'engine', 'scenarios'].forEach((f) => require(path.join(__dirname, '../js', f + '.js')));
const S = globalThis.AWSSIM;
let fails = 0;
function graph(spec) {
  const nodes = spec.n.map(([id, svc, props, x, y, w, h]) => ({ id, svc, props: Object.assign(S.defaultProps(svc), props || {}), x: x || 0, y: y || 0, w, h }));
  return { nodes, edges: spec.e.map(([a, b], i) => ({ id: 'e' + i, from: a, to: b })) };
}
function expect(name, spec, want) {
  const r = S.evaluate(graph(spec), { strict: !!spec.strict });
  const txt = r.issues.filter((i) => i.level === 'error').map((i) => i.title + ' ' + i.detail).join(' | ');
  const ok = want ? new RegExp(want, 'i').test(txt) : r.errors === 0;
  if (!ok) { fails++; console.log('FAIL', name, '→', txt || '(no errors)'); } else console.log('ok  ', name);
}
const VPC = ['v', 'vpc', {}, 0, 0, 900, 400], PUB = ['p', 'pubsubnet', {}, 20, 40, 300, 340], PRIV = ['q', 'privsubnet', {}, 360, 40, 500, 340];
expect('users -> rds', { n: [['u', 'users'], ['d', 'dynamodb']], e: [['u', 'd']] }, 'never exposed');
expect('cache -> db', { n: [['l', 'lambda'], ['c', 'elasticache', {}, 400, 100], ['d', 'rds', {}, 500, 100], VPC, PUB, PRIV], e: [['c', 'd']] }, 'lazy loading');
expect('users -> lambda no url', { n: [['u', 'users'], ['l', 'lambda']], e: [['u', 'l']] }, 'no public address');
expect('users -> private ec2', { n: [['u', 'users'], ['e', 'ec2', {}, 400, 100], VPC, PUB, PRIV, ['i', 'igw', {}, -50, 150]], e: [['u', 'e']] }, 'private subnet');
expect('users -> public ec2 ok', { n: [['u', 'users', {}, -300, 0], ['e', 'ec2', {}, 60, 100], VPC, PUB, PRIV, ['i', 'igw', {}, -50, 150]], e: [['u', 'e']] }, null);
expect('lambda outside vpc -> private rds', { n: [['u', 'users', {}, -300], ['l', 'lambda', {}, -200, 600], ['d', 'rds', {}, 400, 100], VPC, PUB, PRIV], e: [['l', 'd']] }, 'outside your VPC');
expect('private ec2 -> external w/o NAT (strict)', { strict: true, n: [['e', 'ec2', {}, 400, 100], ['x', 'external', {}, 1200, 0], VPC, PUB, PRIV], e: [['e', 'x']] }, 'NAT');
expect('s3 -> rds', { n: [['s', 's3'], ['d', 'rds', {}, 400, 100], VPC, PRIV], e: [['s', 'd']] }, 'write into a database');
expect('route53 -> private bucket', { n: [['u', 'users'], ['r', 'route53'], ['s', 's3']], e: [['u', 'r'], ['r', 's']] }, 'static website');
expect('alb single az', { n: [['a', 'alb', { azs: 1 }, 60, 100], VPC, PUB, PRIV], e: [] }, '2 Availability Zones');
expect('ec2 no vpc (strict)', { strict: true, n: [['e', 'ec2']], e: [] }, 'inside a VPC');
expect('kinesis -> s3', { n: [['k', 'kinesis'], ['s', 's3']], e: [['k', 's']] }, 'Firehose');
expect('serverless api ok', { n: [['u', 'users'], ['a', 'apigw'], ['l', 'lambda'], ['d', 'dynamodb']], e: [['u', 'a'], ['a', 'l'], ['l', 'd']] }, null);
console.log(fails ? fails + ' failed' : 'all rule checks passed');
process.exit(fails ? 1 : 0);
