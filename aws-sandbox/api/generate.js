// POST /api/generate — asks Claude for a brand-new architecture case
// ("build this" or "fix this existing design"), then runs it through the same
// simulator the page uses: the sample answer must pass and, for fix cases, the
// starting design must fail. Problems go back to Claude for a correction.
//
// Settings (Vercel → Project → Environment Variables):
//   ANTHROPIC_API_KEY   required
//   SANDBOX_ACCESS_CODE optional; when set, the page must send the same code
//                       (stops strangers from spending your API credit)

const Anthropic = require("@anthropic-ai/sdk");
require("../js/services.js");
require("../js/engine.js");
require("../js/scenarios.js");

const S = globalThis.AWSSIM;
const MODEL = "claude-opus-5-5";
const MAX_ROUNDS = 3;

const LEVEL_GUIDE = {
  beginner: "2 to 4 services, 2 or 3 requirements, everyday wording. Leave every zone empty (beginner mode puts servers and databases in the default VPC). No hybrid, no multi-region.",
  intermediate: "4 to 8 services, 3 to 5 requirements. Use a VPC (zones pub/priv) when there are servers, containers or databases. Typical topics: CDN, serverless APIs, queues, caching, Multi-AZ, private subnets, endpoints.",
  associate: "6 to 12 services, 4 to 7 requirements, at the AWS Solutions Architect Associate level: high availability across AZs, decoupling, caching, security (WAF, private subnets, Secrets Manager), cost-aware choices, hybrid VPN.",
  professional: "8 to 16 services, 5 to 8 requirements, at the AWS Solutions Architect Professional level: multi-region DR (zones pub:2/priv:2 are the second region), hybrid connectivity (Direct Connect, VPN), migrations, global latency, strict RTO/RPO, governance.",
};
const INDUSTRIES = ["online retail", "banking", "healthcare", "logistics", "video streaming", "online games", "education", "travel booking",
  "insurance", "food delivery", "IoT manufacturing", "news media", "ticketing", "real estate", "fitness apps", "SaaS for accountants",
  "government forms", "a ride-sharing startup", "a music school", "a hotel chain", "a non-profit", "an airline", "a car rental company", "a university"];
const FIX_THEMES = [
  "a storage migration (for example files on EFS or EBS that should move to S3, or the reverse when files must be shared by servers)",
  "a networking mistake (private subnets without endpoints or NAT, a database in a public subnet, missing Internet Gateway, wrong subnet for a load balancer)",
  "a reliability problem (single AZ, single instance, no Multi-AZ database, no load balancer)",
  "a security gap (database reachable from the internet, no WAF, secrets in code, public bucket)",
  "a scaling problem (servers doing work that should be queued, no cache for a read-heavy database, synchronous calls that should be events)",
  "a cost problem (servers running 24/7 for occasional jobs, NAT gateway used only for S3, Redshift for tiny ad-hoc queries)",
  "a wrong service choice (Kinesis where SQS fits, EKS for two containers, EC2 serving static files)",
  "a hybrid connectivity mistake (VPN without customer or virtual private gateway, overlapping IP ranges)",
];

