/* AWS Architecture Sandbox — simulation engine.
 * Pure functions: no DOM. evaluate(graph, opts) → results.
 */
(function (S) {
  'use strict';
  const SV = () => S.SERVICES;
  const NODE = S.NODE = { w: 104, h: 92, icon: 52 };
  const REGIONS = S.REGIONS = { primary: 'us-east-1 (N. Virginia)', secondary: 'us-west-2 (Oregon)', third: 'eu-west-1 (Ireland)' };
  const CAN_VPC = new Set(['lambda', 'opensearch', 'batch', 'sagemaker', 'glue', 'codebuild', 'workspaces', 'apprunner']);

  // ---------- defaults ----------
  S.defaultProps = function (svcId) {
    const sv = SV()[svcId];
    const p = {};
    if (!sv) return p;
    if (sv.ha === 'azs') p.azs = sv.id === 'alb' || sv.id === 'nlb' ? 2 : 1;
    if (svcId === 's3') p.access = 'private';
    if (svcId === 'lambda') p.functionUrl = false;
    if (svcId === 'rds' || svcId === 'aurora') p.crossRegion = false;
    if (svcId === 'dynamodb') p.globalTables = false;
    if (svcId === 'ecs') p.launch = 'fargate';
    if (svcId === 's3') p.replication = false;
    if (sv.group && svcId === 'vpc') p.region = 'primary';
    if (!sv.global && !sv.group && !sv.vpc) p.region = 'primary';
    if (svcId === 'vpc') p.cidr = '10.0.0.0/16';
    if (svcId === 'pubsubnet' || svcId === 'privsubnet') p.cidr = '';
    if (svcId === 'onprem') p.cidr = '192.168.0.0/16';
    if (svcId === 'gwendpoint') p.service = 's3';
    if (svcId === 'ifendpoint') p.service = '';
    if (svcId === 'apigw') p.vpcLink = false;
    if (svcId === 'tgw') p.region = 'primary';
    return p;
  };

  // ---------- IP ranges ----------
  function parseCidr(str) {
    const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\/(\d{1,2})$/.exec(String(str || '').trim());
    if (!m) return null;
    const o = m.slice(1, 5).map(Number);
    const p = +m[5];
    if (o.some((x) => x > 255) || p > 32) return null;
    const ip = o[0] * 16777216 + o[1] * 65536 + o[2] * 256 + o[3];
    const size = Math.pow(2, 32 - p);
    const base = ip - (ip % size);
    const priv = (o[0] === 10) || (o[0] === 172 && o[1] >= 16 && o[1] <= 31) || (o[0] === 192 && o[1] === 168);
    return { ip, p, size, base, aligned: ip === base, fixed: ipStr(base) + '/' + p, private: priv };
  }
  function ipStr(n) { return [Math.floor(n / 16777216) % 256, Math.floor(n / 65536) % 256, Math.floor(n / 256) % 256, n % 256].join('.'); }
  function cidrOverlap(a, b) { return a.base < b.base + b.size && b.base < a.base + a.size; }
  function cidrInside(a, outer) { return a.base >= outer.base && a.base + a.size <= outer.base + outer.size; }
  S.parseCidr = parseCidr;
  // Subnets with an empty CIDR get the next free block inside their VPC (like the console suggests).
  S.assignCidrs = function (nodes, place) {
    const out = {};
    nodes.filter((n) => n.svc === 'vpc').forEach((v) => { const c = v.props.cidr || '10.0.0.0/16'; out[v.id] = { cidr: c, parsed: parseCidr(c), auto: false }; });
    const subnets = nodes.filter((n) => n.svc === 'pubsubnet' || n.svc === 'privsubnet').sort((a, b) => a.y - b.y || a.x - b.x);
    subnets.forEach((sn) => { if (sn.props.cidr) out[sn.id] = { cidr: sn.props.cidr, parsed: parseCidr(sn.props.cidr), auto: false }; });
    subnets.forEach((sn) => {
      if (sn.props.cidr) return;
      const vid = place[sn.id] && place[sn.id].vpc;
      const vp = vid && out[vid] && out[vid].parsed;
      if (!vp) { out[sn.id] = { cidr: '', parsed: null, auto: true, noVpc: !vid }; return; }
      const sp = Math.min(28, Math.max(vp.p + 1, 24));
      const size = Math.pow(2, 32 - sp);
      const taken = subnets.filter((o) => o !== sn && out[o.id] && out[o.id].parsed && place[o.id] && place[o.id].vpc === vid).map((o) => out[o.id].parsed);
      for (let i = 0; i * size < vp.size; i++) {
        const cand = { base: vp.base + i * size, size };
        if (!taken.some((t) => cidrOverlap(t, cand))) { const c = ipStr(cand.base) + '/' + sp; out[sn.id] = { cidr: c, parsed: parseCidr(c), auto: true }; return; }
      }
      out[sn.id] = { cidr: '', parsed: null, auto: true };
    });
    return out;
  };

  // ---------- egress helpers (shared with the question generator) ----------
  // Does this kind of service make its own network calls from inside a subnet?
  S.callsOut = (a) => a.tags.some((t) => ['vm', 'container', 'function', 'desktop', 'etl', 'bigdata'].includes(t));
  // Targets that don't need a route out of the VPC (global, attached, or called by AWS on your behalf).
  S.egressExempt = (b) => b.global || b.group || b.place || (b.cat === 'clients' && b.id !== 'external') ||
    b.tags.some((t) => ['attach', 'finding', 'trail', 'org', 'hybridlink', 'cgw', 'dxgw'].includes(t)) || ['iam', 'cloudmap', 'identitycenter', 'directory'].includes(b.id);
  // What a private subnet needs (besides a NAT gateway) to call this service.
  S.endpointsFor = (svcId) => {
    if (svcId === 'external') return null;
    if (svcId === 's3' || svcId === 'dynamodb') return [['gwendpoint', svcId]];
    if (svcId === 'ecr') return [['ifendpoint', 'ecr'], ['gwendpoint', 's3']];
    return [['ifendpoint', svcId]];
  };

  // ---------- tag helpers ----------
  function tagsOf(sv) { return sv.tags; }
  function matchTarget(target, sel) {
    // sel: tag | '#id' | '*aws'
    if (sel === '*aws') return target.cat !== 'clients' && !target.group;
    if (sel[0] === '#') return target.id === sel.slice(1);
    if (sel === target.id) return true;
    return target.tags.includes(sel);
  }
  function forwardAllowed(a, b) {
    const sels = [];
    a.tags.forEach((t) => { (S.TAG_TO[t] || []).forEach((x) => sels.push(x)); });
    (S.ID_TO[a.id] || []).forEach((x) => sels.push(x));
    if (sels.some((x) => matchTarget(b, x))) return true;
    if (b.anyIn && a.cat !== 'clients' && !a.group) return true;
    return false;
  }
  function bidirAllowed(a, b) {
    return S.BIDIR.some(([x, y]) =>
      (matchTarget(a, x) && matchTarget(b, y)) || (matchTarget(a, y) && matchTarget(b, x)));
  }
  S.bidirAllowed = bidirAllowed;

  // Static (catalog-level) check, ignoring configuration.
  function staticAllowed(a, b) {
    if (a.id === b.id && ['users', 'mobile', 'devices', 'onprem', 'external', 'developer'].includes(a.id)) return false;
    if (a.group || b.group) {
      if (b.id === 'vpc' && (a.tags.includes('hub') || a.tags.includes('hybridlink'))) return true;
      if (a.id === 'vpc' && (b.tags.includes('hub'))) return true;
      return false;
    }
    if (a.cat === 'clients') return clientAllowed(a, b);
    if (b.cat === 'clients') {
      if (b.tags.includes('human')) return a.tags.some((t) => ['pubsub', 'email', 'notify', 'contact'].includes(t)) ;
      if (b.id === 'devices') return a.id === 'iotcore';
      if (b.id === 'external') return forwardAllowed(a, b);
      if (b.id === 'onprem') return a.tags.includes('hybridlink') || a.tags.includes('netplace');
      return false;
    }
    return forwardAllowed(a, b) || bidirAllowed(a, b);
  }
  function clientAllowed(a, b) {
    if (a.id === 'devices') return ['iotcore', 'greengrass', 'kvs', 'sitewise'].includes(b.id);
    if (a.id === 'developer') return b.tags.some((t) => ['cicd', 'iac', 'support', 'hybridlink', 'desktop'].includes(t)) || b.id === 's3' || b.cat === 'devtools';
    if (a.id === 'onprem') {
      if (b.tags.includes('hybridlink') || b.tags.includes('migrate') || b.id === 'transfer') return true;
      return !b.place && !b.tags.includes('attach'); // anything else: decided by config check (VPC or not)
    }
    if (a.id === 'external') return !!b.pub || b.id === 'eventbridge' || b.id === 'appflow';
    // human users / mobile
    if (b.pub) return true;
    if (b.id === 'lambda') return true; // decided by Function URL setting
    if (b.id === 'clientvpn' || b.id === 'connect' || b.id === 'workspaces') return true;
    return false;
  }

  // ---------- reasons for invalid edges ----------
  const R_DB_PUBLIC = 'Databases are never exposed to end users. Users talk to an application tier (API Gateway + Lambda, or a load balancer + servers), and that tier queries the database with its own credentials.';
  const REASONS = [
    [['human', 'device', 'external'], ['sql', 'nosql', 'cache', 'dbproxy', 'warehouse'], R_DB_PUBLIC],
    [['human'], ['queue', 'stream', 'pubsub', 'bus', 'workflow', 'delivery', 'pipes'], 'Clients don\'t write straight into internal queues, streams or event buses. Put API Gateway in front: it can send requests directly to SQS, Kinesis, Firehose, EventBridge or Step Functions, with auth and throttling.'],
    [['human'], ['asg'], 'An Auto Scaling group has many changing instances, so users need one stable address in front of it. Put an Application Load Balancer in a public subnet in front.'],
    [['human'], ['container'], 'Containers on ECS/EKS/Fargate don\'t get a stable public address. Route users through an Application Load Balancer in a public subnet.'],
    [['human'], ['file', 'block'], 'File systems and disks are mounted by servers, not opened by users over the internet.'],
    [['human'], ['ml', 'genai'], 'Call AI services from your backend (Lambda or containers) so credentials stay server-side and you can validate input and limit cost.'],
    [['human'], ['etl', 'query', 'catalog', 'streamproc', 'mediajob'], 'This is a back-office service. Users reach your app through an entry point (CloudFront, a load balancer or API Gateway); the app calls this service.'],
    [['device'], ['*'], 'IoT devices should connect through AWS IoT Core (MQTT with X.509 certificates) or Greengrass, not straight to backend services.'],
    [['edge'], ['sql', 'nosql', 'cache', 'queue', 'stream', 'pubsub', 'file', 'warehouse'], 'CloudFront only fetches from HTTP origins: S3, a load balancer, API Gateway, a Lambda function URL or another web server. Databases and queues aren\'t HTTP origins.'],
    [['edge'], ['edge'], 'One CloudFront distribution can have many origins and behaviors. You don\'t chain distributions.'],
    [['dns'], ['sql', 'nosql', 'cache', 'warehouse'], 'Route 53 points your domain at an entry point (CloudFront, a load balancer, API Gateway). A database should never be a public DNS target.'],
    [['dns'], ['function'], 'Route 53 can\'t alias to a Lambda function. Point it at API Gateway, or at CloudFront in front of a function URL.'],
    [['dns'], ['container', 'asg'], 'Point Route 53 at the load balancer in front of your containers or Auto Scaling group.'],
    [['dns'], ['queue', 'pubsub', 'stream', 'bus', 'workflow'], 'DNS only resolves names to addresses of web-facing endpoints. Messaging services aren\'t DNS targets.'],
    [['lb'], ['sql', 'nosql', 'cache', 'object', 'file', 'queue', 'warehouse'], 'Load balancers distribute HTTP/TCP traffic to compute targets: EC2 instances, ECS tasks, IP addresses or Lambda. They can\'t target databases, S3 or queues.'],
    [['api'], ['sql', 'cache', 'dbproxy', 'file', 'warehouse'], 'API Gateway can\'t open database connections. Put a Lambda function (ideally with RDS Proxy) between them.'],
    [['accel'], ['*'], 'Global Accelerator endpoints are load balancers, EC2 instances or Elastic IPs.'],
    [['object'], ['vm', 'container'], 'S3 doesn\'t push data to servers. Send the S3 event to SQS (servers poll the queue) or EventBridge, or have the servers read from S3.'],
    [['object'], ['sql', 'nosql', 'search', 'warehouse', 'cache'], 'S3 can\'t write into a database by itself. Trigger a Lambda function from the upload event, or load the data with Glue / DMS / Firehose.'],
    [['object'], ['ml', 'genai', 'mediajob'], 'S3 doesn\'t call other services except to send event notifications (to Lambda, SQS, SNS or EventBridge). Trigger a Lambda function or Step Functions workflow that calls this service.'],
    [['cache'], ['sql', 'nosql'], 'ElastiCache doesn\'t fetch from the database. Your app checks the cache first and, on a miss, reads the database and writes the result to the cache (lazy loading). Connect BOTH the cache and the database from your compute tier. (DAX is the exception: it sits in front of DynamoDB.)'],
    [['sql', 'nosql', 'cache', 'search', 'file', 'warehouse'], ['*'], 'Data stores answer queries; they don\'t call other services. Draw the arrow from the service that reads or writes the data (for example Lambda → DynamoDB).'],
    [['queue'], ['sql', 'nosql', 'object', 'search', 'pubsub', 'workflow'], 'SQS holds messages until a consumer reads them. Add a Lambda function or workers that poll the queue and do the work.'],
    [['stream'], ['object', 'warehouse', 'search'], 'Kinesis Data Streams doesn\'t write to storage by itself. Put Amazon Data Firehose between them, or a Lambda consumer.'],
    [['stream'], ['sql', 'nosql'], 'A stream needs a consumer: Lambda, Managed Flink or Firehose reads the records and writes them to the database.'],
    [['pubsub'], ['sql', 'nosql', 'object', 'search', 'vm', 'container'], 'SNS delivers only to SQS, Lambda, Firehose, HTTP/S endpoints, email, SMS and mobile push. For servers, subscribe an SQS queue and let them poll it.'],
    [['dbproxy'], ['*'], 'RDS Proxy only pools connections to RDS and Aurora (MySQL / PostgreSQL).'],
    [['function'], ['block'], 'EBS volumes attach only to EC2 instances. Lambda can use its /tmp storage, S3, or mount EFS.'],
    [['attach'], ['*'], 'WAF, Shield and ACM certificates attach to CloudFront, load balancers, API Gateway, AppSync, Cognito or Global Accelerator. They can\'t attach to servers or databases.'],
    [['archive'], ['*'], 'Archived objects are restored back into S3; S3 Glacier doesn\'t send data anywhere itself.'],
    [['*'], ['archive'], 'S3 Glacier is a storage class. Objects get there through an S3 lifecycle rule: connect S3 → S3 Glacier. (AWS Backup and Storage Gateway can also store there.)'],
    [['*'], ['block'], 'An EBS volume is a disk attached to a single EC2 instance.'],
    [['*'], ['human'], 'Only notification services (SNS, SES, End User Messaging, Connect) send to people directly. Everything else responds to requests users make.'],
    [['*'], ['vpcbox'], 'A VPC is a network boundary, not a service you send requests to. Place resources inside its subnets instead. Only Transit Gateway, VPC peering, VPN and Direct Connect attach to a VPC.'],
    [['vpcbox', 'subnetbox'], ['*'], 'VPCs and subnets are boxes that resources sit inside. Draw arrows between the resources themselves.'],
    [['*'], ['subnetbox'], 'Subnets are boxes that resources sit inside. Drag the resource into the subnet instead of drawing an arrow to it.'],
    [['*'], ['device'], 'Only IoT Core sends messages to devices (MQTT topics, device shadows, jobs).'],
    [['*'], ['dev', 'onprem'], 'AWS services don\'t push into this. Reverse the arrow, or connect through VPN / Direct Connect.'],
    [['*'], ['catalog'], 'The Glue Data Catalog is read by query engines (Athena, Redshift Spectrum, EMR). Connect them to Glue.'],
  ];
  function selHit(sv, list) {
    return list.some((t) => t === '*' || t === sv.id || sv.tags.includes(t) || (t === 'asg' && sv.id === 'asg'));
  }
  function reasonFor(a, b) {
    for (const [from, to, msg] of REASONS) {
      if (selHit(a, from) && selHit(b, to)) return msg;
    }
    return a.name + ' can\'t send requests or data to ' + b.name + ' directly.';
  }

  const BRIDGES = ['apigw', 'lambda', 'alb', 'cloudfront', 'sqs', 'sns', 'firehose', 'eventbridge', 'ecs', 'rdsproxy',
    'iotcore', 'vpn', 's3', 'glue', 'athena', 'stepfunctions', 'kinesis'];
  function bridgeFix(a, b) {
    const out = [];
    for (const id of BRIDGES) {
      const c = SV()[id];
      if (!c || id === a.id || id === b.id) continue;
      if (staticAllowed(a, c) && staticAllowed(c, b)) out.push(c.name);
      if (out.length >= 2) break;
    }
    if (!out.length) return '';
    return 'Try ' + a.short + ' → ' + out[0] + ' → ' + b.short + (out[1] ? ' (or via ' + out[1] + ')' : '') + '.';
  }

  S.typicalTargets = function (svcId, max) {
    const a = SV()[svcId];
    const res = [];
    for (const b of S.SERVICE_LIST) {
      if (b.id === a.id || b.group || b.anyIn) continue;
      if (staticAllowed(a, b)) res.push(b.short);
    }
    return res.slice(0, max || 12);
  };

  // ---------- geometry / placement ----------
  function groupRect(n) { return { x: n.x, y: n.y, w: n.w || 300, h: n.h || 200 }; }
  function inRect(px, py, r, pad) { pad = pad || 0; return px >= r.x - pad && px <= r.x + r.w + pad && py >= r.y - pad && py <= r.y + r.h + pad; }
  function nodeCenter(n) {
    const sv = SV()[n.svc];
    if (sv && sv.group) { const r = groupRect(n); return [r.x + r.w / 2, r.y + r.h / 2]; }
    return [n.x + NODE.w / 2, n.y + NODE.icon / 2 + 6];
  }
  S.nodeCenter = nodeCenter;

  // Custom icon for the Availability Zone box (AWS draws AZs as a dashed outline).
  S.ICONS = S.ICONS || {};
  S.ICONS['x:az'] = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect width="40" height="40" fill="#147eba"/><rect x="7" y="9" width="26" height="22" rx="2" fill="none" stroke="#fff" stroke-width="2" stroke-dasharray="4 3"/><text x="20" y="24.5" fill="#fff" font-family="Arial,sans-serif" font-size="11" font-weight="700" text-anchor="middle">AZ</text></svg>';

  function computePlacement(nodes) {
    const groups = nodes.filter((n) => SV()[n.svc] && SV()[n.svc].group);
    const vpcs = groups.filter((g) => g.svc === 'vpc');
    const subnets = groups.filter((g) => g.svc === 'pubsubnet' || g.svc === 'privsubnet');
    const regionBoxes = groups.filter((g) => g.svc === 'region');
    const azBoxes = groups.filter((g) => g.svc === 'az');
    const area = (g) => (g.w || 300) * (g.h || 200);
    const place = {};
    function smallestContaining(list, x, y, pad) {
      let best = null;
      list.forEach((g) => { if (inRect(x, y, groupRect(g), pad) && (!best || area(g) < area(best))) best = g; });
      return best;
    }
    const regionAt = (x, y) => { const r = smallestContaining(regionBoxes, x, y, 0); return r ? (r.props.region || 'primary') : null; };
    const azAt = (x, y) => { const a = smallestContaining(azBoxes, x, y, 0); return a ? a.id : null; };
    regionBoxes.forEach((r) => { place[r.id] = { vpc: null, subnet: null, region: r.props.region || 'primary' }; });
    vpcs.forEach((v) => { const [cx, cy] = nodeCenter(v); place[v.id] = { vpc: v.id, subnet: null, region: regionAt(cx, cy) || v.props.region || 'primary' }; });
    azBoxes.forEach((a) => {
      const [cx, cy] = nodeCenter(a);
      const v = smallestContaining(vpcs, cx, cy, 0);
      place[a.id] = { vpc: v ? v.id : null, subnet: null, region: v ? place[v.id].region : (regionAt(cx, cy) || 'primary') };
    });
    subnets.forEach((sn) => {
      const [cx, cy] = nodeCenter(sn);
      const v = smallestContaining(vpcs, cx, cy, 0);
      place[sn.id] = { vpc: v ? v.id : null, subnet: null, az: azAt(cx, cy), region: v ? place[v.id].region : (regionAt(cx, cy) || 'primary') };
    });
    nodes.forEach((n) => {
      const sv = SV()[n.svc];
      if (!sv || sv.group) return;
      const [cx, cy] = nodeCenter(n);
      const sn = smallestContaining(subnets, cx, cy, 0);
      let v = sn ? (place[sn.id].vpc && vpcs.find((x) => x.id === place[sn.id].vpc)) : null;
      if (!v) v = smallestContaining(vpcs, cx, cy, n.svc === 'igw' || n.svc === 'vgw' ? 50 : 0);
      let subnetType = sn ? SV()[sn.svc].subnet : null;
      let spanAzs = null, spanSubnetIds = null;
      if (!sn && v && sv.vpc) {
        // drawn across subnets (typical for a load balancer spanning two AZs)
        const box = { x: n.x - 34, y: n.y - 10, w: NODE.w + 68, h: NODE.icon + 20 };
        const hits = subnets.filter((g) => place[g.id].vpc === v.id && g.x < box.x + box.w && g.x + g.w > box.x && g.y < box.y + box.h && g.y + g.h > box.y);
        if (hits.length) {
          subnetType = hits.every((g) => g.svc === 'pubsubnet') ? 'public' : hits.every((g) => g.svc === 'privsubnet') ? 'private' : SV()[hits[0].svc].subnet;
          spanAzs = new Set(hits.map((g) => place[g.id].az || g.id)).size;
          spanSubnetIds = hits.map((g) => g.id);
        }
      }
      const region = sv.global ? 'global' : v ? place[v.id].region : (regionAt(cx, cy) || n.props.region || 'primary');
      const az = azAt(cx, cy) || (sn ? place[sn.id].az : null);
      place[n.id] = { vpc: v ? v.id : null, subnet: subnetType, subnetId: sn ? sn.id : null, region, az, spanAzs, spanSubnetIds, regionFromBox: !sv.global && !v && !!regionAt(cx, cy) };
    });
    return place;
  }
  S.computePlacement = computePlacement;

  // When services are drawn inside AZ boxes, the AZ count comes from the drawing:
  // the number of different AZ boxes that hold the same kind of service in the same VPC.
  S.effectiveAzs = function (nodes, place) {
    const out = {};
    nodes.forEach((n) => {
      const s = SV()[n.svc];
      if (!s || s.group || s.ha !== 'azs') return;
      const p = place[n.id];
      if (p && p.spanAzs) { out[n.id] = Math.min(3, p.spanAzs); return; }
      if (!p || !p.az) return;
      const zones = new Set();
      nodes.forEach((m) => { const q = place[m.id]; if (m.svc === n.svc && q && q.az && q.vpc === p.vpc && q.region === p.region) zones.add(q.az); });
      out[n.id] = Math.min(3, zones.size);
    });
    return out;
  };

  // ---------- main evaluation ----------
  S.evaluate = function (graph, opts) {
    opts = opts || {};
    const strict = !!opts.strict;
    const rawNodes = graph.nodes.filter((n) => SV()[n.svc]);
    const place = computePlacement(rawNodes);
    const azFromBoxes = S.effectiveAzs(rawNodes, place);
    const nodes = rawNodes.map((n) => (azFromBoxes[n.id] ? Object.assign({}, n, { props: Object.assign({}, n.props, { azs: azFromBoxes[n.id] }) }) : n));
    const byId = {}; nodes.forEach((n) => { byId[n.id] = n; });
    const edges = graph.edges.filter((e) => byId[e.from] && byId[e.to]);
    const sv = (n) => SV()[n.svc];
    // Beginner mode: anything that needs a network but isn't in a VPC box runs in
    // AWS's default VPC, whose subnets are public. No VPC boxes needed.
    if (opts.simple) {
      nodes.forEach((n) => {
        const s = sv(n);
        if (s.vpc && !s.group && !place[n.id].vpc) place[n.id] = { vpc: '__default', subnet: 'public', subnetId: null, region: n.props.region || 'primary', defaultVpc: true };
      });
    }
    const name = (n) => (n.props && n.props.label) || sv(n).short;
    const issues = [];
    const suggestions = [];
    const edgeRes = {};
    const has = (id) => nodes.some((n) => n.svc === id);

    function issue(level, title, detail, fix, nodeIds, edgeIds) {
      issues.push({ level, title, detail, fix: fix || '', nodeIds: nodeIds || [], edgeIds: edgeIds || [] });
    }

    const isInVpc = (n) => !!place[n.id].vpc && (sv(n).vpc || CAN_VPC.has(n.svc) || sv(n).place) && !sv(n).group;
    // Lambda in a VPC never gets a public IP, so it is private even in a public subnet.
    const isPrivate = (n) => isInVpc(n) && !sv(n).place && (place[n.id].subnet !== 'public' || n.svc === 'lambda');
    const isPublicSubnet = (n) => isInVpc(n) && place[n.id].subnet === 'public';

    // --- edges ---
    edges.forEach((e) => {
      const A = byId[e.from], B = byId[e.to];
      const a = sv(A), b = sv(B);
      let ok = true, reason = '', fix = '';
      if (A.id === B.id) { ok = false; reason = 'A service can\'t connect to itself.'; }
      else if (!staticAllowed(a, b)) {
        ok = false; reason = reasonFor(a, b); fix = bridgeFix(a, b);
      } else {
        // configuration-dependent checks
        const fromInternet = a.tags.includes('human') || a.id === 'external' || a.tags.includes('dns');
        if (fromInternet && b.vpc && !b.place) {
          if (place[B.id].vpc && place[B.id].subnet !== 'public') {
            ok = false;
            reason = name(B) + ' is in a private subnet, so nothing on the internet can reach it' + (a.id === 'route53' ? ' (Route 53 would resolve to a private address).' : '.');
            fix = b.tags.includes('lb') ? 'Move the load balancer into a public subnet (internet-facing).' : 'Put an internet-facing load balancer in a public subnet in front of it, and keep ' + name(B) + ' private.';
          } else if (!place[B.id].vpc) {
            ok = false; reason = name(B) + ' isn\'t inside a VPC subnet yet, so it has no network address.'; fix = 'Drag it into a public subnet inside a VPC.';
          } else if (b.tags.includes('container') || b.id === 'asg') {
            ok = false; reason = reasonFor({ id: 'users', tags: ['human'] }, b) || ''; fix = 'Users → Application Load Balancer → ' + name(B) + '.';
            if (b.id === 'asg') reason = 'An Auto Scaling group has many changing instances; users need one stable address. Put an Application Load Balancer in front.';
          }
        }
        if (ok && (a.tags.includes('human') || a.id === 'external') && B.svc === 'lambda' && !B.props.functionUrl) {
          ok = false; reason = 'A Lambda function has no public address by default.';
          fix = 'Put API Gateway (or an ALB) in front of it, or turn on "Function URL" for this Lambda in the inspector.';
        }
        if (ok && (a.tags.includes('human') || a.id === 'external') && B.svc === 's3' && B.props.access === 'private') {
          ok = false; reason = 'This bucket blocks public access (the default), so users can\'t read from or upload to it directly.';
          fix = 'Serve it through CloudFront (with Origin Access Control), or set the bucket to "Presigned URL uploads" or "Static website" in the inspector.';
        }
        if (ok && a.id === 'route53' && B.svc === 's3' && B.props.access !== 'website') {
          ok = false; reason = 'Route 53 can only alias a domain to an S3 bucket configured as a static website endpoint (HTTP only, no HTTPS).';
          fix = 'Put CloudFront between Route 53 and S3 to get HTTPS and caching, or set the bucket to "Static website".';
        }
        if (ok && a.id === 'onprem' && b.vpc && !b.place) {
          ok = false; reason = 'Your data center can\'t reach private VPC resources over the public internet.';
          fix = 'Add a Site-to-Site VPN or Direct Connect: Data center → VPN → ' + name(B) + '.';
        }
        if (ok && A.svc === 'apigw' && (b.tags.includes('lb') || b.tags.includes('vm') || b.tags.includes('container')) && b.vpc && isPrivate(B) && !A.props.vpcLink) {
          ok = false; reason = name(B) + ' is in a private subnet. API Gateway runs outside your VPC and reaches private targets only through a VPC Link.';
          fix = 'Turn on "VPC Link" for API Gateway in the inspector (it then reaches a private NLB/ALB), or make the load balancer internet-facing.';
        }
        if (ok && A.svc === 'acm') {
          const ra = A.props.region || 'primary';
          if (B.svc === 'cloudfront' && ra !== 'primary') { ok = false; reason = 'CloudFront only uses ACM certificates from us-east-1 (N. Virginia). This certificate is in ' + REGIONS[ra].split(' ')[0] + '.'; fix = 'Set the certificate\'s region to us-east-1 in the inspector.'; }
          else if (B.svc !== 'cloudfront' && !SV()[B.svc].global && place[B.id] && place[B.id].region !== ra) { ok = false; reason = 'A certificate for ' + name(B) + ' must be in the same region (' + REGIONS[place[B.id].region].split(' ')[0] + '). This one is in ' + REGIONS[ra].split(' ')[0] + '.'; fix = 'Request the certificate in ' + REGIONS[place[B.id].region].split(' ')[0] + '.'; }
        }
        if (ok && A.svc === 'lambda' && !isInVpc(A) && b.vpc && !b.place && isPrivate(B)) {
          ok = false; reason = 'This Lambda function runs outside your VPC, so it can\'t reach ' + name(B) + ' in a private subnet.';
          fix = 'Drag the Lambda function into a private subnet (this attaches it to the VPC).';
        }
        if (ok && b.id === 'nat' && !(isInVpc(A))) {
          ok = false; reason = 'Only resources inside the VPC use a NAT gateway.'; fix = '';
        }
      }
      edgeRes[e.id] = { ok, reason, fix };
      if (!ok) issue('error', name(A) + ' → ' + name(B) + ' won\'t work', reason, fix, [A.id, B.id], [e.id]);
    });
    let okEdges = edges.filter((e) => edgeRes[e.id].ok);

    // --- empty / no entry ---
    const real = nodes.filter((n) => !sv(n).group);
    if (!real.length) issue('error', 'The canvas is empty', 'Drag services from the left panel onto the canvas, then drag from a service\'s blue dot to another service to connect them.');

    // ======================= networking (mirrors real VPC behaviour) =======================
    const vpcs = nodes.filter((n) => n.svc === 'vpc');
    const subnetBoxes = nodes.filter((n) => n.svc === 'pubsubnet' || n.svc === 'privsubnet');
    const azBoxes = nodes.filter((n) => n.svc === 'az');
    const inV = (svc, v) => real.filter((n) => n.svc === svc && place[n.id].vpc === v);
    const vpcName = (vid) => (byId[vid] ? name(byId[vid]) : 'the default VPC');

    // --- placement ---
    const vpcNodes = real.filter((n) => sv(n).vpc && !sv(n).place);
    const notInVpc = vpcNodes.filter((n) => !place[n.id].vpc);
    if (notInVpc.length) {
      issue('error', 'Some resources aren\'t inside a VPC', notInVpc.map(name).join(', ') + ' must be launched into a subnet of a VPC.',
        has('vpc') ? 'Drag them into a subnet inside your VPC box.' : 'Click "+ Ready-made network" under Network boxes, then drag them into the right subnet.', notInVpc.map((n) => n.id));
    }
    const noSubnet = vpcNodes.filter((n) => place[n.id].vpc && !place[n.id].subnet);
    if (noSubnet.length) {
      issue('error', 'Some resources are in the VPC but not in a subnet', noSubnet.map(name).join(', ') + ' sit directly in the VPC box. AWS launches every resource into a specific subnet.',
        'Drag them into a public or private subnet box.', noSubnet.map((n) => n.id));
    }
    const misplaced = real.filter((n) => place[n.id].vpc && !sv(n).vpc && !sv(n).place && !CAN_VPC.has(n.svc));
    if (misplaced.length) {
      issue('warn', 'Regional services drawn inside the VPC', misplaced.map(name).join(', ') + ' are managed regional services. They don\'t live in your subnets; your VPC reaches them through endpoints, a NAT gateway or the internet gateway.',
        'Move them outside the VPC box.', misplaced.map((n) => n.id));
    }
    const subnetsOutside = subnetBoxes.filter((n) => !place[n.id].vpc);
    if (subnetsOutside.length) issue('error', 'Subnet outside a VPC', 'A subnet is always part of one VPC.', 'Drag the subnet box inside a VPC box.', subnetsOutside.map((n) => n.id));
    real.filter((n) => n.svc === 'gwendpoint' && !place[n.id].vpc).forEach((n) =>
      issue('error', name(n) + ' isn\'t in a VPC', 'A gateway endpoint belongs to one VPC (it is added to that VPC\'s route tables).', 'Drag it inside the VPC box.', [n.id]));
    real.filter((n) => n.svc === 'ifendpoint' && (!place[n.id].vpc || !place[n.id].subnet)).forEach((n) =>
      issue('error', name(n) + ' isn\'t in a subnet', 'An interface endpoint is a network interface with a private IP, so it is created in a subnet (usually the private ones).', 'Drag it into a private subnet.', [n.id]));
    real.filter((n) => (n.svc === 'nat') && !place[n.id].vpc).forEach((n) =>
      issue('error', name(n) + ' isn\'t in a VPC', 'A NAT gateway is created in a public subnet of a VPC.', 'Drag it into a public subnet.', [n.id]));
    real.filter((n) => (n.svc === 'igw' || n.svc === 'vgw') && !place[n.id].vpc).forEach((n) =>
      issue('error', name(n) + ' isn\'t attached to a VPC', 'An ' + sv(n).name + ' does nothing until it is attached to a VPC.', 'Drag it onto the edge of the VPC box.', [n.id]));
    vpcs.forEach((v) => {
      ['igw', 'vgw'].forEach((t) => { const list = inV(t, v.id); if (list.length > 1) issue('error', name(v) + ' has ' + list.length + ' ' + SV()[t].name + 's', 'A VPC can have only one ' + SV()[t].name + ' attached.', 'Delete the extra one.', list.map((n) => n.id)); });
    });
    real.filter((n) => n.svc === 'lambda' && isInVpc(n) && place[n.id].subnet === 'public').forEach((n) =>
      issue('warn', name(n) + ' is in a public subnet', 'Lambda functions attached to a VPC never get a public IP, so a public subnet gives them no internet access. They behave exactly like they are in a private subnet.', 'Put VPC-attached functions in private subnets and add a NAT gateway or endpoints for outbound calls.', [n.id]));

    // --- Internet Gateway ---
    vpcs.forEach((v) => {
      const needsIgw = real.some((n) => place[n.id].vpc === v.id && (isPublicSubnet(n) || n.svc === 'nat'));
      if (needsIgw && !inV('igw', v.id).length) {
        issue('error', 'No Internet Gateway on ' + name(v), 'The public subnets of ' + name(v) + ' have no route to the internet without an Internet Gateway attached to the VPC. Internet-facing load balancers, public instances and NAT gateways won\'t work.',
          'Drag an Internet Gateway onto the edge of the VPC box.', [v.id]);
      }
    });

    // ALB in at least 2 AZs
    real.filter((n) => n.svc === 'alb' && (n.props.azs || 1) < 2).forEach((n) =>
      issue('error', name(n) + ' needs at least 2 Availability Zones', 'AWS won\'t create an Application Load Balancer unless you give it subnets in two or more AZs.', place[n.id].az ? 'Draw the load balancer across both AZ boxes (over the gap between the two public subnets), or move it out of the AZ box and set Availability Zones to 2.' : 'Set Availability Zones to 2 or 3 in the inspector.', [n.id]));
    // NAT must be in a public subnet
    real.filter((n) => n.svc === 'nat' && place[n.id].vpc && place[n.id].subnet && place[n.id].subnet !== 'public').forEach((n) =>
      issue('error', 'NAT gateway in a private subnet', 'A NAT gateway forwards traffic to the Internet Gateway, so it must sit in a public subnet. In a private subnet it has no way out.', 'Drag it into a public subnet.', [n.id]));

    // --- Availability Zones ---
    subnetBoxes.forEach((sn) => {
      const hits = azBoxes.filter((a) => sn.x < a.x + a.w && sn.x + sn.w > a.x && sn.y < a.y + a.h && sn.y + sn.h > a.y);
      if (hits.length > 1) issue('error', name(sn) + ' spans two Availability Zones', 'In AWS a subnet lives in exactly one AZ. To use two AZs, create one subnet in each.', 'Resize the subnet so it sits inside a single AZ box.', [sn.id]);
      const v = place[sn.id].vpc;
      if (v && !hits.length && azBoxes.some((a) => place[a.id].vpc === v)) issue('error', name(sn) + ' isn\'t in an Availability Zone', 'This VPC uses AZ boxes, and every subnet must be created in one AZ.', 'Drag the subnet into an AZ box.', [sn.id]);
    });
    real.filter((n) => ['rds', 'aurora', 'documentdb', 'neptune'].includes(n.svc) && place[n.id].vpc && place[n.id].vpc !== '__default').forEach((n) => {
      const v = place[n.id].vpc;
      if (!azBoxes.some((a) => place[a.id].vpc === v)) return;
      const zones = new Set(subnetBoxes.filter((sn) => place[sn.id].vpc === v && place[sn.id].az && SV()[sn.svc].subnet === place[n.id].subnet).map((sn) => place[sn.id].az));
      if (zones.size < 2) issue('error', name(n) + ': DB subnet group needs 2 AZs', 'AWS requires a database subnet group with subnets in at least two Availability Zones, even for a Single-AZ database.', 'Add a ' + (place[n.id].subnet || 'private') + ' subnet in a second AZ box.', [n.id]);
    });

    // --- IP ranges (CIDR) ---
    const cidrs = S.assignCidrs(nodes, place);
    const P = (id) => cidrs[id] && cidrs[id].parsed;
    vpcs.forEach((v) => {
      const c = cidrs[v.id];
      if (!c.parsed) { issue('error', name(v) + ': "' + c.cidr + '" isn\'t a valid IP range', 'Write the VPC range as an IPv4 CIDR block, for example 10.0.0.0/16.', 'Fix it in the inspector.', [v.id]); return; }
      if (!c.parsed.aligned) issue('error', name(v) + ': ' + c.cidr + ' isn\'t a network address', 'The host bits must be zero.', 'Use ' + c.parsed.fixed + '.', [v.id]);
      if (c.parsed.p < 16 || c.parsed.p > 28) issue('error', name(v) + ': /' + c.parsed.p + ' isn\'t allowed', 'A VPC\'s IPv4 block must be between /16 (65,536 addresses) and /28 (16 addresses).', 'Use a size between /16 and /28.', [v.id]);
      if (!c.parsed.private) issue('warn', name(v) + ' uses public IP space', c.cidr + ' is not a private (RFC 1918) range. AWS allows it, but it will clash with real internet addresses.', 'Use 10.0.0.0/8, 172.16.0.0/12 or 192.168.0.0/16.', [v.id]);
    });
    subnetBoxes.forEach((sn) => {
      const c = cidrs[sn.id];
      if (!c || !place[sn.id].vpc) return;
      const vp = P(place[sn.id].vpc);
      if (!c.parsed) { issue('error', name(sn) + ': ' + (c.cidr ? '"' + c.cidr + '" isn\'t a valid IP range' : 'no room for this subnet'), c.cidr ? 'Write it as an IPv4 CIDR block, for example 10.0.1.0/24.' : 'The VPC\'s IP range is already used up by the other subnets.', c.cidr ? 'Fix it in the inspector.' : 'Make the VPC range bigger or the subnets smaller.', [sn.id]); return; }
      if (!c.parsed.aligned) issue('error', name(sn) + ': ' + c.cidr + ' isn\'t a network address', 'The host bits must be zero.', 'Use ' + c.parsed.fixed + '.', [sn.id]);
      if (c.parsed.p < 16 || c.parsed.p > 28) issue('error', name(sn) + ': /' + c.parsed.p + ' isn\'t allowed', 'A subnet must be between /16 and /28.', '', [sn.id]);
      if (vp && !cidrInside(c.parsed, vp)) issue('error', name(sn) + ' is outside the VPC\'s range', c.cidr + ' isn\'t inside ' + cidrs[place[sn.id].vpc].cidr + '. A subnet\'s range must be part of its VPC\'s range.', 'Pick a range inside ' + cidrs[place[sn.id].vpc].cidr + '.', [sn.id]);
    });
    for (let i = 0; i < subnetBoxes.length; i++) for (let j = i + 1; j < subnetBoxes.length; j++) {
      const a = subnetBoxes[i], b = subnetBoxes[j];
      if (place[a.id].vpc !== place[b.id].vpc || !place[a.id].vpc || !P(a.id) || !P(b.id)) continue;
      if (cidrOverlap(P(a.id), P(b.id))) issue('error', name(a) + ' and ' + name(b) + ' overlap', cidrs[a.id].cidr + ' and ' + cidrs[b.id].cidr + ' share addresses. Subnets in a VPC can\'t overlap.', 'Give each subnet its own range.', [a.id, b.id]);
    }
    // capacity: AWS reserves 5 addresses in every subnet
    const IP_USE = { ec2: 1, asg: 4, nat: 1, alb: 8, nlb: 1, gwlb: 1, ifendpoint: 1, rds: 1, aurora: 1, documentdb: 1, neptune: 1, elasticache: 1, memorydb: 1, dax: 1, efs: 1, fsx: 1,
      ecs: 4, fargate: 2, eks: 16, lambda: 1, msk: 1, mq: 1, redshift: 1, emr: 4, rdsproxy: 1, opensearch: 1, workspaces: 1, batch: 4, sagemaker: 1, glue: 2, codebuild: 1 };
    subnetBoxes.forEach((sn) => {
      const c = P(sn.id); if (!c) return;
      const users = real.filter((n) => place[n.id].subnetId === sn.id || (place[n.id].spanSubnetIds || []).includes(sn.id));
      const need = users.reduce((t, n) => t + (IP_USE[n.svc] || 0), 0);
      const usable = c.size - 5;
      if (need > usable) issue('error', name(sn) + ' is too small', cidrs[sn.id].cidr + ' has ' + usable + ' usable addresses (AWS reserves 5), but the resources in it need about ' + need + '.', 'Use a bigger subnet, for example a /24 (251 usable).', [sn.id]);
      if (users.some((n) => n.svc === 'alb') && c.p > 27) issue('error', name(sn) + ' is too small for a load balancer', 'An Application Load Balancer needs subnets of at least /27 with 8 free addresses.', 'Use /27 or larger.', [sn.id]);
    });

    // --- Transit Gateway / peering attachments (arrows to VPC boxes) ---
    const vpcLinks = (hub) => okEdges.filter((e) => (e.from === hub.id && byId[e.to].svc === 'vpc') || (e.to === hub.id && byId[e.from].svc === 'vpc')).map((e) => (e.from === hub.id ? e.to : e.from));
    const tgwAttach = {};
    real.filter((n) => n.svc === 'tgw').forEach((t) => {
      const att = [...new Set(vpcLinks(t))];
      tgwAttach[t.id] = att;
      if (!att.length) issue('error', name(t) + ' isn\'t attached to any VPC', 'A Transit Gateway only routes traffic for VPCs that have an attachment.', 'Draw an arrow from the Transit Gateway to each VPC box.', [t.id]);
      att.forEach((vid) => {
        if (place[vid].region !== (t.props.region || 'primary')) issue('error', name(t) + ' can\'t attach to ' + vpcName(vid), 'A Transit Gateway is regional: it attaches only to VPCs in its own region (' + REGIONS[t.props.region || 'primary'].split(' ')[0] + '). Other regions need their own Transit Gateway, peered with this one.', 'Add a Transit Gateway in that region.', [t.id, vid]);
      });
    });
    const peerPairs = [];
    real.filter((n) => n.svc === 'peering').forEach((pc) => {
      const att = [...new Set(vpcLinks(pc))];
      if (att.length !== 2) issue('error', name(pc) + ' must join exactly two VPCs', 'A peering connection is between two VPCs (it has ' + att.length + ' VPC arrow' + (att.length === 1 ? '' : 's') + ').', 'Draw an arrow from the peering connection to each of the two VPC boxes.', [pc.id]);
      else peerPairs.push(att);
    });
    function vpcsConnected(a, b) {
      if (peerPairs.some(([x, y]) => (x === a && y === b) || (x === b && y === a))) return true;
      return Object.values(tgwAttach).some((att) => att.includes(a) && att.includes(b));
    }
    const checkedPairs = new Set();
    function overlapCheck(a, b, why) {
      const k = [a, b].sort().join('|'); if (checkedPairs.has(k)) return; checkedPairs.add(k);
      if (P(a) && P(b) && cidrOverlap(P(a), P(b))) issue('error', vpcName(a) + ' and ' + vpcName(b) + ' have overlapping IP ranges', cidrs[a].cidr + ' and ' + cidrs[b].cidr + ' overlap. ' + why + ' can\'t route between networks with the same addresses.', 'Give one of them a different range, e.g. 10.1.0.0/16.', [a, b]);
    }
    peerPairs.forEach(([a, b]) => overlapCheck(a, b, 'VPC peering'));
    Object.values(tgwAttach).forEach((att) => att.forEach((a, i) => att.slice(i + 1).forEach((b) => overlapCheck(a, b, 'A Transit Gateway'))));

    // cross-VPC traffic
    okEdges.forEach((e) => {
      const A = byId[e.from], B = byId[e.to];
      if (sv(A).group || sv(B).group) return;
      const va = place[A.id].vpc, vb = place[B.id].vpc;
      if (!va || !vb || va === vb || !isInVpc(A) || !isInVpc(B) || va === '__default' || vb === '__default') return;
      const replication = sv(A).tags.some((t) => ['sql', 'nosql', 'cache'].includes(t)) && sv(B).tags.some((t) => ['sql', 'nosql', 'cache'].includes(t));
      if (replication) return;
      if (!vpcsConnected(va, vb)) {
        edgeRes[e.id].netWarn = true;
        issue('error', name(A) + ' and ' + name(B) + ' are in different VPCs', 'Separate VPCs are isolated networks. Nothing routes between ' + vpcName(va) + ' and ' + vpcName(vb) + '.', 'Connect them: a Transit Gateway with arrows to both VPC boxes, or a VPC peering connection with arrows to both.', [A.id, B.id], [e.id]);
      }
    });

    // --- hybrid connectivity (on-premises ↔ VPC) ---
    const hybridVpcs = new Set();
    real.filter((n) => n.svc === 'vpn').forEach((vpn) => {
      if (!okEdges.some((e) => e.to === vpn.id && byId[e.from].svc === 'cgw')) {
        issue('error', name(vpn) + ' has no Customer Gateway', 'A Site-to-Site VPN connects a Customer Gateway (your on-premises router\'s public IP) to AWS. Without it, AWS has nothing to build the tunnels to.', 'Data center → Customer Gateway → Site-to-Site VPN.', [vpn.id]);
      }
    });
    okEdges.forEach((e) => {
      const H = byId[e.from], B = byId[e.to];
      if (H.svc === 'dx' && B.svc === 'tgw') {
        edgeRes[e.id] = { ok: false, reason: 'Direct Connect can\'t attach to a Transit Gateway directly. It needs a transit virtual interface to a Direct Connect Gateway, which is associated with the Transit Gateway.', fix: 'Direct Connect → Direct Connect Gateway → Transit Gateway.' };
        issue('error', name(H) + ' → ' + name(B) + ' won\'t work', edgeRes[e.id].reason, edgeRes[e.id].fix, [H.id, B.id], [e.id]);
        return;
      }
      if (!['vpn', 'dx'].includes(H.svc)) return;
      let vid = null;
      if (B.svc === 'vpc') vid = B.id;
      else if (B.svc === 'vgw' || B.svc === 'tgw' || B.svc === 'dxgw') return;
      else if (sv(B).vpc || isInVpc(B)) vid = place[B.id].vpc;
      if (!vid || vid === '__default') return;
      const viaVgw = inV('vgw', vid).length > 0;
      const tgwsForVpc = Object.keys(tgwAttach).filter((t) => tgwAttach[t].includes(vid));
      const viaTgw = tgwsForVpc.some((t) => H.svc === 'vpn'
        ? okEdges.some((x) => x.from === H.id && x.to === t)
        : okEdges.some((x) => x.from === H.id && byId[x.to].svc === 'dxgw' && okEdges.some((y) => y.from === x.to && y.to === t)));
      if (viaVgw || viaTgw) { hybridVpcs.add(vid); return; }
      const what = H.svc === 'vpn' ? 'A Site-to-Site VPN' : 'Direct Connect (private virtual interface)';
      edgeRes[e.id] = { ok: false, reason: what + ' ends on an AWS-side gateway. ' + vpcName(vid) + ' has no Virtual Private Gateway attached, and no Transit Gateway path from this ' + (H.svc === 'vpn' ? 'VPN' : 'connection') + ' to it.', fix: 'Drag a Virtual Private Gateway onto the edge of ' + vpcName(vid) + (H.svc === 'vpn' ? ', or connect the VPN to a Transit Gateway attached to the VPC.' : ', or go Direct Connect → Direct Connect Gateway → Transit Gateway attached to the VPC.') };
      issue('error', name(H) + ' can\'t reach ' + name(B), edgeRes[e.id].reason, edgeRes[e.id].fix, [H.id, B.id], [e.id]);
    });
    real.filter((n) => n.svc === 'onprem').forEach((dc) => {
      const c = parseCidr(dc.props.cidr || '192.168.0.0/16');
      if (!c) { issue('error', name(dc) + ': "' + dc.props.cidr + '" isn\'t a valid IP range', 'Write your data center\'s network as a CIDR block, e.g. 192.168.0.0/16.', '', [dc.id]); return; }
      hybridVpcs.forEach((vid) => {
        if (P(vid) && cidrOverlap(c, P(vid))) issue('error', name(dc) + ' and ' + vpcName(vid) + ' use the same IP range', (dc.props.cidr || '192.168.0.0/16') + ' overlaps ' + cidrs[vid].cidr + '. Routes over the VPN / Direct Connect would be ambiguous, so traffic can\'t flow.', 'Change the VPC range (or the data center range) so they don\'t overlap.', [dc.id, vid]);
      });
    });

    // --- private subnets reaching things outside the VPC ---
    const callsOut = S.callsOut, exemptTarget = S.egressExempt;
    okEdges.forEach((e) => {
      const A = byId[e.from], B = byId[e.to];
      if (!isPrivate(A) || !callsOut(sv(A))) return;
      const b = sv(B);
      const external = B.svc === 'external';
      if (!external && (exemptTarget(b) || b.vpc || isInVpc(B))) return;
      const v = place[A.id].vpc;
      if (v === '__default') return;
      const sameRegion = external || place[B.id].region === place[A.id].region;
      const natOk = inV('nat', v).some((n) => place[n.id].subnet === 'public');
      const ifEp = (svc) => sameRegion && inV('ifendpoint', v).some((n) => n.props.service === svc);
      const gwEp = (svc) => sameRegion && inV('gwendpoint', v).some((n) => (n.props.service || 's3') === svc);
      let ok = natOk, need;
      if (!ok && !external) {
        if (B.svc === 's3' || B.svc === 'dynamodb') { ok = gwEp(B.svc) || ifEp(B.svc); need = 'a Gateway endpoint for ' + b.short + (sameRegion ? ' (free)' : '') + ' or a NAT gateway'; }
        else if (B.svc === 'ecr') { ok = ifEp('ecr') && (gwEp('s3') || ifEp('s3')); need = 'an Interface endpoint for ECR plus a Gateway endpoint for S3 (image layers are downloaded from S3), or a NAT gateway'; }
        else { ok = ifEp(B.svc); need = 'an Interface endpoint for ' + b.short + ' or a NAT gateway'; }
        if (!sameRegion) need = 'a NAT gateway (endpoints only reach services in their own region; ' + name(B) + ' is in ' + REGIONS[place[B.id].region].split(' ')[0] + ')';
      }
      if (external) need = 'a NAT gateway in a public subnet';
      if (!ok) {
        edgeRes[e.id].netWarn = true;
        issue('error', name(A) + ' (private subnet) can\'t reach ' + name(B),
          (A.svc === 'lambda' ? 'A Lambda function attached to a VPC has no internet route of its own. ' : 'A private subnet has no route out of ' + vpcName(v) + '. ') + (external ? 'A third-party API is on the internet.' : name(B) + ' is a regional AWS endpoint outside your VPC.'),
          'Add ' + need + ' in ' + vpcName(v) + '.', [A.id, B.id], [e.id]);
      }
    });
    real.filter((n) => n.svc === 'ifendpoint' && !n.props.service).forEach((n) =>
      issue('warn', name(n) + ' has no service chosen', 'Each interface endpoint serves one AWS service. This one isn\'t set to any, so it does nothing.', 'Pick the service in the inspector.', [n.id]));

    okEdges = edges.filter((e) => edgeRes[e.id].ok);

    // public databases
    real.filter((n) => sv(n).tags.some((t) => ['sql', 'nosql', 'cache', 'warehouse'].includes(t)) && isPublicSubnet(n) && !place[n.id].defaultVpc).forEach((n) =>
      issue('warn', name(n) + ' is in a public subnet', 'Databases and caches belong in private subnets so nothing on the internet can even try to connect.', 'Move it into a private subnet.', [n.id]));

    // cross-region latency
    okEdges.forEach((e) => {
      const A = byId[e.from], B = byId[e.to];
      const ra = place[A.id].region, rb = place[B.id].region;
      if (ra === 'global' || rb === 'global' || ra === rb) return;
      const a = sv(A), b = sv(B);
      const isData = (x) => x.tags.some((t) => ['sql', 'nosql', 'cache', 'object'].includes(t));
      if (isData(a) && isData(b)) return; // replication
      if (a.tags.some((t) => ['vm', 'container', 'function'].includes(t)) && isData(b)) {
        issue('warn', name(A) + ' calls ' + name(B) + ' in another region', 'Every request crosses regions (~60-150 ms each way) and pays inter-region data transfer.', 'Give each region its own copy of the data (read replica, Aurora Global Database, DynamoDB global table).', [A.id, B.id], [e.id]);
      }
    });

    // --- reachability ---
    const adj = {}; nodes.forEach((n) => { adj[n.id] = []; });
    okEdges.forEach((e) => {
      adj[e.from].push(e.to);
      const a = sv(byId[e.from]), b = sv(byId[e.to]);
      if (bidirAllowed(a, b) && !forwardAllowed(a, b) || (bidirAllowed(a, b) && b.tags.some((t) => ['queue', 'stream'].includes(t)))) adj[e.to].push(e.from);
    });
    const inbound = {}; nodes.forEach((n) => { inbound[n.id] = 0; });
    edges.forEach((e) => { inbound[e.to]++; });
    const starts = real.filter((n) => sv(n).cat === 'clients' || sv(n).tags.includes('attach') || (sv(n).start && inbound[n.id] === 0) || (sv(n).anyIn && inbound[n.id] === 0));
    const reached = new Set();
    const q = starts.map((n) => n.id);
    q.forEach((id) => reached.add(id));
    while (q.length) { const id = q.shift(); adj[id].forEach((t) => { if (!reached.has(t)) { reached.add(t); q.push(t); } }); }

    const degree = {}; nodes.forEach((n) => { degree[n.id] = 0; });
    edges.forEach((e) => { degree[e.from]++; degree[e.to]++; });
    const orphans = real.filter((n) => degree[n.id] === 0 && !sv(n).place && !sv(n).anyIn && !['vpc'].includes(n.svc));
    if (orphans.length) {
      issue('warn', 'Not connected: ' + orphans.map(name).join(', '), 'These services have no arrows, so in this design nothing uses them (but you\'d still pay for most of them).',
        'Connect them, or delete them if they aren\'t needed.', orphans.map((n) => n.id));
    }
    const hasClient = real.some((n) => sv(n).cat === 'clients');
    if (real.length && !hasClient && !real.some((n) => sv(n).start && degree[n.id] > 0)) {
      issue('warn', 'Nothing starts the flow', 'There are no users, devices or schedules sending anything in.', 'Add "Users" (or a scheduler / event source) and connect it to your entry point.');
    }
    const stranded = real.filter((n) => degree[n.id] > 0 && !reached.has(n.id) && !sv(n).anyIn && !sv(n).place);
    if (stranded.length && hasClient) {
      issue('warn', 'Never reached: ' + stranded.map(name).join(', '), 'No working path from your users or event sources leads here, so this part never runs.',
        'Check arrow directions (they point from the caller to the service being called) and fix any red arrows.', stranded.map((n) => n.id));
    }

    // --- animation order: BFS layers including failing edges (stop after them) ---
    const layers = [];
    const seenE = new Set();
    let frontier = starts.map((n) => n.id);
    const visited = new Set(frontier);
    for (let depth = 0; depth < 30 && frontier.length; depth++) {
      const layer = []; const next = [];
      frontier.forEach((id) => {
        edges.forEach((e) => {
          let dst = null;
          if (e.from === id) dst = e.to;
          else if (e.to === id && edgeRes[e.id].ok && adj[e.to].includes(e.from) && adj[id].includes(e.from)) dst = e.from;
          if (dst === null || seenE.has(e.id)) return;
          seenE.add(e.id); layer.push(e.id);
          if (edgeRes[e.id].ok && !visited.has(dst)) { visited.add(dst); next.push(dst); }
        });
      });
      if (layer.length) layers.push(layer);
      frontier = next;
    }
    const rest = edges.filter((e) => !seenE.has(e.id)).map((e) => e.id);
    if (rest.length) layers.push(rest);

    // --- query helpers for requirements and suggestions ---
    const Q = makeQuery(nodes, okEdges, adj, byId, place);

    // --- requirements ---
    const requirements = (opts.requirements || []).map((r) => {
      let ok = false;
      try { ok = !!r.test(Q); } catch (err) { ok = false; }
      return { text: r.text, hint: r.hint || '', ok };
    });

    // --- suggestions ---
    collectSuggestions(Q, nodes, okEdges, byId, place, suggestions, sv, name, opts);
    if (opts.simple && suggestions.length > 3) suggestions.length = 3;

    const errors = issues.filter((i) => i.level === 'error').length;
    const reqFailed = requirements.filter((r) => !r.ok).length;
    return {
      passed: errors === 0 && reqFailed === 0 && real.length > 0,
      errors, warnings: issues.filter((i) => i.level === 'warn').length,
      issues, suggestions, requirements, edgeRes, layers, placement: place, reached: [...reached],
    };
  };

  // ---------- query DSL used by scenarios ----------
  function makeQuery(nodes, okEdges, adj, byId, place) {
    const SVn = (n) => SV()[n.svc];
    function match(n, sel) {
      if (Array.isArray(sel)) return sel.some((x) => match(n, x));
      const s = SVn(n);
      if (sel.startsWith('tag:')) return s.tags.includes(sel.slice(4));
      if (sel.startsWith('cat:')) return s.cat === sel.slice(4);
      return n.svc === sel;
    }
    const list = (sel) => nodes.filter((n) => !SVn(n).group && match(n, sel));
    function flowFrom(ids) {
      const seen = new Set(ids); const q = [...ids];
      while (q.length) { const id = q.shift(); (adj[id] || []).forEach((t) => { if (!seen.has(t)) { seen.add(t); q.push(t); } }); }
      return seen;
    }
    function flow(a, b, via) {
      const A = list(a), B = list(b);
      if (!A.length || !B.length) return false;
      if (via) {
        const V = list(via);
        return V.some((v) => A.some((x) => x.id !== v.id && flowFrom([x.id]).has(v.id)) && B.some((y) => y.id !== v.id && flowFrom([v.id]).has(y.id)));
      }
      return A.some((x) => { const r = flowFrom([x.id]); return B.some((y) => y.id !== x.id && r.has(y.id)); });
    }
    function direct(a, b) {
      const A = new Set(list(a).map((n) => n.id)), B = new Set(list(b).map((n) => n.id));
      return okEdges.some((e) => (A.has(e.from) && B.has(e.to)) || (A.has(e.to) && B.has(e.from)));
    }
    const isHA = (n) => { const s = SVn(n); return s.ha === 'inherent' || s.global || (s.ha === 'azs' && (n.props.azs || 1) >= 2); };
    const isPriv = (n) => !SVn(n).vpc || (place[n.id].vpc && place[n.id].subnet === 'private');
    const regionsOf = (sel) => new Set(list(sel).map((n) => place[n.id].region).filter((r) => r !== 'global'));
    return {
      list, match, flow, direct,
      has: (sel) => list(sel).length > 0,
      groups: (svc) => nodes.filter((n) => n.svc === svc).length,
      attachedVpcs: (svc) => new Set(okEdges.filter((e) => (byId[e.from].svc === svc && byId[e.to].svc === 'vpc') || (byId[e.to].svc === svc && byId[e.from].svc === 'vpc')).map((e) => (byId[e.to].svc === 'vpc' ? e.to : e.from))).size,
      count: (sel) => list(sel).length,
      none: (sel) => list(sel).length === 0,
      reach: (sel) => flow(['users', 'mobile'], sel),
      ha: (sel) => list(sel).length > 0 && list(sel).every(isHA),
      anyHA: (sel) => list(sel).some(isHA),
      private: (sel) => list(sel).length > 0 && list(sel).every(isPriv),
      regions: (sel) => regionsOf(sel).size,
      prop: (sel, key, val) => list(sel).some((n) => (val === undefined ? !!n.props[key] : n.props[key] === val)),
      placement: (n) => place[n.id],
      inbound: (n) => okEdges.filter((e) => e.to === n.id).map((e) => byId[e.from]),
      outbound: (n) => okEdges.filter((e) => e.from === n.id).map((e) => byId[e.to]),
    };
  }
  S.makeQuery = makeQuery;

  // ---------- "it works, but..." suggestions ----------
  function collectSuggestions(Q, nodes, okEdges, byId, place, out, sv, name, opts) {
    const add = (title, detail, ids) => out.push({ title, detail, nodeIds: ids || [] });
    const real = nodes.filter((n) => !sv(n).group);
    const dataTags = ['sql', 'nosql', 'cache', 'search', 'queue', 'pubsub', 'stream', 'bus', 'delivery', 'workflow', 'warehouse', 'file', 'ml', 'email', 'external'];

    // S3 served to users without CloudFront
    Q.list('s3').forEach((b) => {
      const ins = Q.inbound(b);
      if (ins.some((n) => ['users', 'mobile', 'route53'].includes(n.svc)) && !Q.has('cloudfront') && b.props.access === 'website') {
        add('Put CloudFront in front of S3', 'An S3 website endpoint is HTTP-only and served from one region. CloudFront adds HTTPS on your domain, edge caching worldwide and lower data-transfer cost, and lets you keep the bucket private with Origin Access Control.', [b.id]);
      }
    });
    // servers that only serve static content
    Q.list(['ec2', 'asg', 'ecs', 'eks', 'fargate', 'lightsail', 'beanstalk']).forEach((n) => {
      const outs = Q.outbound(n).filter((x) => sv(x).tags.some((t) => dataTags.includes(t)) || sv(x).tags.includes('object'));
      if (!outs.length && Q.inbound(n).length) {
        add('Static content doesn\'t need servers', name(n) + ' doesn\'t talk to any database or service. If it only serves HTML/CSS/JS/images, host them on S3 behind CloudFront: no servers to patch, and it costs cents.', [n.id]);
      }
    });
    // Lambda -> RDS without proxy
    okEdges.forEach((e) => {
      const A = byId[e.from], B = byId[e.to];
      if (A.svc === 'lambda' && sv(B).tags.includes('sql') && !Q.has('rdsproxy')) {
        add('Add RDS Proxy between Lambda and ' + name(B), 'Each concurrent Lambda opens its own database connection; a traffic spike can exhaust the database\'s connection limit. RDS Proxy pools and reuses connections. (Or consider DynamoDB if the data fits a key-value model.)', [A.id, B.id]);
      }
    });
    // NAT only used for S3 / DynamoDB
    if (Q.has('nat')) {
      const privToOutside = okEdges.filter((e) => { const p = place[e.from]; return p && p.vpc && p.subnet === 'private'; })
        .map((e) => byId[e.to]).filter((b) => !sv(b).vpc && !sv(b).place && !sv(b).anyIn && !sv(b).global && sv(b).cat !== 'groups');
      if (privToOutside.length && privToOutside.every((b) => b.svc === 's3' || b.svc === 'dynamodb')) {
        add('Swap the NAT gateway for a Gateway Endpoint', 'Your private subnets only call S3/DynamoDB. A VPC Gateway Endpoint does that for free; a NAT gateway costs ~$32/month per AZ plus $0.045 per GB.', Q.list('nat').map((n) => n.id));
      }
    }
    // single EC2 instance serving users
    Q.list('ec2').forEach((n) => {
      if (Q.inbound(n).some((x) => ['users', 'mobile', 'route53', 'alb', 'cloudfront', 'nlb'].includes(x.svc))) {
        add('Use an Auto Scaling group instead of a single EC2 instance', 'One instance is a single point of failure and can\'t handle traffic spikes. An Auto Scaling group across 2+ AZs behind an ALB replaces failed instances automatically.', [n.id]);
      }
    });
    // ASG / ECS in one AZ
    Q.list(['asg', 'ecs', 'eks', 'fargate', 'rds', 'aurora', 'elasticache']).forEach((n) => {
      if ((n.props.azs || 1) < 2 && Q.inbound(n).length) {
        if (n.svc === 'aurora') {
          add('Add an Aurora Replica in a second AZ', 'Aurora already keeps 6 copies of your data across 3 AZs, so the data is safe. But ' + name(n) + ' has only a writer instance: if its AZ fails, Aurora must create a new instance (about 10 minutes of downtime). A replica in another AZ takes over in about 30 seconds and can also serve reads.', [n.id]);
        } else {
          add('Spread ' + name(n) + ' across 2 or more AZs', 'If its Availability Zone has an outage, this part of the app goes down. ' + (sv(n).tags.includes('sql') ? 'Turn on Multi-AZ for a standby in a second AZ with automatic failover.' : 'Set Availability Zones to 2+.'), [n.id]);
        }
      }
    });
    // ECS on EC2
    Q.list('ecs').forEach((n) => { if (n.props.launch === 'ec2') add('Consider Fargate for ' + name(n), 'With the EC2 launch type you patch and scale the container hosts yourself. Fargate runs the same tasks with no hosts to manage.', [n.id]); });
    // EKS for small setups
    if (Q.has('eks') && Q.count(['tag:container']) <= 2) {
      add('ECS may be simpler than EKS here', 'EKS adds Kubernetes concepts and a $73/month control plane per cluster. Unless you need Kubernetes tooling or portability, ECS on Fargate does the job with less to learn and run.', Q.list('eks').map((n) => n.id));
    }
    // API GW -> Lambda -> one AWS service only (direct integration)
    Q.list('lambda').forEach((n) => {
      const ins = Q.inbound(n), outs = Q.outbound(n).filter((x) => !sv(x).anyIn);
      if (ins.length === 1 && ins[0].svc === 'apigw' && outs.length === 1 && ['sqs', 'sns', 'kinesis', 'eventbridge', 'stepfunctions', 'firehose'].includes(outs[0].svc)) {
        add('API Gateway can write to ' + sv(outs[0]).short + ' directly', 'This Lambda only forwards the request. API Gateway has native service integrations, so you can remove the function (less code, no cold starts, lower cost).', [n.id]);
      }
    });
    // Lambda chains
    okEdges.forEach((e) => {
      const A = byId[e.from], B = byId[e.to];
      if (A.svc === 'lambda' && B.svc === 'lambda' && Q.outbound(B).some((x) => x.svc === 'lambda')) {
        add('Orchestrate the Lambda chain with Step Functions', 'Functions calling functions pay for idle waiting time and need hand-written retries. Step Functions handles sequencing, retries, timeouts and error branches for you.', [A.id, B.id]);
      }
    });
    // fan-out with multiple SQS
    Q.list(['tag:vm', 'tag:container', 'tag:function']).forEach((n) => {
      const qs = Q.outbound(n).filter((x) => x.svc === 'sqs');
      if (qs.length >= 2 && !Q.has('sns')) add('Use SNS → SQS fan-out', name(n) + ' writes the same event to several queues itself. Publish once to an SNS topic and subscribe each queue: producers stay simple and new consumers don\'t need code changes.', [n.id]);
    });
    // Redshift used only with S3 data
    Q.list('redshift').forEach((n) => {
      add('Is Redshift needed?', 'For occasional, ad-hoc SQL on files in S3, Athena is serverless and billed per query. Redshift pays off for heavy, constant BI workloads and complex joins.', [n.id]);
    });
    // no cache for read-heavy SQL apps
    if (Q.has('tag:sql') && Q.has(['users', 'mobile']) && !Q.has('tag:cache') && opts.level !== 'beginner') {
      add('Cache hot reads', 'Add ElastiCache in front of the database (your app reads the cache first) to cut latency and database load, or use RDS read replicas for read-heavy traffic.', Q.list('tag:sql').map((n) => n.id));
    }
    // DB creds without Secrets Manager
    if (Q.has('tag:sql') && !Q.has('secrets') && opts.level !== 'beginner') {
      add('Keep database passwords in Secrets Manager', 'Store credentials in Secrets Manager (with automatic rotation) instead of in code or environment variables.', Q.list('tag:sql').map((n) => n.id));
    }
    // no monitoring
    if (real.length >= 3 && !Q.has('cloudwatch')) {
      add('Add CloudWatch', 'You can\'t operate what you can\'t see. Add CloudWatch alarms on errors and latency, and send logs there.', []);
    }
    // public entry without WAF at higher levels
    if ((opts.level === 'associate' || opts.level === 'professional') && Q.has(['cloudfront', 'alb', 'apigw', 'appsync']) && !Q.has('waf') && Q.has(['users', 'mobile'])) {
      add('Protect the entry point with WAF', 'Attach AWS WAF to CloudFront, the ALB or API Gateway to block SQL injection, XSS, bad bots and request floods.', Q.list(['cloudfront', 'alb', 'apigw', 'appsync']).map((n) => n.id));
    }
    // Kinesis with a single Lambda consumer
    Q.list('kinesis').forEach((n) => {
      const outs = Q.outbound(n);
      if (outs.length === 1 && outs[0].svc === 'lambda' && Q.inbound(n).every((x) => ['apigw', 'lambda'].includes(x.svc))) {
        add('SQS might be simpler than Kinesis', 'With one consumer and no need for ordering or replay, an SQS queue is cheaper, scales without shards and has no capacity to plan.', [n.id]);
      }
    });
    // Users -> ALB directly with static content: CloudFront
    if (Q.has('alb') && Q.has(['users']) && !Q.has('cloudfront') && opts.level !== 'beginner') {
      if (Q.list('users').some((u) => Q.outbound(u).some((x) => x.svc === 'alb') || Q.outbound(u).some((x) => x.svc === 'route53' && Q.outbound(x).some((y) => y.svc === 'alb')))) {
        add('Consider CloudFront in front of the ALB', 'CloudFront caches images, CSS and JS near users, absorbs DDoS traffic and terminates TLS at the edge, which takes load off your servers.', Q.list('alb').map((n) => n.id));
      }
    }
  }
})(typeof window !== 'undefined' ? (window.AWSSIM = window.AWSSIM || {}) : (globalThis.AWSSIM = globalThis.AWSSIM || {}));
