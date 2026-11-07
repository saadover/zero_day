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
  const r = S.evaluate(graph(spec), { strict: !!spec.strict, simple: !!spec.simple });
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
expect('beginner: users -> ec2 -> rds, no VPC boxes', { simple: true, n: [['u', 'users'], ['e', 'ec2'], ['d', 'rds']], e: [['u', 'e'], ['e', 'd']] }, null);
expect('beginner: users -> rds still fails', { simple: true, n: [['u', 'users'], ['d', 'rds']], e: [['u', 'd']] }, 'never exposed');
expect('beginner: users -> ecs needs a load balancer', { simple: true, n: [['u', 'users'], ['c', 'ecs']], e: [['u', 'c']] }, 'load balancer');
// AZ boxes: an ALB drawn across both public subnets counts as 2 AZs; a lone EC2 in one AZ box counts as 1
{
  const N = (id, svc, x, y, w, h, props) => ({ id, svc, x, y, w, h, props: Object.assign(S.defaultProps(svc), props || {}) });
  const nodes = [N('R', 'region', 0, 0, 1000, 640, { region: 'secondary' }), N('V', 'vpc', 30, 50, 940, 560), N('A', 'az', 60, 100, 420, 480), N('B', 'az', 520, 100, 420, 480),
    N('pa', 'pubsubnet', 80, 150, 380, 160), N('qa', 'privsubnet', 80, 340, 380, 220), N('pb', 'pubsubnet', 540, 150, 380, 160), N('qb', 'privsubnet', 540, 340, 380, 220),
    N('alb', 'alb', 440, 190, 0, 0, { azs: 1 }), N('e1', 'ec2', 200, 360), N('d1', 'rds', 200, 470), N('d2', 'rds', 660, 470)];
  const pl = S.computePlacement(nodes), az = S.effectiveAzs(nodes, pl);
  const ok = az.alb === 2 && az.e1 === 1 && az.d1 === 2 && pl.e1.subnet === 'private' && pl.alb.subnet === 'public' && pl.e1.region === 'secondary';
  console.log((ok ? 'ok  ' : 'FAIL') + ' AZ and Region boxes', JSON.stringify(az), pl.e1.region);
  if (!ok) fails++;
}
console.log(fails ? fails + ' failed' : 'all rule checks passed');
process.exit(fails ? 1 : 0);
