// GET /api/image?id=… — the finished image of one face swap. It passes
// through here, rather than the page loading Replicate's link itself, so the
// page can draw it on a canvas and stamp the "AI-generated" label on it.

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
    const url = Array.isArray(p.output) ? p.output[0] : p.output;
    if (p.status !== "succeeded" || typeof url !== "string" || !url.startsWith("https://")) {
      res.status(409).json({ error: "This swap has no finished image." });
      return;
    }
    const img = await fetch(url);
    if (!img.ok) throw new Error("Couldn't download the result (" + img.status + "). Replicate keeps it for one hour.");
    res.setHeader("Content-Type", img.headers.get("content-type") || "image/png");
    res.setHeader("Cache-Control", "private, no-store");
    res.status(200).send(Buffer.from(await img.arrayBuffer()));
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
};
