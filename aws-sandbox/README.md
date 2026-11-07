# AWS Architecture Sandbox

Design an AWS architecture with the real AWS service icons, press **Play**, and
find out whether it would actually work. Nothing is created in AWS: the
simulation runs entirely in your browser.

- **157 services** in 17 categories, drawn with the official AWS architecture icons.
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

Networking checks are off on Beginner (default VPC), relaxed (warnings) on
Intermediate and strict (failures) on Associate and Professional.

## Run it

It's a static site with no build step:

```bash
cd aws-sandbox
python3 -m http.server 8080
```

Then open http://localhost:8080. Opening `index.html` directly also works.

## Put it online with Vercel

1. In Vercel: Add New → Project → import the `zero_day` repository.
2. Set **Root Directory** to `aws-sandbox`.
3. Deploy. No environment variables are needed.

## Files

| Path | What it is |
| --- | --- |
| `js/services.js` | Service catalog and connection rules (which service may send to which) |
| `js/engine.js` | Simulation: placement in VPCs/subnets, arrow checks with reasons, networking checks, requirement checks, suggestions |
| `js/scenarios.js` | Question generator (27 templates across 4 levels) and sample-answer layout |
| `js/app.js` | Canvas, drag and drop, inspector, results |
| `js/icons.js` | Generated: the AWS icons used, bundled as inline SVG |
| `tools/build-icons.js` | Regenerates `js/icons.js` from the `aws-icons` npm package |
| `tests/` | `node tests/check-scenarios.js` (every sample answer passes its question, 1,080 cases) and `node tests/check-rules.js` (common mistakes fail with the right reason) |

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
