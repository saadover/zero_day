// Checks whether each domain is already registered, then asks TypeSafe's Jev
// model to judge only the available ones, so taken names cost no Jev usage.
// Runs on the server so the API key never reaches the browser. Reads the key
// from TYPESAFE_API_KEY.

const net = require("net");

const API_URL = process.env.TYPESAFE_API_URL || "https://api.typesafe.ai/v1/systemone";
const MODEL = "jev-latest";
const MAX_DOMAINS = 50;
const PARALLEL = 5;
const TIMEOUT_MS = 8000;

// Fallback whois servers for when a registry's RDAP lookup is missing or fails.
const WHOIS_SERVERS = { com: "whois.verisign-grs.com", ai: "whois.nic.ai" };
const NOT_FOUND = /^\s*(no match for|not found|domain not found|no object found|no data found|no entries found)/im;

let rdapServices = null;

// IANA publishes which RDAP server answers for each extension.
async function rdapBase(tld) {
  if (!rdapServices) {
    const res = await fetch("https://data.iana.org/rdap/dns.json", { signal: AbortSignal.timeout(TIMEOUT_MS) });
    rdapServices = (await res.json()).services;
  }
  const service = rdapServices.find(([tlds]) => tlds.includes(tld));
  if (!service) return null;
  const url = service[1].find((u) => u.startsWith("https")) || service[1][0];
  return url.endsWith("/") ? url : url + "/";
}

function whois(host, query) {
  return new Promise((resolve, reject) => {
    const socket = net.connect(43, host);
    let out = "";
    socket.setTimeout(TIMEOUT_MS, () => { socket.destroy(); reject(new Error("whois timeout")); });
    socket.on("connect", () => socket.write(query + "\r\n"));
    socket.on("data", (chunk) => { out += chunk; });
    socket.on("end", () => resolve(out));
    socket.on("error", reject);
  });
}

// Returns { status, source } where status is "available", "taken" or
// "unknown". A name only counts as available on a clear "not registered"
// answer; anything unclear is "unknown" so it never reaches Jev by mistake.
// An RDAP 404 means no one has registered the name; a registry may still
// price it as premium.
async function availability(domain) {
  const tld = domain.slice(domain.indexOf(".") + 1);
  try {
    const base = await rdapBase(tld);
    if (base) {
      const res = await fetch(base + "domain/" + encodeURIComponent(domain), {
        headers: { Accept: "application/rdap+json" },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      const source = "registry RDAP (" + new URL(base).hostname + ")";
      if (res.status === 404) return { status: "available", source };
      if (res.ok) return { status: "taken", source };
    }
  } catch (e) {
    // fall through to whois
  }
  if (WHOIS_SERVERS[tld]) {
    try {
      const source = "whois (" + WHOIS_SERVERS[tld] + ")";
      const text = await whois(WHOIS_SERVERS[tld], tld === "com" ? "domain " + domain : domain);
      const escaped = domain.replace(/[.]/g, "\\.");
      if (new RegExp("^\\s*domain name:\\s*" + escaped + "\\s*$", "im").test(text)) return { status: "taken", source };
      if (NOT_FOUND.test(text)) return { status: "available", source };
    } catch (e) {
      // unknown
    }
  }
  return { status: "unknown", source: "no registry answered clearly" };
}

const INDUSTRIES = {
  "Finance": "Banking, payments, lending, investing, insurance or crypto.",
  "Health & fitness": "Medicine, dental, wellness, fitness, diet or beauty.",
  "Tech & AI": "Software, apps, AI, data, cloud, hosting or devices.",
  "Real estate & home": "Property, rentals, home improvement, furniture or gardening.",
  "Shopping": "Online stores, deals, marketplaces or retail products.",
  "Travel": "Trips, hotels, flights, tourism or transport.",
  "Food": "Restaurants, recipes, groceries, cafes or delivery.",
  "Energy & green": "Solar, power, fuel, recycling or sustainability.",
  "Media & creative": "Video, music, news, design, art or entertainment.",
  "Education & jobs": "Schools, courses, tutoring, hiring or careers.",
  "General": "No single industry stands out; the name could suit many kinds of business.",
};

function questions() {
  return {
    brand: {
      type: "score",
      instructions:
        "As an experienced domain investor, rate how valuable `domain` would be as a brand name " +
        "for a business that might buy it from you.",
      criteria: [
        "Unusable as a brand: long, spammy, awkward, confusing or clearly low quality.",
        "Weak: generic or clunky; few businesses would build a brand on it.",
        "Decent: a usable brand name with some clear drawbacks.",
        "Strong: short, memorable and fits an obvious kind of business.",
        "Premium: the kind of name established companies and startups pay thousands for.",
      ],
    },
    say: {
      type: "score",
      instructions:
        "Rate how easily a person who hears the name in `domain` said out loud once could say it " +
        "and type it correctly (the radio test).",
      criteria: [
        "Fails: most people could not pronounce it or would misspell it.",
        "Hard: many people would hesitate or misspell it.",
        "Mostly fine: small spelling doubts, such as a homophone or unusual letter.",
        "Passes: almost anyone would say and spell it correctly.",
      ],
    },
    trademark: {
      type: "noul",
      instructions:
        "Does `domain` contain or closely imitate the name of a well-known company, product or brand, " +
        "so that registering it could infringe that brand's trademark?",
    },
    industry: {
      type: "choice",
      instructions: "Which kind of business would be the most likely buyer of `domain`?",
      criteria: INDUSTRIES,
    },
  };
}

async function askJev(domain, key) {
  const [name, ...rest] = domain.split(".");
  const body = JSON.stringify({
    state: { domain, name_part: name, extension: "." + rest.join(".") },
    model: MODEL,
    questions: questions(),
  });
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
      body,
    });
    if ((res.status === 429 || res.status === 529) && attempt < 3) {
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
      continue;
    }
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      const err = new Error("TypeSafe returned " + res.status + (text ? ": " + text.slice(0, 300) : ""));
      err.status = res.status;
      throw err;
    }
    return toJudgments((await res.json()).answers);
  }
}

