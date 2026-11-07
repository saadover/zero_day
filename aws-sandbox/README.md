# AWS Architecture Sandbox

Design an AWS architecture with the real AWS service icons, press **Play**, and
find out whether it would actually work. Nothing is created in AWS: the
simulation runs entirely in your browser.

- **157 services** in 17 categories, drawn with the official AWS architecture icons.
- **Region, VPC, Availability Zone and subnet boxes**, nested like real AWS
  diagrams. "+ Ready-made network" (under Network boxes) adds a Region, a VPC,
  2 AZs with a public and a private subnet each, and an Internet Gateway in one
  click. A service drawn in two AZ boxes counts as highly available; a load
  balancer drawn across both public subnets counts as spanning 2 AZs.
- **VPC, public subnet and private subnet boxes.** Drop servers, containers,
  databases and load balancers inside them; placement matters (an EC2 instance
  in a private subnet is not reachable from the internet, a private subnet needs
  a NAT gateway or endpoint to reach S3 or an outside API, and so on).
- **Arrows mean "sends requests / data / events to".** Drag from a service's
  blue dot to another service.
- **Play** sends traffic through the design. Each arrow turns green (works),
  amber (works only with a NAT gateway or endpoint) or red (would fail), and
  the Results tab explains *why* and how to fix it.
- **Questions** at four levels, with randomized details so they vary every time
  (27 scenario templates):
  - **Beginner**: 2-4 services, e.g. "an online shop reachable from the
    internet with a database" (Users → EC2 → RDS). No VPC boxes needed: servers
    and databases go in AWS's default VPC automatically. Hints are shown up front.
  - **Intermediate**: static sites with CloudFront, serverless APIs, queues,
    three-tier apps across Availability Zones.
  - **Associate**: e-commerce with caching and WAF, data lakes, microservices,
    hybrid VPN, IoT, video on demand.
  - **Professional**: multi-region disaster recovery, multi-account landing
    zones, global gaming backends, generative AI with RAG, data center exits.
- **Suggestions** when the design works but there is a simpler or cheaper way
  (S3 + CloudFront instead of servers for static files, RDS Proxy for Lambda,
  a free Gateway Endpoint instead of a NAT gateway, Step Functions instead of
  Lambda chains, SNS fan-out, Athena instead of Redshift...).
- **Sample answer** for every question, laid out automatically.
- Settings per service: Availability Zones / Multi-AZ, S3 access mode, Lambda
  function URL, Aurora Global Database, DynamoDB global tables, ECS launch
  type, region (VPC boxes set the region of everything inside them).
- Undo/redo, save/open diagrams as JSON, works on phones (tap to add, drag from
  the dot to connect, pinch to zoom).

## What Play checks (real AWS behaviour)

From Intermediate up, anything that wouldn't work in a real account fails.
Beginner lets you skip the network: servers and databases go in the default
VPC, like a new account. Draw your own VPC there and the real rules apply.

- **Arrows**: only connections AWS supports (users can't reach a database,
  ElastiCache doesn't read the database for you, S3 doesn't push to servers,
  Kinesis needs a consumer, Route 53 aliases S3 only as a website...).
- **Subnets and gateways**: resources must sit in a subnet; public subnets need
  an Internet Gateway (one per VPC); a NAT gateway must be in a public subnet;
  Lambda in a VPC never gets a public IP.
- **Endpoints, per service**: a private subnet reaches S3 / DynamoDB only through a
  Gateway endpoint for that service (same region) or a NAT gateway; other AWS
  services need an Interface endpoint for that exact service; ECR needs the ECR
  endpoint plus an S3 gateway endpoint; third-party APIs need NAT.
- **IP ranges (CIDR)**: VPC and subnets between /16 and /28, subnets inside the
  VPC range and not overlapping, enough addresses (AWS reserves 5 per subnet,
  ALB subnets at least /27), no overlap between peered / Transit Gateway VPCs or
  between a VPC and the data center.
