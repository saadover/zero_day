// POST /api/check { words: ["zenpay", ...] } — looks each word up as a .si
// domain with the official .si registry (Arnes) and reports whether it is
// registered. Uses the registry's RDAP service when IANA lists one, and its
// WHOIS service (whois.register.si, port 43) otherwise. No API key needed.

const net = require("net");
const { domainToASCII } = require("url");

const MAX_WORDS = 25;
const PARALLEL = 3;
const TIMEOUT_MS = 8000;
const WHOIS_HOST = process.env.SI_WHOIS_HOST || "whois.register.si";
const WHOIS_PORT = Number(process.env.SI_WHOIS_PORT || 43);
const NOT_FOUND = /no entries found|not found|no match|no data found/i;

let rdapBase; // undefined: not looked up yet; null: .si has no RDAP service

async function siRdapBase() {
  if (rdapBase !== undefined) return rdapBase;
  try {
    const res = await fetch("https://data.iana.org/rdap/dns.json", { signal: AbortSignal.timeout(TIMEOUT_MS) });
    const service = (await res.json()).services.find(([tlds]) => tlds.includes("si"));
    const url = service ? service[1].find((u) => u.startsWith("https")) || service[1][0] : null;
    rdapBase = url ? (url.endsWith("/") ? url : url + "/") : null;
  } catch (e) {
    return null; // try again on the next request
  }
  return rdapBase;
}

function whois(query) {
  return new Promise((resolve, reject) => {
    const socket = net.connect(WHOIS_PORT, WHOIS_HOST);
    let out = "";
    socket.setTimeout(TIMEOUT_MS, () => { socket.destroy(); reject(new Error("The registry didn't answer in time.")); });
    socket.on("connect", () => socket.write(query + "\r\n"));
    socket.on("data", (chunk) => { out += chunk; });
    socket.on("end", () => resolve(out));
    socket.on("error", (e) => reject(new Error("Couldn't reach the registry (" + e.code + ").")));
  });
}

// The first line of a WHOIS reply that isn't a comment, to explain an unclear answer.
function firstLine(text) {
  const line = text.split("\n").map((l) => l.replace(/^%+\s*/, "").trim()).find((l) => l && !/copyright|terms|arnes/i.test(l));
  return line ? line.slice(0, 160) : "The registry sent an empty reply.";
}

// Returns { status: "available" | "taken" | "unknown", source, note }.
// A name only counts as available on a clear "not registered" answer.
async function check(domain) {
  const base = await siRdapBase();
  if (base) {
    try {
      const res = await fetch(base + "domain/" + domain, {
        headers: { Accept: "application/rdap+json" },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      const source = "registry RDAP (" + new URL(base).hostname + ")";
      if (res.status === 404) return { status: "available", source };
      if (res.ok) return { status: "taken", source };
    } catch (e) {
      // fall through to WHOIS
    }
  }
  const source = "registry WHOIS (" + WHOIS_HOST + ")";
  try {
    const text = await whois(domain);
    const escaped = domain.replace(/[.]/g, "\\.");
    if (new RegExp("^\\s*domain(?: name)?:\\s*" + escaped + "\\s*$", "im").test(text)) return { status: "taken", source };
    if (NOT_FOUND.test(text)) return { status: "available", source };
    return { status: "unknown", source, note: firstLine(text) };
  } catch (e) {
    return { status: "unknown", source, note: e.message };
  }
}

// "Zen Pay.si" -> "zenpay.si"; Slovenian letters become their xn-- form.
function toDomain(word) {
  const label = String(word).trim().toLowerCase().replace(/\.si$/, "").replace(/\s+/g, "");
  if (!label || label.includes(".") || /^-|-$/.test(label)) return null;
  const ascii = domainToASCII(label + ".si");
  if (!ascii || !/^[a-z0-9-]{1,63}\.si$/.test(ascii)) return null;
  return ascii;
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Use POST." });
    return;
  }
  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  const words = Array.isArray(body.words) ? body.words.filter((w) => typeof w === "string") : [];
  if (!words.length || words.length > MAX_WORDS) {
    res.status(400).json({ error: "Send between 1 and " + MAX_WORDS + " words at a time." });
    return;
  }

  const results = new Array(words.length);
  let next = 0;
  async function worker() {
    while (next < words.length) {
      const i = next++;
      const domain = toDomain(words[i]);
      results[i] = domain
        ? Object.assign({ word: words[i], domain }, await check(domain))
        : { word: words[i], domain: null, status: "invalid", note: "Not a valid domain name." };
    }
  }
  await Promise.all(Array.from({ length: Math.min(PARALLEL, words.length) }, worker));
  res.status(200).json({ results });
};
