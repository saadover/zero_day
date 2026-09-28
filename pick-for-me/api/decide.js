// POST /api/decide — asks Jev to choose between two options for one person,
// from their answers (age, beliefs, priorities, budget, appetite for risk),
// and to compare the options on each factor so the page can say why.
// Reads the key from TYPESAFE_API_KEY.

const API_URL = process.env.TYPESAFE_API_URL || "https://api.typesafe.ai/v1/systemone";
const MODEL = "jev-latest";
const MAX_TEXT = 200;
const MAX_NOTES = 600;

// Each factor becomes one Jev question: which option is better on it for
// this person. `why` is the reason shown under the winning option.
const FACTORS = {
  priorities: {
    ask: "Which option better serves what matters most to the person, listed in `person.priorities`?",
    why: (p) => "Serves what matters most to you" + (p.priorities.length ? " (" + p.priorities.join(", ").toLowerCase() + ")" : ""),
  },
  values: {
    ask:
      "Which option fits better with the person's beliefs and values in `person.religion`? If the " +
      "person is not religious or did not say, judge by their general values instead.",
    why: (p) => (p.religion && !/^(not religious|prefer not to say)$/i.test(p.religion)
      ? "Fits better with your faith (" + p.religion + ")"
      : "Fits better with your values"),
  },
  life_stage: {
    ask: "Which option suits someone of `person.age` years old better, at this stage of life?",
    why: (p) => "Suits where you are in life at " + p.age,
  },
  money: {
    ask: "Which option is the better use of money for someone whose budget is `person.budget`?",
    why: (p) => "Easier on your budget (" + p.budget.toLowerCase() + ")",
  },
  risk: {
    ask: "Which option better matches the person's appetite for risk, `person.risk`?",
    why: (p) => "Matches how much risk you like to take (" + p.risk.toLowerCase() + ")",
  },
  long_term: {
    ask: "Which option is likely to leave the person better off in five years?",
    why: () => "Better for you in the long run",
  },
  happiness: {
    ask: "Which option is likely to make the person happier day to day?",
    why: () => "Likely to make you happier day to day",
  },
  regret: {
    ask: "Which option would the person be more likely to regret NOT choosing?",
    why: () => "The one you'd regret passing up",
  },
};

const SIDES = {
  a: "`decision.option_a` is clearly better on this.",
  b: "`decision.option_b` is clearly better on this.",
  even: "Neither is clearly better, or this does not apply to the decision.",
};

function questions() {
  const q = {
    pick: {
      type: "choice",
      instructions: {
        question:
          "The person in `person` cannot choose between `decision.option_a` and `decision.option_b`" +
          " (the decision: `decision.question`). Weighing their age, beliefs, priorities, budget, " +
          "appetite for risk and `person.notes`, which option should they choose?",
      },
      criteria: {
        a: "They should choose `decision.option_a`.",
        b: "They should choose `decision.option_b`.",
      },
    },
  };
  for (const [id, f] of Object.entries(FACTORS)) {
    q[id] = { type: "choice", instructions: { question: f.ask }, criteria: SIDES };
  }
  return q;
}

async function askJev(state, key) {
  const body = JSON.stringify({ state, model: MODEL, questions: questions() });
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

function text(v, max) {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Use POST." });
    return;
  }
  const key = process.env.TYPESAFE_API_KEY;
  if (!key) {
    res.status(503).json({ error: "The TYPESAFE_API_KEY setting is missing on the server." });
    return;
  }
  let body;
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  } catch (e) {
    res.status(400).json({ error: "The request was not valid JSON." });
    return;
  }
  const d = body.decision || {};
  const p = body.person || {};
  const decision = {
    question: text(d.question, MAX_TEXT) || "Which of the two to choose",
    option_a: text(d.option_a, MAX_TEXT),
    option_b: text(d.option_b, MAX_TEXT),
  };
  if (!decision.option_a || !decision.option_b) {
    res.status(400).json({ error: "Send both options." });
    return;
  }
  const age = Math.round(Number(p.age));
  const person = {
    age: age >= 5 && age <= 120 ? age : "not given",
    religion: text(p.religion, 60) || "Prefer not to say",
    priorities: Array.isArray(p.priorities) ? p.priorities.map((x) => text(x, 40)).filter(Boolean).slice(0, 5) : [],
    budget: text(p.budget, 40) || "not given",
    risk: text(p.risk, 40) || "not given",
    notes: text(p.notes, MAX_NOTES) || "none",
  };

  try {
    const a = await askJev({ decision, person }, key);
    const pick = a.pick.choice;
    const other = pick === "a" ? "b" : "a";
    const reasons = [];
    const tradeoffs = [];
    for (const [id, f] of Object.entries(FACTORS)) {
      const side = a[id] && a[id].choice;
      // Skip factors the person didn't answer, so no reason reads "(not given)".
      if ((id === "life_stage" && person.age === "not given") ||
          (id === "money" && person.budget === "not given") ||
          (id === "risk" && person.risk === "not given")) continue;
      if (side === pick) reasons.push(f.why(person));
      else if (side === other) tradeoffs.push(f.why(person));
    }
    const probability = a.pick.probabilities && a.pick.probabilities[pick];
    res.status(200).json({
      model: MODEL,
      pick,
      choice: decision["option_" + pick],
      other: decision["option_" + other],
      probability: typeof probability === "number" ? probability : null,
      confidence: a.pick.confidence,
      reasons,
      tradeoffs,
    });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
};