- **Availability Zones**: a subnet is in one AZ; ALB needs 2 AZs; an RDS subnet
  group needs 2 AZs.
- **Hybrid**: Site-to-Site VPN needs a Customer Gateway and ends on a Virtual
  Private Gateway (on the VPC edge) or a Transit Gateway attached to the VPC;
  Direct Connect reaches a Transit Gateway only via a Direct Connect Gateway.
- **Multi-VPC**: VPCs talk only through a Transit Gateway (arrows to each VPC
  box, same region) or a peering connection joining exactly two VPCs.
- **Other**: API Gateway needs a VPC Link for private load balancers; ACM
  certificates for CloudFront must be in us-east-1.

Not modelled: security groups, NACLs, route-table entries, IAM policies,
quotas and prices.

## Endless questions

- **Built-in question**: 27 templates with randomized companies, numbers and
  extra requirements.
- **Fix a broken design**: takes a working answer and breaks it the way real
  incidents happen (deleted endpoint or NAT, single AZ, EFS that should be S3,
  CloudFront removed, a reversed or missing connection...). The broken design is
  loaded on the canvas; fix it until Play passes. Works offline.
- **✦ New AI case / ✦ AI fix-it case**: Claude writes a brand-new case every
  time (`api/generate.js`). Before you see it, the server runs it through the
  same simulator: the sample answer must pass and, for fix-it cases, the
  starting design must fail. If not, Claude gets the simulator's complaints and
  corrects the case (up to 3 rounds).

## Run it

It's a static site; only the AI cases need the small server function:

```bash
cd aws-sandbox
python3 -m http.server 8080
```

Then open http://localhost:8080. Opening `index.html` directly also works.

## Put it online with Vercel

1. In Vercel: Add New → Project → import the `zero_day` repository.
2. Set **Root Directory** to `aws-sandbox`.
3. Under **Environment Variables** add `ANTHROPIC_API_KEY` (from
   console.anthropic.com) for AI cases. Optional: `SANDBOX_ACCESS_CODE`, so only
   people who know the code can generate AI cases (each one costs a few cents of
   API usage).
4. Deploy. Without the key everything except AI cases still works.

AI cases use Claude Opus 5.5 with structured output and take about 20-90
seconds. `vercel.json` gives the function up to 300 seconds.

## Files

| Path | What it is |
| --- | --- |
| `js/services.js` | Service catalog and connection rules (which service may send to which) |
| `js/engine.js` | Simulation: placement in VPCs/subnets, arrow checks with reasons, networking checks, requirement checks, suggestions |
| `js/scenarios.js` | Question generator (27 templates across 4 levels) and sample-answer layout |
| `js/app.js` | Canvas, drag and drop, inspector, results |
| `js/icons.js` | Generated: the AWS icons used, bundled as inline SVG |
| `tools/build-icons.js` | Regenerates `js/icons.js` from the `aws-icons` npm package |
| `api/generate.js` | Vercel function: asks Claude for a new case and validates it with the simulator |
| `tests/` | `npm test`: every sample answer passes its question (1,080 cases), every fix-it exercise starts broken and is fixable (240), realism rules (endpoints, CIDR, hybrid, TGW...), and the AI endpoint against a fake Claude |

## Icons

Service icons are the AWS Architecture Icons, taken from the
[`aws-icons`](https://www.npmjs.com/package/aws-icons) npm package (MIT). AWS
permits these icons for drawing architecture diagrams. To regenerate:

```bash
npm pack aws-icons@3.3.0 && tar xzf aws-icons-3.3.0.tgz
node tools/build-icons.js package/icons
```

## Limits

This checks architecture logic, not every AWS detail. It doesn't model
security groups, route tables, IAM policies, quotas or pricing; one VPC box
stands for the subnets in all its Availability Zones (set the AZ count on each
service instead).
