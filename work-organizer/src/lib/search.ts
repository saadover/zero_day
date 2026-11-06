// Forgiving keyword search: any word order, partial words, small typos, accents/case ignored,
// ranked so a hit in the question counts more than one in the answer.

/** "Accélérer DSA!" → "accelerer dsa" */
export const normalize = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const STOP = new Set([
  'a', 'an', 'the', 'to', 'of', 'in', 'on', 'for', 'and', 'or', 'is', 'are', 'do', 'does', 'how', 'what', 'can', 'we',
  'i', 'it', 'be', 'up', 'get', 'with', 'by', 'from', 'at', 'my', 'our', 'you', 'this', 'that', 'there',
  'le', 'la', 'les', 'de', 'des', 'du', 'un', 'une', 'et', 'ou', 'pour', 'comment', 'est', 'on', 'en', 'au', 'aux', 'que', 'qui',
]);

/** Search words from what was typed; common little words are skipped unless that's all there is. */
export function queryWords(q: string): string[] {
  const words = [...new Set(normalize(q).split(' ').filter(Boolean))];
  const meaningful = words.filter((w) => !STOP.has(w));
  return meaningful.length ? meaningful : words;
}

/** Words people use for the same thing (English + French). Add more as needed. */
const SYNONYMS: string[][] = [
  ['accelerate', 'speed', 'faster', 'fast', 'expedite', 'urgent', 'rush', 'quick', 'quickly', 'asap', 'accelerer', 'urgence', 'rapide'],
  ['send', 'submit', 'forward', 'share', 'email', 'envoyer', 'transmettre'],
  ['invoice', 'bill', 'billing', 'facture', 'facturation'],
  ['payment', 'pay', 'paid', 'paiement', 'payer', 'reglement'],
  ['delay', 'deadline', 'timeline', 'delai', 'duration', 'how long', 'sla'],
  ['contract', 'agreement', 'contrat', 'accord'],
  ['document', 'doc', 'file', 'form', 'fichier', 'formulaire'],
  ['approve', 'approval', 'validate', 'validation', 'sign', 'signature', 'valider'],
  ['cancel', 'stop', 'terminate', 'annuler', 'resilier'],
  ['client', 'customer', 'partner', 'partenaire'],
  ['error', 'issue', 'problem', 'bug', 'erreur', 'probleme'],
];
const SYN = new Map<string, string[]>();
for (const group of SYNONYMS) for (const w of group) SYN.set(w, group.filter((x) => x !== w && !x.includes(' ')));

const stem = (w: string) => (w.length > 4 && w.endsWith('s') ? w.slice(0, -1) : w);

function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      best = Math.min(best, cur[j]);
    }
    if (best > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

/** How well one typed word matches one word of the text: 1 exact … 0 no match. */
export function wordMatch(q: string, w: string): number {
  if (q === w || stem(q) === stem(w)) return 1;
  if (q.length >= 2 && w.startsWith(q)) return 0.85;          // "accel" → "accelerate"
  if (q.length >= 4 && w.length >= 4 && q.startsWith(w)) return 0.6; // "partners" typed, "partner" stored
  if (q.length >= 3 && w.includes(q)) return 0.6;             // "voice" → "invoices"
  const max = q.length >= 7 ? 2 : q.length >= 4 ? 1 : 0;      // small typos on longer words
  if (max && editDistance(q, w, max) <= max) return 0.55;
  return 0;
}

export interface Field { text: string; weight: number }

/**
 * Score a record against the typed words. 0 = not a result.
 * Every typed word must be found somewhere (in any field), except that one miss is forgiven
 * when 3 or more words were typed.
 */
export function scoreFields(words: string[], fields: Field[], phrase?: string): number {
  if (!words.length) return 0;
  const prepared = fields.map((f) => ({ weight: f.weight, norm: normalize(f.text), words: normalize(f.text).split(' ').filter(Boolean) }));
  let total = 0;
  let missed = 0;
  for (const q of words) {
    let best = 0;
    const alts = SYN.get(q) ?? SYN.get(stem(q)) ?? [];
    for (const f of prepared) for (const w of f.words) {
      let m = wordMatch(q, w);
      for (const a of alts) if (m < 0.7 && (a === w || stem(a) === stem(w) || (a.length >= 4 && w.startsWith(a)))) m = 0.7; // same meaning
      m *= f.weight;
      if (m > best) best = m;
    }
    if (best === 0) missed++;
    total += best;
  }
  if (missed > (words.length >= 3 ? 1 : 0)) return 0;
  // Bonus when the typed words appear together, as typed
  if (phrase && words.length > 1) {
    const p = normalize(phrase);
    for (const f of prepared) if (f.norm.includes(p)) { total += 2 * f.weight; break; }
  }
  return total * (1 - missed / (words.length + 1));
}

/** Does this text word match any typed word? (for highlighting) */
export const isHit = (word: string, words: string[]) => {
  const n = normalize(word);
  return !!n && words.some((q) => wordMatch(q, n) > 0 || (SYN.get(q) ?? []).some((a) => a === n || stem(a) === stem(n)));
};