// ---------- prompt (static, so it caches) ----------
function catalogText() {
  return S.SERVICE_LIST.filter((s) => !s.group).map((s) => {
    const flags = [s.vpc ? "lives in a subnet" : "", s.global ? "global" : "", s.ha === "azs" ? "AZ count via props.azs" : "", s.pub ? "can be internet-facing" : ""].filter(Boolean).join(", ");
    const to = S.typicalTargets(s.id, 14);
    return "- " + s.id + " = " + s.name + (flags ? " (" + flags + ")" : "") + (to.length ? ". Can send to: " + to.join(", ") : "");
  }).join("\n");
}
const SYSTEM = [
  "You write practice cases for an AWS architecture simulator. A learner reads your case, draws the architecture as a diagram of AWS services with arrows, and presses Play. The simulator checks every arrow and the networking against real AWS behaviour, then checks your requirements. Your case must be realistic, varied and solvable.",
  "",
  "# The diagram model",
  "- A node is one AWS service (or a client such as users). `svc` is its id from the catalog below. `key` is a short unique id you choose.",
  "- An edge {from, to} means `from` sends requests, data or events to `to` (WAF/Shield/ACM edges mean 'attached to'). Use the catalog's 'Can send to' lists: an edge that isn't allowed fails.",
  "- `zone` places a node in a network: \"pub\" = public subnet, \"priv\" = private subnet of VPC 1 (us-east-1); \"pub:2\" / \"priv:2\" = VPC 2 (us-west-2, the second region); \"edge\" = on the VPC border (use only for vgw, the Virtual Private Gateway). Use \"\" for everything outside a VPC: clients, regional services (S3, Lambda outside a VPC, DynamoDB, SQS...), global services.",
  "- Services marked 'lives in a subnet' MUST have a zone (except at beginner level, where you leave every zone empty). A Lambda function given zone \"priv\" is attached to the VPC; that is required for it to reach private resources like RDS.",
  "- VPC boxes, subnet boxes, the Internet Gateway, and the VPC endpoints / NAT gateway that private resources need to call AWS services are added automatically for the sample answer. Do not add igw. Only add gwendpoint/ifendpoint/nat yourself if the case is about them.",
  "- props is a list of {key, value} strings. Allowed keys: azs (\"1\"|\"2\"|\"3\": Availability Zones; for rds/aurora 2 = Multi-AZ / a replica in a second AZ), access (s3 only: \"private\"|\"presigned\"|\"website\"), functionUrl (lambda: \"true\"), crossRegion (rds/aurora: \"true\"), globalTables (dynamodb: \"true\"), launch (ecs: \"fargate\"|\"ec2\"), region (non-VPC regional services: \"primary\"|\"secondary\"), service (gwendpoint: \"s3\"|\"dynamodb\"; ifendpoint: a service id), vpcLink (apigw: \"true\"), cidr (onprem: e.g. \"192.168.0.0/16\").",
  "",
  "# Rules the simulator enforces (your sample answer must respect all of them)",
  "- Users/mobile can only reach internet-facing entry points: route53, cloudfront, ga, apigw, appsync, cognito, amplify, an s3 bucket with access presigned/website, an alb/nlb or ec2 in a \"pub\" zone, lambda with functionUrl. Never users -> database, queue or container.",
  "- alb needs azs \"2\" or more. Internet-facing load balancers go in \"pub\"; app servers, containers, databases, caches go in \"priv\".",
  "- ElastiCache does not read the database: connect the app to both. S3 does not push to servers or write to databases (use S3 -> lambda/sqs/eventbridge). Kinesis needs a consumer (lambda, firehose, flink). Cognito is used via apigw/appsync authorizer edges (apigw -> cognito).",
  "- Route 53 -> S3 requires access \"website\"; prefer users -> cloudfront -> s3. ACM certificates attach to cloudfront/alb/apigw (acm -> cloudfront).",
  "- API Gateway -> a private load balancer needs vpcLink \"true\".",
  "- Hybrid: onprem -> cgw -> vpn -> (resource in the VPC), plus a vgw with zone \"edge\". Direct Connect: onprem -> dx -> (resource in the VPC) with a vgw on the edge. Don't use Transit Gateway or VPC peering (they need VPC-box arrows the case format can't express).",
  "- High availability means azs \"2\" on alb, asg, ecs, rds/aurora, elasticache... (lambda, s3, dynamodb, sqs, sns, apigw are highly available by themselves). Use asg (Auto Scaling group), not a single ec2, for scalable server fleets.",
  "- Multi-region: put region-2 resources in pub:2/priv:2, and regional services with props region \"secondary\". Cross-region data copies are edges between two data stores (aurora -> aurora with crossRegion \"true\", s3 -> s3, dynamodb -> dynamodb with globalTables \"true\").",
  "",
  "# Requirements",
  "Each requirement is {text, hint, check}. `text` is what the learner must achieve, in plain words, without naming the exact service unless the story demands it. `hint` names the services/arrows that satisfy it. `check` is evaluated against the learner's diagram:",
  "- has {a}: at least one node matching a. none {a}: no node matches a (e.g. \"no servers\").",
  "- reach {a}: users or mobile reach a node in a through working arrows.",
  "- flow {a, b, via?}: a working path of arrows from any node in a to any node in b (through a node in via, if given).",
  "- direct {a, b}: a working arrow between a and b (either direction).",
  "- ha {a}: every node matching a is highly available (and at least one exists). private {a}: every node matching a is in a private subnet (or is a non-VPC service).",
  "- regionsAtLeast {a, n}: nodes matching a exist in at least n regions. countAtLeast {a, n}: at least n nodes match a.",
  "- prop {a, key, value}: some node in a has props[key] == value.",
  "Selectors in a/b/via are service ids (\"rds\") or tags (\"tag:sql\", \"tag:nosql\", \"tag:cache\", \"tag:vm\", \"tag:container\", \"tag:function\", \"tag:lb\", \"tag:queue\", \"tag:human\", \"tag:object\"). Accept every reasonable alternative (e.g. [\"rds\",\"aurora\"], or [\"tag:vm\",\"tag:container\",\"tag:function\"] for 'the app'). Unused fields: [] for lists, 0 for n, \"\" for key/value.",
  "",
  "# Case kinds",
  "- build: the learner starts from an empty canvas. `start` has empty nodes and edges.",
  "- fix: the learner starts from `start`, an existing architecture that is wrong, outdated or about to change. The story describes the company, what runs today, and the problem or change request the way a ticket or incident would (symptoms and goals, not the answer). `start` must FAIL the simulator (a broken rule, or a requirement it doesn't meet). `solution` is the corrected design and must pass. Keep start and solution recognisably the same system.",
  "",
  "# Output",
  "Return only the JSON object. `story` is 2-4 short paragraphs with concrete numbers (users, traffic, data size, RTO/RPO, budget) and a named fictional company. Titles are short (max 8 words). Vary industries and architectures; avoid the titles you are told to avoid.",
  "",
  "# Service catalog",
  catalogText(),
].join("\n");

