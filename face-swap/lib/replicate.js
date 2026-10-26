// Shared by the api/ functions: the optional access code, and calls to
// Replicate (which runs the face-swap model on its GPUs).
// Reads the key from REPLICATE_API_TOKEN.

const crypto = require("crypto");

const API_URL = "https://api.replicate.com/v1";

// cdingram/face-swap (InsightFace inswapper). Any Replicate model that takes
// `input_image` (the photo to edit) and `swap_image` (the face to put in) and
// returns one image URL works; set REPLICATE_MODEL_VERSION to switch.
const MODEL_VERSION =
  process.env.REPLICATE_MODEL_VERSION || "d1d6ea8c8be89d664a07a457526f7128109dee7030fdac424788d762c71ed111";

// Prediction ids are short lowercase letters and digits.
const ID_RE = /^[a-z0-9]{10,40}$/;

// When ACCESS_CODE is set, every request must carry it in the
// X-Access-Code header, so strangers can't spend your Replicate credit.
// Answers 401 and returns false when it's missing or wrong.
function checkAccess(req, res) {
  const code = process.env.ACCESS_CODE;
  if (!code) return true;
  const given = String(req.headers["x-access-code"] || "");
  const a = crypto.createHash("sha256").update(given).digest();
  const b = crypto.createHash("sha256").update(code).digest();
  if (crypto.timingSafeEqual(a, b)) return true;
  res.status(401).json({ error: given ? "That access code is wrong." : "This site needs an access code.", needsCode: true });
  return false;
}

// Answers 503 and returns null when the token isn't set on the server.
function token(res) {
  const t = process.env.REPLICATE_API_TOKEN;
  if (!t) res.status(503).json({ error: "The REPLICATE_API_TOKEN setting is missing on the server." });
  return t || null;
}

async function replicate(path, key, init = {}) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(API_URL + path, {
      ...init,
      headers: { Authorization: "Bearer " + key, "Content-Type": "application/json", ...init.headers },
    });
    if (res.status === 429 && attempt < 3) {
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
      continue;
    }
    if (res.status === 401) throw new Error("Replicate rejected the API token. Check REPLICATE_API_TOKEN.");
    if (res.status === 402) throw new Error("Your Replicate account is out of credit. Add billing at replicate.com.");
    if (!res.ok) throw new Error("Replicate answered " + res.status + ": " + (await res.text()).slice(0, 300));
    return res.json();
  }
}

function getPrediction(id, key) {
  return replicate("/predictions/" + id, key);
}

module.exports = { MODEL_VERSION, ID_RE, checkAccess, token, replicate, getPrediction };
