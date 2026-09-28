// POST /api/decide — asks Jev to choose between the two options for this
// person, from their answers to the questions /api/questions picked, and to
// compare the options on each answer so the page can say why.

const { QUESTIONS, GENERAL } = require("../lib/questions");
const { askJev, readBody, readDecision, text, FAILED } = require("../lib/jev");

const SIDES = {
  a: "`decision.option_a` is clearly better on this.",
  b: "`decision.option_b` is clearly better on this.",
  even: "Neither is clearly better, or this does not apply to the decision.",
};

function allowed(q, decision) {
  return (q.options || []).map((o) => {
    const label = Array.isArray(o) ? o[0] : o;
    return label === "{a}" ? decision.option_a : label === "{b}" ? decision.option_b : label;
  });
}

// Keeps only answers to known questions, in the shape each question expects.
function readAnswers(raw, decision) {
  const out = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [id, value] of Object.entries(raw)) {
    const q = QUESTIONS[id];
    if (!q) continue;
    if (q.type === "number") {
      const n = Math.round(Number(value));
      if (n >= 5 && n <= 120) out[id] = n;
    } else if (q.type === "text") {
      const t = text(value, 400);
      if (t) out[id] = t;
    } else if (q.type === "multi") {
      const ok = allowed(q, decision);
      const list = Array.isArray(value) ? value.filter((v) => ok.includes(v)).slice(0, q.max || ok.length) : [];
      if (list.length) out[id] = list;
    } else if (allowed(q, decision).includes(value)) {
      out[id] = value;
    }
  }
  return out;
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Use POST." });
    return;
  }
  let body, decision;
  try {
    body = readBody(req);
    decision = readDecision(body);
  } catch (e) {
    decision = null;
  }
  if (!decision) {
    res.status(400).json({ error: "Write both options first." });
    return;
  }
  const answers = readAnswers(body.answers, decision);
  const person = { ...answers, notes: text(body.notes, 600) || "none" };

  const factors = {};
  for (const id of Object.keys(answers)) if (QUESTIONS[id].factor) factors[id] = QUESTIONS[id];
  Object.assign(factors, GENERAL);

  const questions = {
    pick: {
      type: "choice",
      instructions: {
        question:
          "The person in `person` cannot choose between `decision.option_a` and `decision.option_b`" +
          " (the decision: `decision.question`). Weighing everything they told you in `person`, " +
          "including `person.notes`, which option should they choose?",
      },
      criteria: {
        a: "They should choose `decision.option_a`.",
        b: "They should choose `decision.option_b`.",
      },
    },
  };
  for (const [id, f] of Object.entries(factors)) {
    questions["f_" + id] = { type: "choice", instructions: { question: f.factor }, criteria: SIDES };
  }

  try {
    const a = await askJev({ decision, person }, questions);
    const pick = a.pick.choice === "b" ? "b" : "a";
    const other = pick === "a" ? "b" : "a";
    const reasons = [];
    const tradeoffs = [];
    for (const [id, f] of Object.entries(factors)) {
      const side = a["f_" + id] && a["f_" + id].choice;
      const why = f.why(answers[id]);
      if (side === pick) reasons.push(why);
      else if (side === other) tradeoffs.push(why);
    }
    const probability = a.pick.probabilities && a.pick.probabilities[pick];
    res.status(200).json({
      pick,
      choice: decision["option_" + pick],
      other: decision["option_" + other],
      probability: typeof probability === "number" ? probability : null,
      reasons,
      tradeoffs,
    });
  } catch (e) {
    console.error(e);
    res.status(502).json({ error: FAILED });
  }
};
