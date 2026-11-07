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
    return p;
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

  function computePlacement(nodes) {
    const groups = nodes.filter((n) => SV()[n.svc] && SV()[n.svc].group);
    const vpcs = groups.filter((g) => g.svc === 'vpc');
    const subnets = groups.filter((g) => g.svc !== 'vpc');
    const area = (g) => (g.w || 300) * (g.h || 200);
    const place = {};
    function smallestContaining(list, x, y, pad) {
      let best = null;
      list.forEach((g) => { if (inRect(x, y, groupRect(g), pad) && (!best || area(g) < area(best))) best = g; });
      return best;
    }
    subnets.forEach((sn) => {
      const [cx, cy] = nodeCenter(sn);
      const v = smallestContaining(vpcs, cx, cy, 0);
      place[sn.id] = { vpc: v ? v.id : null, subnet: null, region: v ? (v.props.region || 'primary') : 'primary' };
    });
    vpcs.forEach((v) => { place[v.id] = { vpc: v.id, subnet: null, region: v.props.region || 'primary' }; });
    nodes.forEach((n) => {
      const sv = SV()[n.svc];
      if (!sv || sv.group) return;
      const [cx, cy] = nodeCenter(n);
      const sn = smallestContaining(subnets, cx, cy, 0);
      let v = sn ? (place[sn.id].vpc && vpcs.find((x) => x.id === place[sn.id].vpc)) : null;
      if (!v) v = smallestContaining(vpcs, cx, cy, n.svc === 'igw' ? 50 : 0);
      const subnetType = sn ? SV()[sn.svc].subnet : null;
      const region = sv.global ? 'global' : v ? (v.props.region || 'primary') : (n.props.region || 'primary');
      place[n.id] = { vpc: v ? v.id : null, subnet: subnetType, subnetId: sn ? sn.id : null, region };
    });
    return place;
  }
  S.computePlacement = computePlacement;

  // ---------- main evaluation ----------
  S.evaluate = function (graph, opts) {
    opts = opts || {};
    const strict = !!opts.strict;
    const nodes = graph.nodes.filter((n) => SV()[n.svc]);
    const byId = {}; nodes.forEach((n) => { byId[n.id] = n; });
    const edges = graph.edges.filter((e) => byId[e.from] && byId[e.to]);
    const place = computePlacement(nodes);
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
    const netLevel = strict ? 'error' : 'warn';

    function issue(level, title, detail, fix, nodeIds, edgeIds) {
      issues.push({ level, title, detail, fix: fix || '', nodeIds: nodeIds || [], edgeIds: edgeIds || [] });
    }

    const isInVpc = (n) => !!place[n.id].vpc && (sv(n).vpc || CAN_VPC.has(n.svc) || sv(n).place) && !sv(n).group;
    const isPrivate = (n) => isInVpc(n) && place[n.id].subnet !== 'public' && !sv(n).place;
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
        if (ok && A.svc === 'lambda' && !isInVpc(A) && b.vpc && !b.place && !b.tags.includes('lb') && isPrivate(B)) {
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
    const okEdges = edges.filter((e) => edgeRes[e.id].ok);

    // --- empty / no entry ---
    const real = nodes.filter((n) => !sv(n).group);
    if (!real.length) issue('error', 'The canvas is empty', 'Drag services from the left panel onto the canvas, then drag from a service\'s blue dot to another service to connect them.');

    // --- VPC placement ---
    const vpcNodes = real.filter((n) => sv(n).vpc && !sv(n).place);
    const notInVpc = vpcNodes.filter((n) => !place[n.id].vpc);
    if (notInVpc.length) {
      issue(netLevel, 'Some resources aren\'t inside a VPC', notInVpc.map(name).join(', ') + ' must run inside a subnet of a VPC.',
        has('vpc') ? 'Drag them into a subnet inside your VPC box.' : 'Add a VPC box with public and private subnets (from "Network boxes"), then drag them into the right subnet.', notInVpc.map((n) => n.id));
    }
    const noSubnet = vpcNodes.filter((n) => place[n.id].vpc && !place[n.id].subnet);
    if (noSubnet.length) {
      issue(netLevel, 'Some resources are in the VPC but not in a subnet', noSubnet.map(name).join(', ') + ' sit directly in the VPC box. Every resource is launched into a specific subnet.',
        'Add public/private subnet boxes inside the VPC and drag them in.', noSubnet.map((n) => n.id));
    }
    const misplaced = real.filter((n) => place[n.id].vpc && !sv(n).vpc && !sv(n).place && !CAN_VPC.has(n.svc));
    if (misplaced.length) {
      issue('warn', 'Regional services drawn inside the VPC', misplaced.map(name).join(', ') + ' are managed regional services. They don\'t live in your subnets; your VPC reaches them through endpoints, a NAT gateway or the internet gateway.',
        'Move them outside the VPC box.', misplaced.map((n) => n.id));
    }
    const subnetsOutside = nodes.filter((n) => sv(n).group && n.svc !== 'vpc' && !place[n.id].vpc);
    if (subnetsOutside.length) issue(netLevel, 'Subnet outside a VPC', 'Subnets always belong to a VPC.', 'Drag the subnet box inside a VPC box.', subnetsOutside.map((n) => n.id));

    // --- public subnets need IGW ---
    const vpcs = nodes.filter((n) => n.svc === 'vpc');
    vpcs.forEach((v) => {
      const inV = (n) => place[n.id] && place[n.id].vpc === v.id;
      const needsIgw = real.some((n) => inV(n) && (isPublicSubnet(n) || n.svc === 'nat'));
      const igw = real.some((n) => n.svc === 'igw' && inV(n));
      if (needsIgw && !igw) {
        issue(netLevel, 'No Internet Gateway on ' + name(v), 'Resources in the public subnet of ' + name(v) + ' have no route to the internet without an Internet Gateway attached to the VPC.',
          'Drag an Internet Gateway onto the edge of the VPC box.', [v.id]);
      }
    });

    // ALB in at least 2 AZs
    real.filter((n) => n.svc === 'alb' && (n.props.azs || 1) < 2).forEach((n) =>
      issue('error', name(n) + ' needs at least 2 Availability Zones', 'AWS won\'t create an Application Load Balancer unless you give it subnets in two or more AZs.', 'Set Availability Zones to 2 or 3 in the inspector.', [n.id]));

    // NAT must be in a public subnet
    real.filter((n) => n.svc === 'nat' && place[n.id].vpc && place[n.id].subnet !== 'public').forEach((n) =>
      issue(netLevel, 'NAT gateway in the wrong subnet', 'A NAT gateway needs a route to the Internet Gateway, so it must sit in a public subnet.', 'Drag it into a public subnet.', [n.id]));

    // private egress
    const egressTarget = (b) => !b.vpc && !b.group && !b.place && b.cat !== 'clients' && !b.tags.includes('attach') && !b.tags.includes('support') && !b.global && !b.tags.includes('hybridlink');
    okEdges.forEach((e) => {
      const A = byId[e.from], B = byId[e.to];
      if (!isPrivate(A)) return;
      const b = sv(B);
      const external = B.svc === 'external';
      if (!external && !egressTarget(b)) return;
      if (CAN_VPC.has(B.svc) && isInVpc(B)) return;
      const v = place[A.id].vpc;
      const inV = (id) => real.some((n) => n.svc === id && place[n.id].vpc === v);
      const nat = inV('nat');
      const gwEp = inV('gwendpoint') && (B.svc === 's3' || B.svc === 'dynamodb');
      const ifEp = inV('ifendpoint') && !external;
      if (!(nat || gwEp || ifEp)) {
        edgeRes[e.id].netWarn = true;
        issue(netLevel, name(A) + ' (private subnet) can\'t reach ' + name(B),
          'Private subnets have no route out of the VPC. ' + (external ? 'Calling a third-party API needs a NAT gateway.' : name(B) + ' is a regional AWS endpoint outside your VPC.'),
          external ? 'Add a NAT gateway in a public subnet.' : (B.svc === 's3' || B.svc === 'dynamodb') ? 'Add a VPC Gateway Endpoint (free) or a NAT gateway.' : 'Add a VPC Interface Endpoint or a NAT gateway.', [A.id, B.id], [e.id]);
      }
    });

    // cross-VPC traffic
    okEdges.forEach((e) => {
      const A = byId[e.from], B = byId[e.to];
      const va = place[A.id].vpc, vb = place[B.id].vpc;
      if (!va || !vb || va === vb || !isInVpc(A) || !isInVpc(B) || va === '__default' || vb === '__default') return;
      const replication = sv(A).tags.some((t) => ['sql', 'nosql', 'cache'].includes(t)) && sv(B).tags.some((t) => ['sql', 'nosql', 'cache'].includes(t));
      if (replication) return;
      if (!has('tgw') && !has('peering') && !has('privatelink') && !has('lattice')) {
        issue(netLevel, name(A) + ' and ' + name(B) + ' are in different VPCs', 'Separate VPCs are isolated networks by default.', 'Connect the VPCs with a Transit Gateway or VPC peering (or expose the service with PrivateLink).', [A.id, B.id], [e.id]);
      }
    });

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
        add('Spread ' + name(n) + ' across 2 or more AZs', 'If its Availability Zone has an outage, this part of the app goes down. ' + (sv(n).tags.includes('sql') ? 'Turn on Multi-AZ for automatic failover.' : 'Set Availability Zones to 2+.'), [n.id]);
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
