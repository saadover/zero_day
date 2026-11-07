/* AWS Architecture Sandbox — question generator.
 * Each template returns a story, requirement checks (run against the user's
 * diagram by the engine) and a sample answer that is auto-laid-out.
 */
(function (S) {
  'use strict';

  // ---------- seeded random ----------
  function rng(seed) {
    let a = seed >>> 0;
    const f = function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    f.pick = (arr) => arr[Math.floor(f() * arr.length)];
    f.int = (lo, hi) => lo + Math.floor(f() * (hi - lo + 1));
    f.chance = (p) => f() < p;
    return f;
  }

  const COMPANIES = ['Northwind Bakery', 'Lumen Fitness', 'Harbor & Pine', 'Atlas Freight', 'Kestrel Games', 'Bluefin Health',
    'Copperleaf Books', 'Orbit Learning', 'Saffron Kitchen', 'Tidewater Bank', 'Juniper Travel', 'Granite Insurance',
    'Pixel Forge Studio', 'Meadow Pet Care', 'Vertex Robotics', 'Cobalt Retail', 'Ember Coffee Roasters', 'Silverline Media'];
  const domainOf = (c) => c.toLowerCase().replace(/&/g, 'and').replace(/[^a-z]+/g, '') + '.com';

  // ---------- requirement helper ----------
  const R = (text, test, hint) => ({ text, test, hint });
  const SERVERS = ['ec2', 'asg', 'lightsail', 'beanstalk', 'ecs', 'eks', 'fargate', 'outposts'];
  const COMPUTE = ['tag:vm', 'tag:container', 'tag:function'];

  // ---------- generic extra requirements ----------
  const EXTRAS = {
    monitor: {
      text: 'The on-call team gets an alert when errors spike.',
      hint: 'CloudWatch alarm → SNS topic.',
      test: (Q) => Q.flow('cloudwatch', ['sns', 'tag:email']),
      add: (sol) => { sol.n.push(['xCw', 'cloudwatch'], ['xAlert', 'sns']); sol.e.push(['xCw', 'xAlert']); },
    },
    kms: {
      text: 'Customer data is encrypted at rest with keys the company controls.',
      hint: 'Add KMS and connect your data store to it.',
      test: (Q) => Q.direct(['tag:sql', 'tag:nosql', 'tag:object', 'tag:cache', 'tag:file'], 'kms'),
      add: (sol, k) => { sol.n.push(['xKms', 'kms']); sol.e.push([k.data, 'xKms']); },
      needs: 'data',
    },
    waf: {
      text: 'Block SQL injection, cross-site scripting and bad bots before they reach the app.',
      hint: 'Attach AWS WAF to the public entry point (CloudFront, ALB, API Gateway or AppSync).',
      test: (Q) => Q.direct('waf', ['cloudfront', 'alb', 'apigw', 'appsync']),
      add: (sol, k) => { sol.n.push(['xWaf', 'waf']); sol.e.push(['xWaf', k.entry]); },
      needs: 'entry',
    },
    audit: {
      text: 'Auditors need a record of every API call made in the account.',
      hint: 'CloudTrail → S3 bucket.',
      test: (Q) => Q.flow('cloudtrail', 's3'),
      add: (sol) => { sol.n.push(['xTrail', 'cloudtrail'], ['xLogs', 's3', { label: 'Audit logs' }]); sol.e.push(['xTrail', 'xLogs']); },
    },
    tracing: {
      text: 'Engineers can trace a slow request across every service it touches.',
      hint: 'Add X-Ray and connect your compute to it.',
      test: (Q) => Q.direct(COMPUTE, 'xray'),
      add: (sol, k) => { sol.n.push(['xXray', 'xray']); sol.e.push([k.app, 'xXray']); },
      needs: 'app',
    },
    budget: {
      text: 'Finance gets an email if the monthly bill goes over budget.',
      hint: 'AWS Budgets → SNS topic.',
      test: (Q) => Q.flow('budgets', ['sns', 'tag:email']),
      add: (sol) => { sol.n.push(['xBudget', 'budgets'], ['xBudgetTopic', 'sns', { label: 'Billing alerts' }]); sol.e.push(['xBudget', 'xBudgetTopic']); },
    },
    secrets: {
      text: 'No database passwords are stored in code or config files.',
      hint: 'Your compute reads credentials from Secrets Manager.',
      test: (Q) => Q.direct(COMPUTE, 'secrets'),
      add: (sol, k) => { sol.n.push(['xSecrets', 'secrets']); sol.e.push([k.app, 'xSecrets']); },
      needs: 'sql',
    },
  };

  // ---------- templates ----------
  const T = [];
  function tpl(id, level, make) { T.push({ id, level, make }); }

  // ===== INTERMEDIATE (first set) =====
  tpl('static-site', 'intermediate', (r) => {
    const c = r.pick(COMPANIES), d = domainOf(c);
    const what = r.pick(['a marketing site', 'a portfolio site', 'an online menu', 'a landing page for a new product']);
    return {
      title: 'Static website for ' + c,
      story: [c + ' wants ' + what + ' made of plain HTML, CSS, JavaScript and images. There is no login and no database.',
        'It must be served on ' + d + ' over HTTPS, load quickly for visitors in ' + r.pick(['Europe and Asia', 'North and South America', 'every continent']) + ', and cost almost nothing when nobody is visiting.'],
      reqs: [
        R('Visitors type ' + d + ' and reach the site.', (Q) => Q.flow('users', 'route53') && Q.flow('route53', ['cloudfront', 's3']), 'Users → Route 53 → your entry point.'),
        R('The website files are stored in S3.', (Q) => Q.reach('s3'), 'Users must reach the S3 bucket (through CloudFront).'),
        R('Pages are cached close to visitors around the world.', (Q) => Q.flow('users', 'cloudfront') && Q.flow('cloudfront', 's3'), 'CloudFront in front of S3.'),
        R('The site uses HTTPS with a free certificate.', (Q) => Q.direct('acm', 'cloudfront'), 'Attach ACM to CloudFront.'),
        R('No servers to patch or pay for when idle.', (Q) => Q.none(SERVERS), 'Remove EC2 / containers: static files need no servers.'),
      ],
      keys: { entry: 'cf', data: 's3' },
      sol: { n: [['u', 'users'], ['r53', 'route53'], ['cf', 'cloudfront'], ['s3', 's3', { label: 'Site files' }], ['acm', 'acm']],
        e: [['u', 'r53'], ['r53', 'cf'], ['cf', 's3'], ['acm', 'cf']] },
    };
  });

  tpl('contact-form', 'intermediate', (r) => {
    const c = r.pick(COMPANIES);
    const store = r.chance(0.5);
    return {
      title: 'Contact form for ' + c,
      story: [c + ' already has a static website. They want a contact form: when a visitor submits it, the owner gets an email.',
        store ? 'They also want every submission saved so nothing gets lost.' : 'They expect about ' + r.int(5, 60) + ' messages a day and don\'t want to run any servers.'],
      reqs: [
        R('The website is served from S3 through CloudFront.', (Q) => Q.flow('users', 'cloudfront') && Q.flow('cloudfront', 's3'), 'Users → CloudFront → S3.'),
        R('The form submits to an HTTPS API.', (Q) => Q.reach(['apigw', 'appsync']) || Q.reach('lambda'), 'Users → API Gateway.'),
        R('Code runs only when a form is submitted.', (Q) => Q.flow(['apigw', 'users'], 'lambda'), 'API Gateway → Lambda.'),
        R('The owner receives an email.', (Q) => Q.flow('lambda', ['ses', 'sns']), 'Lambda → SES (Simple Email Service).'),
      ].concat(store ? [R('Every submission is stored.', (Q) => Q.flow('lambda', ['dynamodb', 's3']), 'Lambda → DynamoDB.')] : [])
        .concat([R('No servers.', (Q) => Q.none(SERVERS), 'Use Lambda instead of EC2.')]),
      keys: { entry: 'api', app: 'fn', data: store ? 'db' : 's3' },
      sol: { n: [['u', 'users'], ['cf', 'cloudfront'], ['s3', 's3', { label: 'Site files' }], ['api', 'apigw'], ['fn', 'lambda'], ['ses', 'ses']].concat(store ? [['db', 'dynamodb']] : []),
        e: [['u', 'cf'], ['cf', 's3'], ['u', 'api'], ['api', 'fn'], ['fn', 'ses']].concat(store ? [['fn', 'db']] : []) },
    };
  });

  tpl('photo-upload', 'intermediate', (r) => {
    const c = r.pick(COMPANIES);
    const client = r.pick(['users', 'mobile']);
    const days = r.pick([30, 60, 90, 180]);
    return {
      title: 'Photo uploads for ' + c,
      story: [c + ' is building ' + (client === 'mobile' ? 'a mobile app' : 'a web app') + ' where signed-in customers upload photos (up to 20 MB each).',
        'Uploads must not pass through the company\'s backend (it would be slow and expensive). Photos older than ' + days + ' days are rarely viewed and should move to the cheapest storage automatically.'],
      reqs: [
        R('Customers sign up and sign in.', (Q) => Q.flow([client], 'cognito'), (client === 'mobile' ? 'Mobile app' : 'Users') + ' → Cognito.'),
        R('Only signed-in customers can request an upload link.', (Q) => Q.direct(['apigw', 'appsync'], 'cognito') && Q.flow(['apigw', 'appsync'], 'lambda'), 'API Gateway (with a Cognito authorizer) → Lambda that creates presigned URLs.'),
        R('Photos upload straight to S3.', (Q) => Q.direct([client], 's3'), 'Draw ' + (client === 'mobile' ? 'Mobile app' : 'Users') + ' → S3 and set the bucket to "Presigned URL uploads".'),
        R('Old photos move to cheaper archive storage.', (Q) => Q.direct('s3', 'glacier'), 'S3 → S3 Glacier (lifecycle rule).'),
      ],
      keys: { entry: 'api', app: 'fn', data: 's3' },
      sol: { n: [['u', client], ['cog', 'cognito'], ['api', 'apigw'], ['fn', 'lambda', { label: 'Make upload URL' }], ['s3', 's3', { access: 'presigned', label: 'Photos' }], ['gl', 'glacier']],
        e: [['u', 'cog'], ['u', 'api'], ['api', 'cog'], ['api', 'fn'], ['fn', 's3'], ['u', 's3'], ['s3', 'gl']] },
    };
  });

  tpl('nightly-report', 'intermediate', (r) => {
    const c = r.pick(COMPANIES);
    const t = r.pick(['01:00', '02:30', '06:00', '23:00']);
    const via = r.pick(['ses', 'sns']);
    return {
      title: 'Nightly sales report for ' + c,
      story: ['Every night at ' + t + ' UTC, ' + c + ' wants to read yesterday\'s orders from their DynamoDB table, build a CSV report, keep a copy of it, and ' + (via === 'ses' ? 'email it to the managers.' : 'notify the team.'),
        'The job takes about two minutes. Nobody wants a server running all day for a two-minute job.'],
      reqs: [
        R('The job starts automatically on a schedule.', (Q) => Q.flow(['scheduler', 'eventbridge'], 'lambda'), 'EventBridge Scheduler → Lambda.'),
        R('It reads the orders table.', (Q) => Q.flow('lambda', 'dynamodb'), 'Lambda → DynamoDB.'),
        R('Each report is saved.', (Q) => Q.flow('lambda', 's3'), 'Lambda → S3.'),
        R('The team is notified.', (Q) => Q.flow('lambda', ['ses', 'sns']), 'Lambda → SES or SNS.'),
        R('Nothing runs (or bills) between jobs.', (Q) => Q.none(SERVERS), 'Use Lambda, not EC2.'),
      ],
      keys: { app: 'fn', data: 'db' },
      sol: { n: [['sch', 'scheduler'], ['fn', 'lambda', { label: 'Build report' }], ['db', 'dynamodb', { label: 'Orders' }], ['s3', 's3', { label: 'Reports' }], ['msg', via]],
        e: [['sch', 'fn'], ['fn', 'db'], ['fn', 's3'], ['fn', 'msg']] },
    };
  });

  tpl('small-blog', 'intermediate', (r) => {
    const c = r.pick(COMPANIES), d = domainOf(c);
    const engine = r.pick(['WordPress', 'Ghost', 'Drupal']);
    return {
      title: engine + ' blog for ' + c,
      story: [c + ' wants to run a ' + engine + ' blog at ' + d + '. Traffic is small (a few hundred visits a day), so one server is fine for now.',
        'The database should be managed by AWS (automatic backups and patching) and must not be reachable from the internet.'],
      reqs: [
        R('Visitors reach the blog at ' + d + '.', (Q) => Q.flow('users', 'route53') && Q.flow('route53', ['ec2', 'lightsail', 'alb']), 'Users → Route 53 → the server.'),
        R(engine + ' runs on a server.', (Q) => Q.reach(['ec2', 'lightsail', 'asg']), 'An EC2 instance in a public subnet.'),
        R('The database is managed by AWS.', (Q) => Q.flow(['ec2', 'lightsail', 'asg'], ['rds', 'aurora']), 'EC2 → RDS.'),
        R('The database is not on the internet.', (Q) => Q.private(['rds', 'aurora']), 'Put RDS in a private subnet.'),
      ],
      keys: { entry: 'ec2', app: 'ec2', data: 'db' },
      sol: { n: [['u', 'users'], ['r53', 'route53'], ['ec2', 'ec2', { label: engine }, 'pub'], ['db', 'rds', { label: 'MySQL' }, 'priv']],
        e: [['u', 'r53'], ['r53', 'ec2'], ['u', 'ec2'], ['ec2', 'db']] },
    };
  });

  // ===== BEGINNER =====
  // Small, friendly questions: 3-4 services, no VPC boxes needed (beginner mode
  // puts servers and databases in AWS's default VPC automatically).
  const APP = ['ec2', 'asg', 'lightsail', 'beanstalk', 'apprunner', 'ecs', 'fargate', 'eks', 'lambda', 'amplify'];
  const DB = ['tag:sql', 'tag:nosql'];

  tpl('shop', 'beginner', (r) => {
    const c = r.pick(COMPANIES);
    const what = r.pick(['handmade candles', 'sneakers', 'used books', 'plants', 'phone cases', 'coffee beans']);
    return {
      title: 'Online shop for ' + c,
      story: [c + ' sells ' + what + ' and wants a simple online shop.',
        'Customers open the shop in their browser from anywhere on the internet. The shop keeps its products and orders in a database.'],
      reqs: [
        R('Customers can open the shop from the internet.', (Q) => Q.reach(APP), 'Users → EC2 (a web server that runs the shop).'),
        R('The shop saves products and orders in a database.', (Q) => Q.flow(APP, DB) && Q.reach(DB), 'EC2 → RDS (a managed database).'),
      ],
      keys: { app: 'web', data: 'db' },
      sol: { n: [['u', 'users', { label: 'Customers' }], ['web', 'ec2', { label: 'Shop website' }], ['db', 'rds', { label: 'Products & orders' }]],
        e: [['u', 'web'], ['web', 'db']] },
    };
  });

  tpl('personal-site', 'beginner', (r) => {
    const who = r.pick(['a photographer', 'a student', 'a local band', 'a yoga teacher', 'a freelance designer']);
    return {
      title: 'Personal website for ' + who,
      story: ['You are helping ' + who + ' put a personal website online. It is just a few HTML pages and pictures. Nothing changes unless they upload new files.',
        'It should be cheap and need no server to look after.'],
      reqs: [
        R('Visitors can open the website from the internet.', (Q) => Q.reach(['s3', 'amplify', 'lightsail', 'ec2']), 'Users → S3 bucket.'),
        R('The pages and pictures are stored in S3.', (Q) => Q.reach('s3'), 'Select the S3 bucket and set Access to "Public static website".'),
        R('No servers to look after.', (Q) => Q.none(SERVERS), 'S3 can serve the files by itself, so you don\'t need EC2.'),
      ],
      keys: { data: 's3' },
      sol: { n: [['u', 'users', { label: 'Visitors' }], ['s3', 's3', { access: 'website', label: 'Website files' }]],
        e: [['u', 's3']] },
    };
  });

  tpl('file-storage', 'beginner', (r) => {
    const c = r.pick(COMPANIES);
    const files = r.pick(['invoices', 'school homework', 'recipes with photos', 'contracts', 'X-ray images']);
    return {
      title: 'File uploads for ' + c,
      story: [c + ' has a web app where people upload ' + files + '.',
        'The app runs on a server. The uploaded files must be kept safely and never lost, even if the server breaks.'],
      reqs: [
        R('People can open the app from the internet.', (Q) => Q.reach(APP), 'Users → EC2 (the app server).'),
        R('Uploaded files are kept in S3, not on the server.', (Q) => Q.flow(APP, 's3'), 'EC2 → S3 bucket.'),
      ],
      keys: { app: 'web', data: 's3' },
      sol: { n: [['u', 'users'], ['web', 'ec2', { label: 'Web app' }], ['s3', 's3', { label: files }]],
        e: [['u', 'web'], ['web', 's3']] },
    };
  });

  tpl('blog-domain', 'beginner', (r) => {
    const c = r.pick(COMPANIES), d = domainOf(c);
    return {
      title: 'A blog at ' + d,
      story: [c + ' wants a blog. Readers should reach it by typing ' + d + ' in their browser.',
        'The blog runs on one server, and posts and comments are stored in a database.'],
      reqs: [
        R('Readers reach the blog by typing ' + d + '.', (Q) => Q.flow('users', 'route53') && Q.flow('route53', APP.concat(['alb', 'cloudfront'])), 'Users → Route 53 (DNS) → EC2.'),
        R('The blog runs on a server.', (Q) => Q.reach(['ec2', 'lightsail', 'asg', 'beanstalk']), 'Use an EC2 instance.'),
        R('Posts and comments are saved in a database.', (Q) => Q.flow(APP, DB), 'EC2 → RDS.'),
      ],
      keys: { app: 'web', data: 'db' },
      sol: { n: [['u', 'users', { label: 'Readers' }], ['r53', 'route53', { label: d }], ['web', 'ec2', { label: 'Blog server' }], ['db', 'rds', { label: 'Posts' }]],
        e: [['u', 'r53'], ['r53', 'web'], ['web', 'db']] },
    };
  });

  tpl('signup-form', 'beginner', (r) => {
    const c = r.pick(COMPANIES);
    return {
      title: 'Newsletter sign-up for ' + c,
      story: [c + ' wants a sign-up form for its newsletter. When someone types their email and presses Send, the email address is saved.',
        'Only a few people sign up each day, so it should cost nothing when nobody is using it: no servers.'],
      reqs: [
        R('The form sends the email address to an API on the internet.', (Q) => Q.reach(['apigw', 'appsync']), 'Users → API Gateway.'),
        R('A small piece of code handles each sign-up.', (Q) => Q.flow(['apigw', 'appsync'], 'lambda'), 'API Gateway → Lambda.'),
        R('Email addresses are saved in a database.', (Q) => Q.flow(['lambda', 'apigw', 'appsync'], DB), 'Lambda → DynamoDB.'),
      ],
      keys: { app: 'fn', data: 'db' },
      sol: { n: [['u', 'users', { label: 'Visitors' }], ['api', 'apigw'], ['fn', 'lambda', { label: 'Save sign-up' }], ['db', 'dynamodb', { label: 'Subscribers' }]],
        e: [['u', 'api'], ['api', 'fn'], ['fn', 'db']] },
    };
  });

  tpl('fast-menu', 'beginner', (r) => {
    const c = r.pick(COMPANIES);
    return {
      title: 'Fast menu website for ' + c,
      story: [c + ' has its menu as a few web pages and photos stored in S3.',
        'Tourists from other countries say the photos load slowly. Make the site load fast for visitors everywhere.'],
      reqs: [
        R('The pages and photos are stored in S3.', (Q) => Q.reach('s3'), 'Keep the files in an S3 bucket.'),
        R('Visitors get the files from a server close to them (a CDN).', (Q) => Q.flow('users', 'cloudfront') && Q.flow('cloudfront', 's3'), 'Users → CloudFront → S3.'),
      ],
      keys: { data: 's3' },
      sol: { n: [['u', 'users', { label: 'Visitors' }], ['cf', 'cloudfront'], ['s3', 's3', { label: 'Menu files' }]],
        e: [['u', 'cf'], ['cf', 's3']] },
    };
  });

  // ===== INTERMEDIATE =====
  tpl('three-tier', 'intermediate', (r) => {
    const c = r.pick(COMPANIES);
    const cache = r.chance(0.5);
    return {
      title: 'Highly available web app for ' + c,
      story: [c + ' runs a customer portal on Linux servers with a PostgreSQL database. Traffic ' + r.pick(['triples on Black Friday', 'doubles every Monday morning', 'spikes during monthly billing runs']) + '.',
        'Last year a single data center outage took the portal down for ' + r.int(3, 9) + ' hours. It must now survive the loss of an entire Availability Zone. App servers and the database must not be directly reachable from the internet.' + (cache ? ' User sessions should be stored outside the servers so any server can handle any request.' : '')],
      reqs: [
        R('Users reach the portal through a load balancer.', (Q) => Q.reach('alb') && Q.flow('alb', ['asg', 'ecs', 'ec2']), 'Users → (Route 53) → ALB → servers.'),
        R('App servers scale out and in with traffic.', (Q) => Q.flow('alb', ['asg', 'ecs', 'fargate']), 'Use an EC2 Auto Scaling group behind the ALB.'),
        R('Survives an Availability Zone outage.', (Q) => Q.ha(['alb', 'asg', 'ecs']) && Q.ha(['rds', 'aurora']) && Q.has(['rds', 'aurora']), 'ALB, Auto Scaling group and database all in 2+ AZs (database: Multi-AZ).'),
        R('App servers and database are in private subnets.', (Q) => Q.private(['asg', 'ec2', 'ecs', 'rds', 'aurora']), 'Only the load balancer sits in a public subnet.'),
      ].concat(cache ? [R('Sessions are stored in a shared in-memory store.', (Q) => Q.flow(['asg', 'ec2', 'ecs'], ['elasticache', 'memorydb', 'dynamodb']), 'Servers → ElastiCache.')] : []),
      keys: { entry: 'alb', app: 'asg', data: 'db' },
      sol: { n: [['u', 'users'], ['r53', 'route53'], ['alb', 'alb', { azs: 2 }, 'pub'], ['asg', 'asg', { azs: 2, label: 'Web servers' }, 'priv'], ['db', 'rds', { azs: 2, label: 'PostgreSQL' }, 'priv']]
        .concat(cache ? [['cache', 'elasticache', { azs: 2, label: 'Sessions' }, 'priv']] : []),
      e: [['u', 'r53'], ['r53', 'alb'], ['u', 'alb'], ['alb', 'asg'], ['asg', 'db']].concat(cache ? [['asg', 'cache']] : []) },
    };
  });

  tpl('serverless-api', 'intermediate', (r) => {
    const c = r.pick(COMPANIES);
    const client = r.pick(['mobile', 'users']);
    const thing = r.pick(['workout logs', 'recipes', 'pet health records', 'reading lists', 'expense entries']);
    return {
      title: 'Serverless REST API for ' + c,
      story: [c + '\'s ' + (client === 'mobile' ? 'mobile app' : 'single-page web app') + ' needs a REST API so users can create, read, update and delete their ' + thing + '.',
        'Usage is unpredictable: near zero at night, ' + r.int(200, 3000) + ' requests per second at peak. Only signed-in users may call the API. The team is small and doesn\'t want to manage servers.'],
      reqs: [
        R('Users sign up and sign in.', (Q) => Q.flow([client], 'cognito'), 'Client → Cognito.'),
        R('The API rejects requests without a valid login token.', (Q) => Q.direct(['apigw', 'appsync'], 'cognito'), 'Connect API Gateway to Cognito (authorizer).'),
        R('Business logic runs without servers.', (Q) => Q.flow(['apigw', 'appsync'], 'lambda') && Q.none(SERVERS), 'API Gateway → Lambda.'),
        R('Data is stored in a database that scales automatically.', (Q) => Q.flow('lambda', ['dynamodb', 'aurora']), 'Lambda → DynamoDB.'),
        R('Logs and metrics are collected.', (Q) => Q.has('cloudwatch'), 'Add CloudWatch.'),
      ],
      keys: { entry: 'api', app: 'fn', data: 'db' },
      sol: { n: [['u', client], ['cog', 'cognito'], ['api', 'apigw'], ['fn', 'lambda'], ['db', 'dynamodb', { label: thing }], ['cw', 'cloudwatch']],
        e: [['u', 'cog'], ['u', 'api'], ['api', 'cog'], ['api', 'fn'], ['fn', 'db'], ['fn', 'cw']] },
    };
  });

  tpl('thumbnails', 'intermediate', (r) => {
    const c = r.pick(COMPANIES);
    const queue = r.chance(0.6);
    return {
      title: 'Image processing pipeline for ' + c,
      story: [c + ' lets users upload product photos. Each upload must automatically produce three resized versions and record the image details (size, owner, date) for search.',
        'Resized images are shown on the website, which is visited from all over the world.' + (queue ? ' During sales, ' + r.int(5, 50) + ',000 photos arrive within minutes; none may be lost if processing falls behind.' : '')],
      reqs: [
        R('Users upload photos directly to S3.', (Q) => Q.direct(['users', 'mobile'], 's3'), 'Users → S3 bucket (presigned uploads).'),
        R('Each upload automatically starts processing.', (Q) => Q.flow('s3', 'lambda'), 'S3 event → Lambda.'),
        R('Resized images are stored separately from originals.', (Q) => Q.count('s3') >= 2 && Q.flow('lambda', 's3'), 'Lambda writes to a second bucket.'),
        R('Image details are stored in a database.', (Q) => Q.flow('lambda', ['dynamodb', 'rds', 'aurora']), 'Lambda → DynamoDB.'),
        R('Resized images are delivered through a CDN.', (Q) => Q.flow('cloudfront', 's3'), 'Users → CloudFront → thumbnails bucket.'),
      ].concat(queue ? [R('Uploads are buffered so none are lost under load.', (Q) => Q.flow('s3', 'lambda', 'sqs'), 'S3 → SQS → Lambda.')] : []),
      keys: { entry: 'cf', app: 'fn', data: 'db' },
      sol: { n: [['u', 'users'], ['up', 's3', { access: 'presigned', label: 'Originals' }]].concat(queue ? [['q', 'sqs']] : [])
        .concat([['fn', 'lambda', { label: 'Resize' }], ['th', 's3', { label: 'Thumbnails' }], ['db', 'dynamodb', { label: 'Image index' }], ['cf', 'cloudfront']]),
      e: [['u', 'up']].concat(queue ? [['up', 'q'], ['q', 'fn']] : [['up', 'fn']]).concat([['fn', 'th'], ['fn', 'db'], ['u', 'cf'], ['cf', 'th']]) },
    };
  });

  tpl('orders', 'intermediate', (r) => {
    const c = r.pick(COMPANIES);
    return {
      title: 'Order processing for ' + c,
      story: [c + ' takes orders through an API. Processing an order (payment check, stock reservation, invoice) takes up to ' + r.int(10, 40) + ' seconds, but the customer must get an immediate "order received" response.',
        'If processing fails ' + r.int(3, 5) + ' times, the order must be kept aside for the support team to inspect. Customers get a confirmation email when the order is processed.'],
      reqs: [
        R('Orders are accepted through an API.', (Q) => Q.reach('apigw'), 'Users → API Gateway.'),
        R('Accepting and processing are decoupled by a queue.', (Q) => Q.flow('apigw', 'sqs') && Q.flow('sqs', COMPUTE), 'API → (Lambda) → SQS → worker.'),
        R('Orders that keep failing are moved aside (dead-letter queue).', (Q) => Q.count('sqs') >= 2 && Q.direct('sqs', 'sqs'), 'SQS → second SQS queue (DLQ).'),
        R('Processed orders are stored.', (Q) => Q.flow('sqs', ['dynamodb', 'rds', 'aurora']), 'Worker → DynamoDB.'),
        R('Customers receive a confirmation email.', (Q) => Q.flow('sqs', ['ses', 'sns']), 'Worker → SES.'),
      ],
      keys: { entry: 'api', app: 'work', data: 'db' },
      sol: { n: [['u', 'users'], ['api', 'apigw'], ['q', 'sqs', { label: 'Orders' }], ['dlq', 'sqs', { label: 'Failed orders' }], ['work', 'lambda', { label: 'Process order' }], ['db', 'dynamodb'], ['ses', 'ses']],
        e: [['u', 'api'], ['api', 'q'], ['q', 'work'], ['q', 'dlq'], ['work', 'db'], ['work', 'ses']] },
    };
  });

  tpl('chat', 'intermediate', (r) => {
    const c = r.pick(COMPANIES);
    const moderation = r.chance(0.5);
    return {
      title: 'Real-time chat for ' + c,
      story: [c + ' wants a chat feature in their app: messages appear instantly for everyone in a room, and history is kept.',
        'Only registered users may chat. ' + (moderation ? 'Toxic messages must be detected automatically.' : 'The team wants fully managed services only.')],
      reqs: [
        R('Users sign in.', (Q) => Q.flow(['users', 'mobile'], 'cognito'), 'Users → Cognito.'),
        R('Messages are pushed to clients in real time.', (Q) => Q.reach(['appsync', 'apigw']), 'AppSync subscriptions or API Gateway WebSockets.'),
        R('The real-time API only accepts signed-in users.', (Q) => Q.direct(['appsync', 'apigw'], 'cognito'), 'Connect the API to Cognito.'),
        R('Message history is stored.', (Q) => Q.flow(['appsync', 'apigw'], ['dynamodb', 'aurora', 'documentdb']), 'API → DynamoDB.'),
      ].concat(moderation ? [R('Toxic messages are detected.', (Q) => Q.flow(['appsync', 'apigw', 'lambda'], ['comprehend', 'bedrock']), 'Lambda → Comprehend.')] : [])
        .concat([R('No servers.', (Q) => Q.none(SERVERS), '')]),
      keys: { entry: 'api', app: moderation ? 'fn' : null, data: 'db' },
      sol: { n: [['u', 'users'], ['cog', 'cognito'], ['api', 'appsync'], ['db', 'dynamodb', { label: 'Messages' }]].concat(moderation ? [['fn', 'lambda', { label: 'Moderate' }], ['nlp', 'comprehend']] : []),
        e: [['u', 'cog'], ['u', 'api'], ['api', 'cog'], ['api', 'db']].concat(moderation ? [['api', 'fn'], ['fn', 'nlp']] : []) },
    };
  });

  // ===== ASSOCIATE =====
  tpl('ecommerce', 'associate', (r) => {
    const c = r.pick(COMPANIES);
    const pay = r.pick(['Stripe', 'Adyen', 'PayPal']);
    return {
      title: 'E-commerce platform for ' + c,
      story: [c + ' is moving its online shop to AWS. The app is containerized. Product images and static assets should load fast worldwide; the catalog is read far more than it\'s written.',
        'Payments go through ' + pay + '\'s API on the internet. Checkout must survive an Availability Zone failure, and the security team requires a web application firewall, private subnets for everything except load balancers, and no passwords in code.'],
      reqs: [
        R('Static assets and images are served through a CDN from S3.', (Q) => Q.flow('users', 'cloudfront') && Q.flow('cloudfront', 's3'), 'CloudFront → S3.'),
        R('Dynamic requests reach containers through a load balancer.', (Q) => Q.flow('alb', ['ecs', 'fargate', 'eks']) && Q.reach('alb'), 'CloudFront → ALB → ECS.'),
        R('Containers run without managing servers.', (Q) => Q.prop('ecs', 'launch', 'fargate') || Q.has('fargate'), 'ECS with Fargate launch type.'),
        R('The database survives an AZ outage.', (Q) => Q.ha(['rds', 'aurora']) && Q.has(['rds', 'aurora']), 'Aurora/RDS Multi-AZ.'),
        R('Hot catalog reads are cached.', (Q) => Q.flow(['tag:container'], 'tag:cache'), 'ECS → ElastiCache.'),
        R('Payments reach ' + pay + '.', (Q) => Q.flow(['tag:container', 'lambda'], 'external'), 'ECS → third-party API (needs a NAT gateway from a private subnet).'),
        R('A WAF protects the shop.', (Q) => Q.direct('waf', ['cloudfront', 'alb']), 'WAF → CloudFront.'),
        R('Credentials come from Secrets Manager.', (Q) => Q.direct(['tag:container'], 'secrets'), 'ECS → Secrets Manager.'),
        R('Containers, database and cache are in private subnets.', (Q) => Q.private(['ecs', 'fargate', 'eks', 'rds', 'aurora', 'elasticache']), ''),
      ],
      keys: { entry: 'cf', app: 'app', data: 'db' },
      sol: { n: [['u', 'users'], ['r53', 'route53'], ['cf', 'cloudfront'], ['waf', 'waf'], ['s3', 's3', { label: 'Images' }], ['alb', 'alb', { azs: 2 }, 'pub'], ['nat', 'nat', {}, 'pub'],
        ['app', 'ecs', { azs: 2, launch: 'fargate', label: 'Shop' }, 'priv'], ['db', 'aurora', { azs: 2 }, 'priv'], ['cache', 'elasticache', { azs: 2 }, 'priv'], ['sec', 'secrets'], ['pay', 'external', { label: pay }]],
      e: [['u', 'r53'], ['r53', 'cf'], ['u', 'cf'], ['cf', 's3'], ['cf', 'alb'], ['waf', 'cf'], ['alb', 'app'], ['app', 'db'], ['app', 'cache'], ['app', 'sec'], ['app', 'nat'], ['app', 'pay']] },
    };
  });

  tpl('clickstream', 'associate', (r) => {
    const c = r.pick(COMPANIES);
    const n = r.int(2, 40);
    return {
      title: 'Clickstream analytics for ' + c,
      story: [c + '\'s website and app generate about ' + n + ' million click events per day. Product managers want to query them with SQL and see dashboards the next morning.',
        'The data team is two people, so everything should be serverless and pay-per-use. Raw events must be kept cheaply for years.'],
      reqs: [
        R('Events are ingested by a managed streaming service.', (Q) => Q.flow(['users', 'mobile'], ['firehose', 'kinesis']), 'Users → API Gateway → Data Firehose.'),
        R('Raw events land in an S3 data lake.', (Q) => Q.flow(['firehose', 'kinesis'], 's3'), 'Firehose → S3.'),
        R('Table definitions are in a data catalog.', (Q) => Q.direct('glue', 's3'), 'Glue crawler ↔ S3.'),
        R('Analysts query the data with SQL.', (Q) => Q.direct(['athena', 'redshift'], 's3'), 'Athena ↔ S3.'),
        R('Dashboards are available to product managers.', (Q) => Q.direct(['quicksight', 'grafana'], ['athena', 'redshift']), 'Quick Sight → Athena.'),
        R('No clusters or servers to manage.', (Q) => Q.none(SERVERS.concat(['emr', 'redshift', 'msk'])), 'Use serverless options (Firehose, Glue, Athena).'),
      ],
      keys: { entry: 'api', data: 's3' },
      sol: { n: [['u', 'users'], ['api', 'apigw'], ['fh', 'firehose'], ['s3', 's3', { label: 'Data lake' }], ['glue', 'glue'], ['ath', 'athena'], ['qs', 'quicksight']],
        e: [['u', 'api'], ['api', 'fh'], ['fh', 's3'], ['glue', 's3'], ['ath', 's3'], ['ath', 'glue'], ['qs', 'ath']] },
    };
  });

  tpl('microservices', 'associate', (r) => {
    const c = r.pick(COMPANIES);
    return {
      title: 'Microservices for ' + c,
      story: [c + ' is splitting a monolith into two containerized services: Orders and Inventory. Both are exposed under one domain (/orders and /inventory). Each service must own its data; they must not share a database.',
        'When an order is placed, Inventory must react without Orders calling it directly. Container images are kept in a private registry. Containers run in private subnets.'],
      reqs: [
        R('One load balancer routes to at least two container services.', (Q) => Q.list(['tag:container']).filter((n) => Q.inbound(n).some((x) => x.svc === 'alb')).length >= 2, 'ALB → ECS Orders, ALB → ECS Inventory.'),
        R('Each service has its own database.', (Q) => {
          const svcs = Q.list(['tag:container']);
          const owned = svcs.map((s) => Q.outbound(s).filter((x) => ['tag:sql', 'tag:nosql'].some((t) => Q.match(x, t))).map((x) => x.id));
          if (owned.length < 2 || owned.some((o) => !o.length)) return false;
          const all = owned.flat();
          return new Set(all).size === all.length;
        }, 'Orders → DynamoDB, Inventory → its own Aurora/DynamoDB. No database connected to both.'),
        R('Services communicate through events.', (Q) => Q.flow(['tag:container'], ['eventbridge', 'sns']) && Q.flow(['eventbridge', 'sns'], ['tag:container', 'sqs']), 'Orders → EventBridge → SQS → Inventory.'),
        R('Images come from a private registry.', (Q) => Q.direct(['tag:container'], 'ecr'), 'ECS → ECR.'),
        R('Containers run in private subnets across 2 AZs.', (Q) => Q.private(['tag:container']) && Q.ha(['tag:container']), ''),
      ],
      keys: { entry: 'alb', app: 'ord', data: 'odb' },
      sol: { n: [['u', 'users'], ['r53', 'route53'], ['alb', 'alb', { azs: 2 }, 'pub'], ['ord', 'ecs', { azs: 2, launch: 'fargate', label: 'Orders' }, 'priv'], ['inv', 'ecs', { azs: 2, launch: 'fargate', label: 'Inventory' }, 'priv'],
        ['odb', 'dynamodb', { label: 'Orders table' }], ['idb', 'aurora', { azs: 2, label: 'Inventory DB' }, 'priv'], ['eb', 'eventbridge'], ['q', 'sqs', { label: 'Inventory events' }],
        ['ecr', 'ecr'], ['gwe', 'gwendpoint', {}, 'priv'], ['ife', 'ifendpoint', {}, 'priv']],
      e: [['u', 'r53'], ['r53', 'alb'], ['u', 'alb'], ['alb', 'ord'], ['alb', 'inv'], ['ord', 'odb'], ['inv', 'idb'], ['ord', 'eb'], ['eb', 'q'], ['inv', 'q'], ['ord', 'ecr'], ['inv', 'ecr']] },
    };
  });

  tpl('hybrid', 'associate', (r) => {
    const c = r.pick(COMPANIES);
    const db = r.pick(['Oracle', 'SQL Server', 'MySQL', 'PostgreSQL']);
    return {
      title: 'Hybrid internal app for ' + c,
      story: [c + ' is moving an internal HR application to AWS. Employees work from the head office and must reach the app over a private, encrypted connection; the app must never be exposed to the internet.',
        'The ' + db + ' database (' + r.int(200, 900) + ' GB) has to be moved with less than 10 minutes of downtime. The app must survive an AZ outage.'],
      reqs: [
        R('The office connects to the VPC over an encrypted private link.', (Q) => Q.flow('onprem', ['vpn', 'dx']), 'Data center → Site-to-Site VPN.'),
        R('Employees reach the app through an internal load balancer.', (Q) => Q.flow(['vpn', 'dx'], ['alb', 'nlb']) && Q.private(['alb', 'nlb']), 'VPN → ALB in a private subnet (internal).'),
        R('The app is not reachable from the internet.', (Q) => Q.none(['users', 'route53', 'cloudfront', 'igw']), 'No public entry points.'),
        R('The database is migrated with minimal downtime.', (Q) => Q.flow('onprem', 'dms') && Q.flow('dms', ['rds', 'aurora']), 'Data center → DMS → RDS.'),
        R('App servers and database survive an AZ outage.', (Q) => Q.ha(['asg', 'ecs', 'ec2']) && Q.ha(['rds', 'aurora']) && Q.has(['rds', 'aurora']), ''),
      ],
      keys: { entry: 'alb', app: 'asg', data: 'db' },
      sol: { n: [['dc', 'onprem', { label: 'Head office' }], ['vpn', 'vpn'], ['alb', 'alb', { azs: 2, label: 'Internal ALB' }, 'priv'], ['asg', 'asg', { azs: 2, label: 'HR app' }, 'priv'], ['db', 'rds', { azs: 2, label: db }, 'priv'], ['dms', 'dms']],
        e: [['dc', 'vpn'], ['vpn', 'alb'], ['alb', 'asg'], ['asg', 'db'], ['dc', 'dms'], ['dms', 'db']] },
    };
  });

  tpl('iot', 'associate', (r) => {
    const c = r.pick(COMPANIES);
    const n = r.int(5, 200);
    const what = r.pick(['refrigerated trucks', 'greenhouse sensors', 'wind turbines', 'smart thermostats']);
    return {
      title: 'IoT telemetry for ' + c,
      story: [c + ' has ' + n + ',000 ' + what + ' sending a reading every 10 seconds. Engineers want live dashboards of the last 30 days of readings.',
        'If a reading crosses a danger threshold, the operations team must be alerted within a minute. Devices must authenticate with certificates.'],
      reqs: [
        R('Devices connect securely to a managed MQTT broker.', (Q) => Q.direct('devices', ['iotcore', 'greengrass']), 'Devices → IoT Core.'),
        R('Readings are stored in a time-series database.', (Q) => Q.flow('iotcore', ['timestream', 'dynamodb', 'sitewise']), 'IoT Core rule → Timestream.'),
        R('Dangerous readings trigger an alert.', (Q) => Q.flow('iotcore', ['sns', 'ses', 'pinpoint']), 'IoT Core rule → Lambda → SNS.'),
        R('Engineers have live dashboards.', (Q) => Q.direct(['grafana', 'quicksight'], ['timestream', 'dynamodb', 'sitewise']), 'Managed Grafana → Timestream.'),
        R('No servers.', (Q) => Q.none(SERVERS), ''),
      ],
      keys: { entry: 'iot', app: 'fn', data: 'ts' },
      sol: { n: [['d', 'devices', { label: what }], ['iot', 'iotcore'], ['ts', 'timestream'], ['fn', 'lambda', { label: 'Check threshold' }], ['sns', 'sns', { label: 'Ops alerts' }], ['gf', 'grafana']],
        e: [['d', 'iot'], ['iot', 'ts'], ['iot', 'fn'], ['fn', 'sns'], ['gf', 'ts']] },
    };
  });

  tpl('vod', 'associate', (r) => {
    const c = r.pick(COMPANIES);
    return {
      title: 'Video on demand for ' + c,
      story: [c + ' publishes ' + r.int(20, 300) + ' training videos a week. Creators upload a large source file; the platform must convert it into adaptive streaming formats (HLS) at several resolutions and track each video\'s status.',
        'Viewers in ' + r.pick(['30 countries', 'Europe and Asia', 'the Americas']) + ' must get smooth playback. The conversion has several steps that need retries.'],
      reqs: [
        R('Creators upload source files directly to S3.', (Q) => Q.direct(['users', 'mobile'], 's3'), 'Users → S3 (presigned).'),
        R('A workflow with retries orchestrates the processing.', (Q) => Q.flow('s3', 'stepfunctions'), 'S3 → EventBridge → Step Functions.'),
        R('Videos are transcoded by a managed service.', (Q) => Q.flow('stepfunctions', 'mediaconvert'), 'Step Functions → MediaConvert.'),
        R('Output is stored in a separate bucket.', (Q) => Q.flow('mediaconvert', 's3') && Q.count('s3') >= 2, 'MediaConvert → output bucket.'),
        R('Video status is tracked.', (Q) => Q.flow('stepfunctions', ['dynamodb', 'rds', 'aurora']), 'Step Functions → DynamoDB.'),
        R('Viewers stream through a CDN.', (Q) => Q.flow('users', 'cloudfront') && Q.flow('cloudfront', 's3'), 'CloudFront → output bucket.'),
      ],
      keys: { entry: 'cf', data: 'db' },
      sol: { n: [['u', 'users'], ['src', 's3', { access: 'presigned', label: 'Source uploads' }], ['eb', 'eventbridge'], ['sf', 'stepfunctions'], ['mc', 'mediaconvert'], ['out', 's3', { label: 'HLS output' }], ['db', 'dynamodb', { label: 'Video status' }], ['cf', 'cloudfront']],
        e: [['u', 'src'], ['src', 'eb'], ['eb', 'sf'], ['sf', 'mc'], ['mc', 'out'], ['sf', 'db'], ['u', 'cf'], ['cf', 'out']] },
    };
  });

  // ===== PROFESSIONAL =====
  tpl('multi-region-dr', 'professional', (r) => {
    const c = r.pick(COMPANIES);
    const rto = r.pick([5, 15, 30]);
    return {
      title: 'Multi-region disaster recovery for ' + c,
      story: [c + '\'s trading portal runs in us-east-1. The board requires that a full regional outage costs at most ' + rto + ' minutes of downtime (RTO) and at most a few seconds of data (RPO).',
        'Use a warm standby in us-west-2. DNS must fail over automatically when health checks fail. User-uploaded documents must also exist in the second region, and the database must have point-in-time backups.'],
      reqs: [
        R('DNS fails over between load balancers in two regions.', (Q) => { const lbs = Q.list(['alb', 'nlb']).filter((n) => Q.inbound(n).some((x) => x.svc === 'route53')); return new Set(lbs.map((n) => Q.placement(n).region)).size >= 2; }, 'Route 53 → ALB (us-east-1) and Route 53 → ALB (us-west-2).'),
        R('Application servers run in both regions.', (Q) => Q.regions(['asg', 'ecs', 'eks', 'fargate', 'ec2']) >= 2, 'Second VPC (set its region to us-west-2) with its own Auto Scaling group.'),
        R('The database replicates across regions with an RPO of seconds.', (Q) => Q.prop('aurora', 'crossRegion') || Q.prop('dynamodb', 'globalTables'), 'Aurora Global Database (turn on "Cross-region replica").'),
        R('Each region survives an AZ outage on its own.', (Q) => Q.ha(['alb', 'asg', 'ecs', 'aurora', 'rds']), 'Everything set to 2+ AZs.'),
        R('Uploaded documents are replicated to the second region.', (Q) => Q.direct('s3', 's3') && Q.regions('s3') >= 2, 'S3 (us-east-1) → S3 (us-west-2) replication.'),
        R('The database has managed backups.', (Q) => Q.direct('backup', ['tag:sql', 'tag:nosql']), 'AWS Backup → Aurora.'),
      ],
      keys: { entry: 'alb1', app: 'asg1', data: 'db1' },
      sol: { n: [['u', 'users'], ['r53', 'route53', { label: 'Failover routing' }],
        ['alb1', 'alb', { azs: 2 }, 'pub'], ['asg1', 'asg', { azs: 2, label: 'Portal' }, 'priv'], ['db1', 'aurora', { azs: 2, crossRegion: true, label: 'Aurora primary' }, 'priv'],
        ['alb2', 'alb', { azs: 2 }, 'pub:2'], ['asg2', 'asg', { azs: 2, label: 'Portal standby' }, 'priv:2'], ['db2', 'aurora', { azs: 2, crossRegion: true, label: 'Aurora secondary' }, 'priv:2'],
        ['s1', 's3', { label: 'Documents' }], ['s2', 's3', { label: 'Documents replica', region: 'secondary' }], ['bk', 'backup'], ['gw1', 'gwendpoint', {}, 'priv'], ['gw2', 'gwendpoint', {}, 'priv:2']],
      e: [['u', 'r53'], ['r53', 'alb1'], ['r53', 'alb2'], ['u', 'alb1'], ['alb1', 'asg1'], ['asg1', 'db1'], ['alb2', 'asg2'], ['asg2', 'db2'], ['db1', 'db2'], ['asg1', 's1'], ['asg2', 's2'], ['s1', 's2'], ['bk', 'db1']] },
    };
  });

  tpl('landing-zone', 'professional', (r) => {
    const c = r.pick(COMPANIES);
    const n = r.int(12, 80);
    return {
      title: 'Multi-account landing zone for ' + c,
      story: [c + ' has ' + n + ' AWS accounts created ad hoc, each with its own IAM users. The CISO wants a governed setup: central management of accounts with guardrails, single sign-on for engineers, an organization-wide audit trail that account admins cannot turn off, and centralized threat detection with alerts.',
        'Production and development workloads live in separate VPCs that must be able to reach shared services through a central network hub.'],
      reqs: [
        R('Accounts are governed centrally with guardrails (SCPs).', (Q) => Q.has('organizations') && Q.has('controltower'), 'Organizations + Control Tower.'),
        R('Engineers use single sign-on instead of IAM users.', (Q) => Q.flow('developer', 'identitycenter'), 'Developers → IAM Identity Center.'),
        R('API activity from all accounts goes to a central log archive.', (Q) => Q.flow('cloudtrail', 's3'), 'CloudTrail (organization trail) → S3 log archive.'),
        R('Threats are detected and aggregated in one place.', (Q) => Q.flow('guardduty', 'securityhub'), 'GuardDuty → Security Hub.'),
        R('High-severity findings alert the security team.', (Q) => Q.flow('securityhub', ['sns', 'tag:email']), 'Security Hub → EventBridge → SNS.'),
        R('Resource configuration is continuously recorded and checked.', (Q) => Q.has('config'), 'AWS Config.'),
        R('Several VPCs connect through a central hub.', (Q) => Q.has('tgw') && Q.groups('vpc') >= 2, 'Transit Gateway with two or more VPC boxes.'),
      ],
      keys: {},
      sol: { n: [['dev', 'developer'], ['idc', 'identitycenter'], ['org', 'organizations'], ['ct', 'controltower'], ['trail', 'cloudtrail', { label: 'Org trail' }], ['logs', 's3', { label: 'Log archive' }],
        ['gd', 'guardduty'], ['sh', 'securityhub'], ['eb', 'eventbridge'], ['sns', 'sns', { label: 'Security alerts' }], ['cfg', 'config'], ['tgw', 'tgw']],
      e: [['dev', 'idc'], ['trail', 'logs'], ['gd', 'sh'], ['sh', 'eb'], ['eb', 'sns']],
      vpcs: [{ label: 'Prod VPC' }, { label: 'Dev VPC' }] },
    };
  });

  tpl('gaming', 'professional', (r) => {
    const c = r.pick(COMPANIES);
    return {
      title: 'Global game backend for ' + c,
      story: [c + ' is launching a multiplayer game in North America and the US West Coast first, then worldwide. Game clients need low, consistent latency over TCP/UDP and two fixed IP addresses to allow-list.',
        'Player profiles must be readable and writable in every region with active-active replication. A global leaderboard needs sub-millisecond reads. Each region must keep running if one AZ fails.'],
      reqs: [
        R('Players connect through static anycast IPs to the nearest region.', (Q) => Q.flow(['users', 'mobile'], 'ga') && Q.flow('ga', ['nlb', 'alb']), 'Users → Global Accelerator → NLB.'),
        R('Game traffic (TCP/UDP) is load balanced in at least two regions.', (Q) => Q.regions('nlb') >= 2, 'An NLB in each region\'s VPC.'),
        R('Game servers run in at least two regions.', (Q) => Q.regions(['asg', 'ecs', 'eks', 'fargate', 'ec2']) >= 2, ''),
        R('Player profiles replicate active-active across regions.', (Q) => Q.prop('dynamodb', 'globalTables'), 'DynamoDB global tables.'),
        R('Leaderboard reads take under a millisecond.', (Q) => Q.flow(['tag:vm', 'tag:container'], ['elasticache', 'memorydb', 'dax']), 'Game servers → MemoryDB / ElastiCache.'),
        R('Each region survives an AZ failure.', (Q) => Q.ha(['nlb', 'asg', 'ecs', 'memorydb', 'elasticache']), 'Set 2+ AZs everywhere.'),
      ],
      keys: { entry: 'nlb1', app: 'gs1', data: 'ddb1' },
      sol: { n: [['u', 'users', { label: 'Players' }], ['ga', 'ga'],
        ['nlb1', 'nlb', { azs: 2 }, 'pub'], ['gs1', 'asg', { azs: 2, label: 'Game servers' }, 'priv'], ['lb1', 'memorydb', { azs: 2, label: 'Leaderboard' }, 'priv'], ['gw1', 'gwendpoint', {}, 'priv'],
        ['nlb2', 'nlb', { azs: 2 }, 'pub:2'], ['gs2', 'asg', { azs: 2, label: 'Game servers' }, 'priv:2'], ['lb2', 'memorydb', { azs: 2, label: 'Leaderboard' }, 'priv:2'], ['gw2', 'gwendpoint', {}, 'priv:2'],
        ['ddb1', 'dynamodb', { globalTables: true, label: 'Players' }], ['ddb2', 'dynamodb', { globalTables: true, label: 'Players', region: 'secondary' }]],
      e: [['u', 'ga'], ['ga', 'nlb1'], ['ga', 'nlb2'], ['nlb1', 'gs1'], ['nlb2', 'gs2'], ['gs1', 'lb1'], ['gs2', 'lb2'], ['gs1', 'ddb1'], ['gs2', 'ddb2'], ['ddb1', 'ddb2']] },
    };
  });

  tpl('genai', 'professional', (r) => {
    const c = r.pick(COMPANIES);
    const docs = r.pick(['policy manuals', 'product manuals', 'support tickets', 'contracts']);
    return {
      title: 'Generative AI assistant for ' + c,
      story: [c + ' wants an internal assistant that answers employee questions using its ' + r.int(5, 90) + ',000 ' + docs + '. Answers must be grounded in the company\'s documents (retrieval-augmented generation), not just the model\'s general knowledge.',
        'Employees sign in, the web front end is a single-page app, conversation history is kept, and nothing should run on servers.'],
      reqs: [
        R('The single-page app is served from S3 through CloudFront.', (Q) => Q.flow('users', 'cloudfront') && Q.flow('cloudfront', 's3'), ''),
        R('Employees sign in and the API checks their token.', (Q) => Q.flow('users', 'cognito') && Q.direct(['apigw', 'appsync'], 'cognito'), 'Users → Cognito; API Gateway ↔ Cognito.'),
        R('A managed foundation model generates answers.', (Q) => Q.flow(['apigw', 'appsync'], 'bedrock'), 'API Gateway → Lambda → Bedrock.'),
        R('Answers are grounded with a vector search over the documents.', (Q) => Q.flow('bedrock', ['opensearch', 'aurora', 'kendra']), 'Bedrock Knowledge Base → OpenSearch (vector store).'),
        R('Source documents are stored in S3.', (Q) => Q.direct('bedrock', 's3'), 'Bedrock ↔ S3 documents bucket.'),
        R('Conversation history is saved.', (Q) => Q.flow('lambda', ['dynamodb', 'aurora']), 'Lambda → DynamoDB.'),
        R('No servers.', (Q) => Q.none(SERVERS), ''),
      ],
      keys: { entry: 'api', app: 'fn', data: 'hist' },
      sol: { n: [['u', 'users', { label: 'Employees' }], ['cf', 'cloudfront'], ['web', 's3', { label: 'Web app' }], ['cog', 'cognito'], ['api', 'apigw'], ['fn', 'lambda', { label: 'Chat' }],
        ['br', 'bedrock'], ['vec', 'opensearch', { label: 'Vector index' }], ['docs', 's3', { label: docs }], ['hist', 'dynamodb', { label: 'History' }]],
      e: [['u', 'cf'], ['cf', 'web'], ['u', 'cog'], ['u', 'api'], ['api', 'cog'], ['api', 'fn'], ['fn', 'br'], ['br', 'vec'], ['br', 'docs'], ['fn', 'hist']] },
    };
  });

  tpl('migration', 'professional', (r) => {
    const c = r.pick(COMPANIES);
    const servers = r.int(80, 400), tb = r.int(300, 900);
    return {
      title: 'Data center exit for ' + c,
      story: [c + ' must leave its data center in ' + r.int(6, 12) + ' months. It runs ' + servers + ' Linux and Windows servers (to be rehosted as-is first), an ' + r.pick(['Oracle', 'SQL Server']) + ' database that must move to Aurora with continuous replication until cut-over, ' + r.int(10, 60) + ' TB of active file shares and ' + tb + ' TB of cold archive data.',
        'The office link is only 1 Gbps, and network connectivity to AWS must be private with a backup path.'],
      reqs: [
        R('A dedicated private link with an encrypted backup path.', (Q) => Q.flow('onprem', 'dx') && Q.flow('onprem', 'vpn'), 'Data center → Direct Connect, plus Site-to-Site VPN as backup.'),
        R('Servers are rehosted to EC2 with continuous replication.', (Q) => Q.flow('onprem', 'mgn') && Q.flow('mgn', ['ec2', 'asg']), 'Data center → Application Migration Service → EC2.'),
        R('The database migrates to Aurora with change data capture.', (Q) => Q.flow('onprem', 'dms') && Q.flow('dms', 'aurora'), 'Data center → DMS → Aurora.'),
        R('Active file shares are copied online.', (Q) => Q.flow('onprem', 'datasync') && Q.flow('datasync', ['efs', 'fsx', 's3']), 'DataSync → FSx / EFS.'),
        R('The ' + tb + ' TB archive moves offline.', (Q) => Q.flow('onprem', 'snowball') && Q.flow('snowball', ['s3', 'glacier']), 'Snowball Edge → S3 (then Glacier).'),
        R('Employees reach migrated apps over the private link.', (Q) => Q.flow(['dx', 'vpn'], ['alb', 'nlb', 'ec2', 'asg']), 'Direct Connect → internal ALB.'),
        R('Migrated app and database survive an AZ outage.', (Q) => Q.ha(['asg', 'ec2']) && Q.ha('aurora') && Q.has('aurora'), ''),
      ],
      keys: { entry: 'alb', app: 'asg', data: 'db' },
      sol: { n: [['dc', 'onprem'], ['dx', 'dx'], ['vpn', 'vpn'], ['mgn', 'mgn'], ['dms', 'dms'], ['ds', 'datasync'], ['snow', 'snowball'],
        ['alb', 'alb', { azs: 2, label: 'Internal ALB' }, 'priv'], ['asg', 'asg', { azs: 2, label: 'Rehosted apps' }, 'priv'], ['db', 'aurora', { azs: 2 }, 'priv'], ['fs', 'fsx', { azs: 2, label: 'File shares' }, 'priv'],
        ['s3', 's3', { label: 'Archive' }], ['gl', 'glacier']],
      e: [['dc', 'dx'], ['dc', 'vpn'], ['dx', 'alb'], ['vpn', 'alb'], ['alb', 'asg'], ['asg', 'db'], ['asg', 'fs'], ['dc', 'mgn'], ['mgn', 'asg'], ['dc', 'dms'], ['dms', 'db'], ['dc', 'ds'], ['ds', 'fs'], ['dc', 'snow'], ['snow', 's3'], ['s3', 'gl']] },
    };
  });

  // ---------- generator ----------
  const LEVELS = ['beginner', 'intermediate', 'associate', 'professional'];
  S.LEVELS = LEVELS;
  S.LEVEL_NAMES = { beginner: 'Beginner', intermediate: 'Intermediate', associate: 'Associate', professional: 'Professional' };
  S.TEMPLATES = T;

  S.generateScenario = function (level, seed, templateId) {
    if (seed === undefined || seed === null) seed = Math.floor(Math.random() * 1e9);
    const r = rng(seed);
    const pool = T.filter((t) => t.level === level);
    const t = templateId ? T.find((x) => x.id === templateId) : r.pick(pool);
    const sc = t.make(r);
    sc.id = t.id; sc.level = t.level; sc.seed = seed;
    sc.sol.e = sc.sol.e.slice(); sc.sol.n = sc.sol.n.slice();
    // extras
    const nExtras = level === 'beginner' ? 0 : level === 'intermediate' ? r.int(0, 1) : r.int(1, 2);
    const hasSql = sc.sol.n.some((x) => ['rds', 'aurora'].includes(x[1]));
    const avail = Object.keys(EXTRAS).filter((k) => {
      const x = EXTRAS[k];
      if (sc.reqs.some((q) => q.text === x.text)) return false;
      if (x.needs === 'sql') return hasSql && sc.keys.app;
      if (x.needs === 'entry') return sc.keys.entry && ['cloudfront', 'alb', 'apigw', 'appsync'].includes((sc.sol.n.find((n) => n[0] === sc.keys.entry) || [])[1]) && !sc.sol.n.some((n) => n[1] === 'waf');
      if (x.needs) return !!sc.keys[x.needs];
      if (k === 'monitor' && sc.sol.n.some((n) => n[1] === 'cloudwatch')) return false;
      return true;
    });
    for (let i = 0; i < nExtras && avail.length; i++) {
      const k = avail.splice(Math.floor(r() * avail.length), 1)[0];
      const x = EXTRAS[k];
      sc.reqs.push(R(x.text, x.test, x.hint));
      x.add(sc.sol, sc.keys);
    }
    return sc;
  };

  // ---------- layout of a sample answer ----------
  const COLW = 200, ROWH = 128, X0 = 60, Y0 = 70;
  S.layoutSolution = function (sol) {
    const NODE = S.NODE;
    const n = sol.n.map(([key, svc, props, zone]) => ({ key, svc, props: Object.assign(S.defaultProps(svc), props || {}), zone: zone || null }));
    const byKey = {}; n.forEach((x) => { byKey[x.key] = x; });
    // longest-path layering (bounded)
    const layer = {}; n.forEach((x) => { layer[x.key] = 0; });
    for (let it = 0; it < n.length; it++) {
      let changed = false;
      sol.e.forEach(([a, b]) => {
        if (!byKey[a] || !byKey[b]) return;
        if (layer[b] < layer[a] + 1 && layer[a] + 1 < 12) { layer[b] = layer[a] + 1; changed = true; }
      });
      if (!changed) break;
    }
    const degree = {}; n.forEach((x) => { degree[x.key] = 0; });
    sol.e.forEach(([a, b]) => { degree[a]++; degree[b]++; });
    // zones
    const vpcIdx = (z) => (z ? (z.split(':')[1] ? +z.split(':')[1] : 1) : 0);
    const zoneKind = (z) => (z ? z.split(':')[0] : null);
    const vpcIds = [...new Set(n.filter((x) => x.zone).map((x) => vpcIdx(x.zone)))].sort();
    const supportOnly = n.filter((x) => !x.zone && degree[x.key] === 0);
    const free = n.filter((x) => !x.zone && degree[x.key] > 0);

    // column assignment per VPC: public column(s) first, then private
    const vpcCols = {}; // vpc -> {pubCols:[], privCols:[]}
    let minVpcCol = Infinity;
    vpcIds.forEach((v) => {
      const members = n.filter((x) => vpcIdx(x.zone) === v && degree[x.key] > 0);
      minVpcCol = Math.min(minVpcCol, ...members.map((x) => layer[x.key]));
    });
    if (!isFinite(minVpcCol)) minVpcCol = 0;
    let maxVpcCol = minVpcCol;
    const col = {};
    vpcIds.forEach((v) => {
      const pub = n.filter((x) => vpcIdx(x.zone) === v && zoneKind(x.zone) === 'pub');
      const priv = n.filter((x) => vpcIdx(x.zone) === v && zoneKind(x.zone) === 'priv');
      const c0 = minVpcCol;
      pub.forEach((x) => { col[x.key] = c0; });
      const privStart = pub.length ? c0 + 1 : c0;
      const privLayers = [...new Set(priv.filter((x) => degree[x.key] > 0).map((x) => layer[x.key]))].sort((a, b) => a - b);
      priv.forEach((x) => {
        const isNet = S.SERVICES[x.svc].place;
        col[x.key] = privStart + (isNet || degree[x.key] === 0 ? Math.max(0, privLayers.length - 1) : Math.max(0, privLayers.indexOf(layer[x.key])));
      });
      maxVpcCol = Math.max(maxVpcCol, ...pub.map((x) => col[x.key]), ...priv.map((x) => col[x.key]));
    });
    // free nodes keep their layer as column; ones inside the VPC column range go below the VPCs
    free.forEach((x) => { col[x.key] = layer[x.key]; });

    const nodes = []; let idc = 1; const keyToId = {};
    const mk = (svc, x, y, props, extra) => { const id = 'n' + (idc++); nodes.push(Object.assign({ id, svc, x, y, props }, extra || {})); return id; };

    // VPC boxes
    let y = Y0;
    const vpcBoxes = {};
    vpcIds.forEach((v) => {
      const members = n.filter((x) => vpcIdx(x.zone) === v);
      const rowsBy = {}; let maxRows = 1;
      members.forEach((x) => { const k = zoneKind(x.zone) + col[x.key]; rowsBy[k] = (rowsBy[k] || 0) + 1; maxRows = Math.max(maxRows, rowsBy[k]); });
      const top = y, subTop = top + 44, nodeTop = subTop + 40;
      const height = 44 + 40 + maxRows * ROWH + 26;
      const left = X0 + minVpcCol * COLW - 44, right = X0 + maxVpcCol * COLW + NODE.w + 44;
      const region = v === 1 ? 'primary' : 'secondary';
      const vpcId = mk('vpc', left, top, { region, label: v === 1 ? 'VPC' : 'VPC (us-west-2)' }, { w: right - left, h: height });
      vpcBoxes[v] = { top, height, left, right, vpcId };
      ['pub', 'priv'].forEach((kind) => {
        const mem = members.filter((x) => zoneKind(x.zone) === kind);
        if (!mem.length) return;
        const cs = Math.min(...mem.map((x) => col[x.key])), ce = Math.max(...mem.map((x) => col[x.key]));
        const sx = X0 + cs * COLW - 24, sw = (ce - cs) * COLW + NODE.w + 48;
        mk(kind === 'pub' ? 'pubsubnet' : 'privsubnet', sx, subTop, { label: kind === 'pub' ? 'Public subnet' : 'Private subnet' }, { w: sw, h: height - 44 - 16 });
        const used = {};
        mem.forEach((x) => {
          const c = col[x.key]; used[c] = (used[c] || 0);
          keyToId[x.key] = mk(x.svc, X0 + c * COLW, nodeTop + used[c] * ROWH, x.props);
          used[c]++;
        });
      });
      if (members.some((x) => zoneKind(x.zone) === 'pub')) {
        keyToId['__igw' + v] = mk('igw', left - NODE.w / 2, top + height / 2 - NODE.icon / 2 - 6, {});
      }
      y += height + 50;
    });
    const belowVpc = y;
    // extra empty VPCs (landing zone)
    (sol.vpcs || []).forEach((vv, i) => {
      mk('vpc', X0 + (4 + i * 2) * COLW, belowVpc + 0, { region: 'primary', label: vv.label }, { w: COLW + 120, h: 150 });
    });
    const extraVpcH = (sol.vpcs || []).length ? 190 : 0;

    // free nodes
    const usedRows = {};
    free.forEach((x) => {
      const c = col[x.key];
      const overlapsVpc = vpcIds.length && c >= minVpcCol && c <= maxVpcCol;
      const baseY = overlapsVpc ? belowVpc + extraVpcH : Y0 + (vpcIds.length ? 84 : 0);
      const k = c + (overlapsVpc ? 'b' : 't');
      const r = usedRows[k] = (usedRows[k] === undefined ? 0 : usedRows[k] + 1);
      keyToId[x.key] = mk(x.svc, X0 + c * COLW, baseY + r * ROWH, x.props);
    });
    // support-only nodes in a bottom row
    let maxY = Math.max(Y0, ...nodes.map((nd) => nd.y + (nd.h || NODE.h)));
    supportOnly.forEach((x, i) => {
      keyToId[x.key] = mk(x.svc, X0 + i * (NODE.w + 40), maxY + 40, x.props);
    });
    let ide = 1;
    const edges = sol.e.filter(([a, b]) => keyToId[a] && keyToId[b]).map(([a, b]) => ({ id: 'e' + (ide++), from: keyToId[a], to: keyToId[b] }));
    return { nodes, edges };
  };
})(typeof window !== 'undefined' ? (window.AWSSIM = window.AWSSIM || {}) : (globalThis.AWSSIM = globalThis.AWSSIM || {}));
