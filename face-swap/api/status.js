// GET /api/status?id=… — where one face swap is up to: starting (waiting for
// a GPU), processing, succeeded, failed or canceled.

const { ID_RE, checkAccess, token, getPrediction } = require("../lib/replicate");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Use GET." });
    return;
  }
  if (!checkAccess(req, res)) return;
  const key = token(res);
  if (!key) return;
  const id = String(req.query.id || "");
  if (!ID_RE.test(id)) {
    res.status(400).json({ error: "Missing or malformed id." });
    return;
  }

  try {
    const p = await getPrediction(id, key);
    let error = p.error ? String(p.error).slice(0, 300) : null;
    if (p.status === "succeeded" && !p.output) error = "The model found no face to swap.";
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({ status: error ? "failed" : p.status, error });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
};
