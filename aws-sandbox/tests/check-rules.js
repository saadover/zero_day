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
  const txt = r.issues.filter((i) => i.level === 'error').map((i) => i.title + ' ' + i.detail + ' ' + i.fix).join(' | ');
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
// ---------- realism: endpoints, CIDR, hybrid, attachments ----------
{
  const N = (id, svc, x, y, props, w, h) => ({ id, svc, x, y, w, h, props: Object.assign(S.defaultProps(svc), props || {}) });
  const base = () => [N('V', 'vpc', 0, 0, {}, 900, 500), N('pa', 'pubsubnet', 20, 40, {}, 300, 420), N('qa', 'privsubnet', 360, 40, {}, 500, 420), N('igw', 'igw', -50, 200)];
  const run = (name, nodes, edges, want, extra) => {
    const r = S.evaluate({ nodes, edges: edges.map(([a, b], i) => ({ id: 'e' + i, from: a, to: b })) }, Object.assign({ strict: true }, extra || {}));
    const txt = r.issues.filter((i) => i.level === 'error').map((i) => i.title + ' ' + i.detail + ' ' + i.fix).join(' | ');
    const ok = want ? new RegExp(want, 'i').test(txt) : r.errors === 0;
    if (!ok) { fails++; console.log('FAIL', name, '→', txt || '(no errors)'); } else console.log('ok  ', name);
  };
  const ec2 = N('e', 'ec2', 400, 100);
  run('private EC2 -> S3, no endpoint, no NAT', [...base(), ec2, N('s', 's3', 1100, 100)], [['e', 's']], 'Gateway endpoint for S3');
  run('private EC2 -> S3 with S3 gateway endpoint', [...base(), ec2, N('s', 's3', 1100, 100), N('g', 'gwendpoint', 600, 300, { service: 's3' })], [['e', 's']], null);
  run('gateway endpoint for DynamoDB does not help S3', [...base(), ec2, N('s', 's3', 1100, 100), N('g', 'gwendpoint', 600, 300, { service: 'dynamodb' })], [['e', 's']], 'Gateway endpoint for S3');
  run('S3 bucket in another region: endpoint does not help', [...base(), ec2, N('s', 's3', 1100, 100, { region: 'secondary' }), N('g', 'gwendpoint', 600, 300, { service: 's3' })], [['e', 's']], 'NAT gateway \\(endpoints only reach');
  run('private EC2 -> SQS needs SQS interface endpoint', [...base(), ec2, N('q', 'sqs', 1100, 100), N('i', 'ifendpoint', 600, 300, { service: 'sns' })], [['e', 'q']], 'Interface endpoint for SQS');
  run('private EC2 -> SQS with SQS interface endpoint', [...base(), ec2, N('q', 'sqs', 1100, 100), N('i', 'ifendpoint', 600, 300, { service: 'sqs' })], [['e', 'q']], null);
  run('ECR needs ECR + S3 endpoints', [...base(), N('c', 'ecs', 400, 100), N('r', 'ecr', 1100, 100), N('i', 'ifendpoint', 600, 300, { service: 'ecr' })], [['c', 'r']], 'Gateway endpoint for S3');
  run('NAT gateway works for everything', [...base(), ec2, N('s', 's3', 1100, 100), N('n', 'nat', 100, 100)], [['e', 's']], null);
  run('NAT gateway in a private subnet', [...base(), ec2, N('s', 's3', 1100, 100), N('n', 'nat', 600, 300)], [['e', 's']], 'NAT gateway in a private subnet');
  run('Lambda in a public subnet still has no internet', [...base(), N('l', 'lambda', 100, 100), N('d', 'dynamodb', 1100, 100)], [['l', 'd']], 'Lambda function attached to a VPC');
  run('subnet outside VPC range', [...base().map((n) => n.id === 'qa' ? Object.assign(n, { props: { cidr: '10.9.0.0/24' } }) : n)], [], 'outside the VPC');
  run('overlapping subnets', [...base().map((n) => (n.id === 'qa' || n.id === 'pa') ? Object.assign(n, { props: { cidr: '10.0.1.0/24' } }) : n)], [], 'overlap');
  run('VPC /8 not allowed', [...base().map((n) => n.id === 'V' ? Object.assign(n, { props: { cidr: '10.0.0.0/8' } }) : n)], [], '/8 isn');
  run('/28 subnet too small for ALB', [...base().map((n) => n.id === 'pa' ? Object.assign(n, { props: { cidr: '10.0.0.0/28' } }) : n), N('a', 'alb', 100, 100)], [], 'too small');
  run('VPN without Customer Gateway', [...base(), N('dc', 'onprem', -500, 0), N('v', 'vpn', -300, 0), N('a', 'alb', 400, 100), N('vg', 'vgw', -50, 350)], [['dc', 'v'], ['v', 'a']], 'no Customer Gateway');
  run('VPN without Virtual Private Gateway', [...base(), N('dc', 'onprem', -500, 0), N('c', 'cgw', -400, 0), N('v', 'vpn', -300, 0), N('a', 'alb', 400, 100)], [['dc', 'c'], ['c', 'v'], ['v', 'a']], 'no Virtual Private Gateway');
  run('VPN with CGW and VGW works', [...base(), N('dc', 'onprem', -500, 0), N('c', 'cgw', -400, 0), N('v', 'vpn', -300, 0), N('a', 'alb', 400, 100), N('vg', 'vgw', -50, 350)], [['dc', 'c'], ['c', 'v'], ['v', 'a']], null);
  run('on-prem CIDR overlaps VPC', [...base(), N('dc', 'onprem', -500, 0, { cidr: '10.0.0.0/8' }), N('c', 'cgw', -400, 0), N('v', 'vpn', -300, 0), N('a', 'alb', 400, 100), N('vg', 'vgw', -50, 350)], [['dc', 'c'], ['c', 'v'], ['v', 'a']], 'same IP range');
  run('Direct Connect straight to Transit Gateway', [...base(), N('dc', 'onprem', -500, 0), N('x', 'dx', -300, 0), N('t', 'tgw', -300, 300)], [['dc', 'x'], ['x', 't'], ['t', 'V']], 'Direct Connect Gateway');
  run('Transit Gateway not attached', [...base(), N('t', 'tgw', -300, 300)], [], 'attached to any VPC');
  const two = () => [N('V', 'vpc', 0, 0, {}, 400, 300), N('p1', 'privsubnet', 20, 40, {}, 360, 240), N('W', 'vpc', 600, 0, { cidr: '10.1.0.0/16' }, 400, 300), N('p2', 'privsubnet', 620, 40, {}, 360, 240), N('a', 'ec2', 100, 100), N('b', 'ec2', 700, 100)];
  run('cross-VPC traffic without TGW', two(), [['a', 'b']], 'different VPCs');
  run('cross-VPC traffic with TGW attached to both', [...two(), N('t', 'tgw', 400, 400)], [['a', 'b'], ['t', 'V'], ['t', 'W']], null);
  run('TGW joining overlapping VPCs', [...two().map((n) => n.id === 'W' ? Object.assign(n, { props: { cidr: '10.0.0.0/16' } }) : n), N('t', 'tgw', 400, 400)], [['a', 'b'], ['t', 'V'], ['t', 'W']], 'overlapping IP ranges');
  run('ACM for CloudFront outside us-east-1', [N('u', 'users', 0, 0), N('c', 'cloudfront', 200, 0), N('s', 's3', 400, 0), N('m', 'acm', 200, 200, { region: 'secondary' })], [['u', 'c'], ['c', 's'], ['m', 'c']], 'us-east-1');
  run('API Gateway to private ALB without VPC Link', [...base(), N('u', 'users', -400, 0), N('g', 'apigw', -200, 0), N('a', 'alb', 400, 100)], [['u', 'g'], ['g', 'a']], 'VPC Link');
}
console.log(fails ? fails + ' failed' : 'all rule checks passed');
process.exit(fails ? 1 : 0);
