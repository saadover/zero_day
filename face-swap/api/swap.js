// POST /api/swap — starts one face swap on Replicate and answers with the
// prediction id right away; the page then polls /api/status with it.
// Body: { target, face, consent } where target and face are image data URLs
// (the page shrinks them to 1024px JPEGs first) and consent must be true.

const { MODEL_VERSION, checkAccess, token, replicate } = require("../lib/replicate");

const DATA_URL_RE = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/;
const MAX_IMAGE = 2_000_000; // characters of data URL, about 1.5 MB of image

function image(v) {
  return typeof v === "string" && v.length <= MAX_IMAGE && DATA_URL_RE.test(v) ? v : null;
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Use POST." });
    return;
  }
  if (!checkAccess(req, res)) return;
  const key = token(res);
  if (!key) return;

  let body;
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  } catch (e) {
    res.status(400).json({ error: "The request was not valid JSON." });
    return;
  }
  if (body.consent !== true) {
    res.status(400).json({ error: "Confirm that everyone in the photos agreed to this." });
    return;
  }
  const target = image(body.target);
  const face = image(body.face);
  if (!target || !face) {
    res.status(400).json({ error: "Send two JPEG, PNG or WebP images, each under 1.5 MB." });
    return;
  }

  try {
    const p = await replicate("/predictions", key, {
      method: "POST",
      body: JSON.stringify({ version: MODEL_VERSION, input: { input_image: target, swap_image: face } }),
    });
    res.status(200).json({ id: p.id, status: p.status });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
};