// Turns a Score answer into 0..1 using its own legend, whatever the level numbering.
function unit(answer) {
  const levels = Object.keys(answer.legend).map(Number).sort((a, b) => a - b);
  const lo = levels[0], hi = levels[levels.length - 1];
  const nearest = String(levels.reduce((a, b) => (Math.abs(b - answer.score) < Math.abs(a - answer.score) ? b : a)));
  return {
    value: hi > lo ? Math.max(0, Math.min(1, (answer.score - lo) / (hi - lo))) : 0,
    level: answer.legend[nearest],
    confidence: answer.confidence,
  };
}

function toJudgments(a) {
  return {
    brand: unit(a.brand),
    say: unit(a.say),
    trademark: a.trademark.noul,
    industry: a.industry.choice,
    industryConfidence: a.industry.confidence,
  };
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Use POST." });
    return;
  }
  const key = process.env.TYPESAFE_API_KEY;
  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  const domains = Array.isArray(body.domains) ? body.domains.filter((d) => typeof d === "string") : [];
  if (!domains.length || domains.length > MAX_DOMAINS) {
    res.status(400).json({ error: "Send between 1 and " + MAX_DOMAINS + " domains at a time." });
    return;
  }

  const results = {};
  let next = 0;
  let fatal = null;
  async function worker() {
    while (next < domains.length && !fatal) {
      const domain = domains[next++];
      const check = await availability(domain);
      const entry = { availability: check.status, checkedWith: check.source };
      if (entry.availability === "available" && key) {
        try {
          Object.assign(entry, await askJev(domain, key));
        } catch (e) {
          if (e.status === 401) fatal = "TypeSafe rejected the API key. Check TYPESAFE_API_KEY.";
          entry.error = e.message;
        }
      }
      results[domain] = entry;
    }
  }
  await Promise.all(Array.from({ length: Math.min(PARALLEL, domains.length) }, worker));

  if (fatal) {
    res.status(502).json({ error: fatal });
    return;
  }
  res.status(200).json({ model: MODEL, jev: Boolean(key), results });
};
