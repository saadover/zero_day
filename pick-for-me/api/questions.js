// POST /api/questions — given the two options, asks Jev how much each
// question in lib/questions.js would help with this decision and returns the
// ones worth asking, most useful first.

const { QUESTIONS, publicQuestion } = require("../lib/questions");
const { askJev, readBody, readDecision, FAILED } = require("../lib/jev");

const MAX_ASKED = 6;
const MIN_ASKED = 2;
const LEVELS = [
  "Not relevant: the answer would not change which option is better.",
  "Slightly relevant: it might nudge the choice a little.",
  "Useful: the answer could well change which option is better.",
  "Essential: the choice can't be made well without knowing this.",
];

// A Score answer as 0..1, using its own legend whatever the level numbering.
function unit(answer) {
  const levels = Object.keys(answer.legend).map(Number).sort((a, b) => a - b);
  const lo = levels[0], hi = levels[levels.length - 1];
  return hi > lo ? Math.max(0, Math.min(1, (answer.score - lo) / (hi - lo))) : 0;
}

function relevanceQuestions() {
  const q = {};
  for (const [id, item] of Object.entries(QUESTIONS)) {
    q[id] = {
      type: "score",
      instructions:
        "Someone can't choose between `decision.option_a` and `decision.option_b` (the decision: " +
        "`decision.question`). How much would asking them \"" + item.title + "\" help pick the right " +
        "option for them? It tends to matter when: " + item.relevance,
      criteria: LEVELS,
    };
  }
  return q;
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Use POST." });
    return;
  }
  let decision;
  try {
    decision = readDecision(readBody(req));
  } catch (e) {
    decision = null;
  }
  if (!decision) {
    res.status(400).json({ error: "Write both options first." });
    return;
  }
  try {
    const answers = await askJev({ decision }, relevanceQuestions());
    const ranked = Object.keys(QUESTIONS)
      .filter((id) => answers[id])
      .map((id) => ({ id, value: unit(answers[id]) }))
      // Religion only when faith clearly bears on the choice.
      .filter((r) => r.id !== "religion" || r.value >= 0.9)
      .sort((a, b) => b.value - a.value);
    let chosen = ranked.filter((r) => r.value >= 0.6).slice(0, MAX_ASKED);
    if (chosen.length < MIN_ASKED) chosen = ranked.slice(0, MIN_ASKED);
    res.status(200).json({ questions: chosen.map((r) => publicQuestion(r.id)) });
  } catch (e) {
    console.error(e);
    res.status(502).json({ error: FAILED });
  }
};
