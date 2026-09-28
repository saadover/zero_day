// Sends one set of questions to Jev and returns its answers. Reads the key
// from TYPESAFE_API_KEY. Errors carry details for the server log only; the
// page shows a plain message.

const API_URL = process.env.TYPESAFE_API_URL || "https://api.typesafe.ai/v1/systemone";
const MODEL = "jev-latest";

async function askJev(state, questions) {
  const key = process.env.TYPESAFE_API_KEY;
  if (!key) throw new Error("TYPESAFE_API_KEY is missing on the server.");
  const body = JSON.stringify({ state, model: MODEL, questions });
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
    if (res.status === 401) throw new Error("TypeSafe rejected the API key. Check TYPESAFE_API_KEY.");
    if (!res.ok) throw new Error("TypeSafe answered " + res.status + ": " + (await res.text()).slice(0, 300));
    return (await res.json()).answers;
  }
}

function readBody(req) {
  return typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
}

function text(v, max) {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

// The two options and what the person is deciding, cleaned up.
function readDecision(body) {
  const d = body.decision || {};
  const decision = {
    question: text(d.question, 200) || "Which of the two to choose",
    option_a: text(d.option_a, 200),
    option_b: text(d.option_b, 200),
  };
  return decision.option_a && decision.option_b ? decision : null;
}

const FAILED = "Something went wrong on our side. Please try again in a moment.";

module.exports = { askJev, readBody, readDecision, text, FAILED };