// ---------- output schema ----------
const SVC_IDS = S.SERVICE_LIST.filter((s) => !s.group).map((s) => s.id);
const strList = { type: "array", items: { type: "string" } };
const GRAPH = {
  type: "object", additionalProperties: false, required: ["nodes", "edges"],
  properties: {
    nodes: {
      type: "array",
      items: {
        type: "object", additionalProperties: false, required: ["key", "svc", "zone", "label", "props"],
        properties: {
          key: { type: "string" }, svc: { type: "string", enum: SVC_IDS },
          zone: { type: "string", enum: ["", "pub", "priv", "edge", "pub:2", "priv:2", "edge:2"] },
          label: { type: "string" },
          props: { type: "array", items: { type: "object", additionalProperties: false, required: ["key", "value"], properties: { key: { type: "string" }, value: { type: "string" } } } },
        },
      },
    },
    edges: { type: "array", items: { type: "object", additionalProperties: false, required: ["from", "to"], properties: { from: { type: "string" }, to: { type: "string" } } } },
  },
};
const SCHEMA = {
  type: "object", additionalProperties: false,
  required: ["kind", "level", "title", "story", "requirements", "solution", "start"],
  properties: {
    kind: { type: "string", enum: ["build", "fix"] },
    level: { type: "string", enum: S.LEVELS },
    title: { type: "string" },
    story: strList,
    requirements: {
      type: "array",
      items: {
        type: "object", additionalProperties: false, required: ["text", "hint", "check"],
        properties: {
          text: { type: "string" }, hint: { type: "string" },
          check: {
            type: "object", additionalProperties: false, required: ["op", "a", "b", "via", "n", "key", "value"],
            properties: {
              op: { type: "string", enum: S.CHECK_OPS.filter((o) => o !== "attachedVpcsAtLeast") },
              a: strList, b: strList, via: strList, n: { type: "integer" }, key: { type: "string" }, value: { type: "string" },
            },
          },
        },
      },
    },
    solution: GRAPH,
    start: GRAPH,
  },
};

// the simulator's spec format uses [from, to] pairs and null zones
function normalize(spec) {
  const g = (x) => ({
    nodes: (x && x.nodes ? x.nodes : []).map((n) => ({ key: n.key, svc: n.svc, zone: n.zone || null, label: n.label || "", props: n.props || [] })),
    edges: (x && x.edges ? x.edges : []).map((e) => [e.from, e.to]),
  });
  return Object.assign({}, spec, { solution: g(spec.solution), start: g(spec.start) });
}

async function ask(client, messages) {
  const params = {
    model: MODEL,
    max_tokens: 16000,
    output_config: { effort: "medium", format: { type: "json_schema", schema: SCHEMA } },
    system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
    messages,
  };
  let response;
  try {
    response = await client.beta.messages.create(Object.assign({}, params, { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" }));
  } catch (err) {
    // If this account can't use server-side fallbacks, ask again without them.
    if (err instanceof Anthropic.BadRequestError && /fallback/i.test(String(err.message))) response = await client.messages.create(params);
    else throw err;
  }
  if (response.stop_reason === "refusal") throw Object.assign(new Error("Claude declined to write this case. Try again."), { status: 502 });
  if (response.stop_reason === "max_tokens") throw Object.assign(new Error("The case was too long and got cut off. Try again."), { status: 502 });
  const text = response.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  return { response, spec: JSON.parse(text) };
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") { res.status(405).json({ error: "Use POST." }); return; }
  if (!process.env.ANTHROPIC_API_KEY) { res.status(503).json({ error: "AI cases aren't set up: add ANTHROPIC_API_KEY in the Vercel project settings." }); return; }
  let body;
  try { body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {}; } catch (e) { res.status(400).json({ error: "The request was not valid JSON." }); return; }
  const code = process.env.SANDBOX_ACCESS_CODE;
  if (code && body.accessCode !== code) { res.status(401).json({ error: "This site needs an access code for AI cases.", needCode: true }); return; }

  const level = S.LEVELS.includes(body.level) ? body.level : "intermediate";
  const kind = body.kind === "fix" ? "fix" : "build";
  const avoid = (Array.isArray(body.avoid) ? body.avoid : []).slice(-12).map((t) => String(t).slice(0, 80));
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const ask0 = [
    "Write one new " + kind + " case at the " + level + " level.",
    "Level guidance: " + LEVEL_GUIDE[level],
    "Industry: " + pick(INDUSTRIES) + ".",
    kind === "fix" ? "The starting design should have " + pick(FIX_THEMES) + "." : "",
    avoid.length ? "Avoid these recent titles and their scenarios: " + avoid.join(" | ") + "." : "",
  ].filter(Boolean).join("\n");

  const client = new Anthropic();
  const messages = [{ role: "user", content: ask0 }];
  let last = null;
  try {
    for (let round = 1; round <= MAX_ROUNDS; round++) {
      const { response, spec } = await ask(client, messages);
      spec.kind = kind; spec.level = level;
      const norm = normalize(spec);
      const check = S.checkSpec(norm);
      if (check.ok) { res.status(200).json({ spec: norm, rounds: round }); return; }
      last = check.problems;
      messages.push({ role: "assistant", content: response.content });
      messages.push({ role: "user", content: "The simulator rejected this case:\n- " + check.problems.slice(0, 15).join("\n- ") + "\nFix the case (keep the same scenario if you can) and return the complete corrected JSON." });
    }
    res.status(502).json({ error: "Claude couldn't produce a case that passes the simulator this time. Try again.", problems: last });
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) res.status(429).json({ error: "Too many requests right now. Wait a minute and try again." });
    else if (err instanceof Anthropic.AuthenticationError) res.status(503).json({ error: "The ANTHROPIC_API_KEY on the server was rejected." });
    else if (err instanceof Anthropic.APIError) res.status(502).json({ error: "The Claude API returned an error (" + err.status + "). Try again." });
    else if (err instanceof SyntaxError) res.status(502).json({ error: "Claude's answer wasn't valid JSON. Try again." });
    else res.status(err.status || 500).json({ error: err.message || "Something went wrong." });
  }
};
