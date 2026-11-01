<?php
// The gift finder.
//
// 1. Hard rules (never broken): only products tagged for this gender (or
//    unisex), for this age, for this relationship (or "anyone"), in stock and
//    inside the budget. A man never gets a dress, a 6-year-old never gets
//    perfume, nothing over budget.
// 2. The free text is read in English, French and Darija (Latin or Arabic
//    letters) to find interests, dislikes and the occasion, which gives each
//    product a quick local score.
// 3. Jev (TypeSafe) then rates the best candidates against the whole
//    description, and the two scores are combined. If Jev can't be reached the
//    local score is used on its own, so the finder always answers.
// 4. When few products pass every rule, the closest ones are added in their
//    own group, each saying what differs (a bit over budget, made for another
//    age…). Gender is never relaxed: those would be wrong, not close.

const FINDER_MAX_JEV = 24;      // candidates sent to Jev per search
const FINDER_MAX_RESULTS = 15;  // 3 top picks + up to 12 more
const FINDER_MAX_CLOSE = 6;     // "close to your criteria" alternatives
const FINDER_RATE = 20;         // searches per IP per 10 minutes (cached repeats are free)

function norm_text(string $s): string
{
    $s = mb_strtolower($s, 'UTF-8');
    $s = strtr($s, [
        'à' => 'a', 'â' => 'a', 'ä' => 'a', 'á' => 'a', 'é' => 'e', 'è' => 'e', 'ê' => 'e', 'ë' => 'e',
        'î' => 'i', 'ï' => 'i', 'í' => 'i', 'ô' => 'o', 'ö' => 'o', 'ó' => 'o', 'ù' => 'u', 'û' => 'u',
        'ü' => 'u', 'ú' => 'u', 'ç' => 'c', 'œ' => 'oe', '’' => "'", 'ʼ' => "'",
        'أ' => 'ا', 'إ' => 'ا', 'آ' => 'ا', 'ٱ' => 'ا', 'ة' => 'ه', 'ى' => 'ي', 'ؤ' => 'و', 'ئ' => 'ي', 'ـ' => '',
        'گ' => 'ك', 'ڭ' => 'ك', 'ڤ' => 'ف', 'پ' => 'ب',
    ]);
    $s = preg_replace('/[\x{064B}-\x{065F}\x{0670}]/u', '', $s); // Arabic diacritics
    return trim(preg_replace('/\s+/u', ' ', $s));
}

// Does $kw appear in $text as a word? Latin keywords may take a short ending
// (plurals, "voyager" for "voyage"); short ones must match exactly. Arabic
// keywords may take a prefix such as ال or و.
// A keyword starting with "=" must match exactly (no endings): "=mari" finds
// "mari" (husband) but not "mariage" (wedding).
function kw_regex(string $kw): string
{
    $exact = str_starts_with($kw, '=');
    $kw = norm_text(ltrim($kw, '='));
    $q = preg_quote($kw, '/');
    $q = str_replace('\ ', '\s?', $q);
    if (preg_match('/\p{Arabic}/u', $kw)) {
        return '/(?<![\p{Arabic}])(?:ال|و|ل|ب|ف)?' . $q . '(?:ه|ها|هم|ات|ين)?(?![\p{Arabic}])/u';
    }
    $suffix = ($exact || mb_strlen($kw) <= 3) ? '' : '[a-z]{0,3}';
    return '/(?<![\p{L}\p{N}])' . $q . $suffix . '(?![\p{L}\p{N}])/u';
}

// Splits the description into clauses and finds what the person likes,
// dislikes and what the occasion is.
function read_notes(string $note): array
{
    $out = ['likes' => [], 'dislikes' => [], 'occasions' => [], 'words' => []];
    $text = norm_text($note);
    if ($text === '') return $out;

    // Occasions first, longest keywords first, and remove what matched so
    // "3id milad" (birthday) is not also read as "3id" (Eid).
    $occ = [];
    foreach (occasions() as $key => $o) foreach ($o['kw'] as $kw) $occ[] = [$key, $kw];
    usort($occ, fn($a, $b) => mb_strlen($b[1]) <=> mb_strlen($a[1]));
    $rest = $text;
    foreach ($occ as [$key, $kw]) {
        $re = kw_regex($kw);
        if (preg_match($re, $rest)) {
            $out['occasions'][$key] = true;
            $rest = preg_replace($re, ' ', $rest);
        }
    }

    $clauses = preg_split('/[.,;:!?\n()،؛؟]+|\s(?:mais|but|walakin|walakine|walakine|lakin|lakine|however|cependant|sauf|except|par contre|wlakin|ولكن|لكن|ولاكن|بصح|غير)\s/u', ' ' . $rest . ' ');
    $neg = '/(?<![\p{L}])(?:pas|jamais|aucun|aucune|deteste|n\'aime|naime|ni|don\'?t|doesn\'?t|do not|does not|not|never|no|hates?|dislikes?|allergique|allergic|machi|mashi|walou|ma\s?[a-z0-9]{3,}(?:ch|sh|x))(?![\p{L}])|(?:^|\s)(?:ما\s?\S{2,}ش|ماشي|مكي\S+ش|والو)(?=\s|$)/u';

    $ints = interests();
    foreach ($clauses as $clause) {
        $clause = trim($clause);
        if ($clause === '') continue;
        $negative = (bool)preg_match($neg, $clause);
        foreach ($ints as $key => $i) {
            foreach ($i['kw'] as $kw) {
                if (preg_match(kw_regex($kw), $clause)) {
                    $out[$negative ? 'dislikes' : 'likes'][$key] = true;
                    break;
                }
            }
        }
    }
    // Liked in one place and disliked in another: trust the dislike.
    foreach ($out['dislikes'] as $k => $_) unset($out['likes'][$k]);

    // Plain words, to match product names and free tags directly.
    $stop = ['pour', 'avec', 'dans', 'elle', 'elles', 'tres', 'beaucoup', 'aime', 'adore', 'like', 'likes', 'loves', 'love', 'with', 'from', 'that', 'this', 'very', 'much', 'kaybghi', 'katbghi', 'bzaf', 'bezzaf', 'dyal', 'dial', 'dyalo', 'dyalha', 'chi', 'wahed', 'wa7ed', 'mzyan', 'mezyan', 'كيبغي', 'كتبغي', 'بزاف', 'ديال', 'ديالو', 'ديالها', 'واحد', 'هاد', 'هادي', 'عندو', 'عندها', 'kayhmaq', 'kaymout', 'mais', 'walakin', 'lakin', 'aussi', 'also', 'hta', 'ولكن', 'حتى'];
    foreach (preg_split('/[^\p{L}\p{N}]+/u', $text) as $w) {
        if (mb_strlen($w) >= 4 && !in_array($w, $stop, true)) $out['words'][$w] = true;
    }
    return [
        'likes' => array_keys($out['likes']),
        'dislikes' => array_keys($out['dislikes']),
        'occasions' => array_keys($out['occasions']),
        'words' => array_slice(array_keys($out['words']), 0, 40),
    ];
}

// Products that pass every hard rule.
function finder_candidates(array $c): array
{
    $rows = q(
        'SELECT p.*, c.name AS category FROM products p LEFT JOIN categories c ON c.id = p.category_id
         WHERE p.active = 1 AND p.price >= ? AND p.price <= ? AND (p.gender = ? OR p.gender = ?)
           AND p.age_min <= ? AND p.age_max >= ? AND (p.stock IS NULL OR p.stock > 0)',
        [$c['min'], $c['max'], $c['gender'], 'unisex', $c['age'], $c['age']]
    )->fetchAll();
    return array_values(array_filter($rows, function ($p) use ($c) {
        $rel = list_split($p['relations']);
        return !$rel || in_array($c['relation'], $rel, true);
    }));
}

function local_score(array $p, array $c, array $read): array
{
    $pInts = list_split($p['interests']);
    $pOcc = list_split($p['occasions']);
    $s = 0.3;
    $likes = array_values(array_intersect($read['likes'], $pInts));
    $dislikes = array_values(array_intersect($read['dislikes'], $pInts));
    $occ = array_values(array_intersect($read['occasions'], $pOcc));
    $s += min(0.6, 0.32 * count($likes));
    $s -= 0.7 * count($dislikes);
    if ($occ) $s += 0.18;
    if ($read['likes'] && !$likes) $s -= 0.12; // they said what they like, this isn't it

    $rel = list_split($p['relations']);
    if ($rel && in_array($c['relation'], $rel, true)) $s += 0.1 + (count($rel) <= 3 ? 0.05 : 0);
    if ($p['gender'] === $c['gender']) $s += 0.05;
    if ((int)$p['age_max'] - (int)$p['age_min'] <= 25) $s += 0.04;

    if ($read['words']) {
        $hay = norm_text($p['name'] . ' ' . $p['tags'] . ' ' . ($p['category'] ?? ''));
        $hits = 0;
        foreach ($read['words'] as $w) {
            if ($hits < 3 && mb_strpos($hay, (string)$w) !== false) $hits++;
        }
        $s += 0.07 * $hits;
    }
    if (!empty($p['featured'])) $s += 0.03;
    $s += 0.04 * min(1, (float)$p['price'] / max(1, $c['max'])); // makes use of the budget

    return ['score' => max(0, min(1, $s)), 'likes' => $likes, 'dislikes' => $dislikes, 'occasions' => $occ];
}

function jev_key(): string
{
    global $CONFIG;
    return (string)(setting('jev_api_key') ?: ($CONFIG['jev_api_key'] ?? getenv('TYPESAFE_API_KEY') ?: ''));
}

// One TypeSafe request. Returns the `answers` object or throws.
function jev_call(array $state, array $questions, int $timeout = 30): array
{
    global $CONFIG;
    $key = jev_key();
    if ($key === '') throw new RuntimeException('no key');
    $body = json_encode(['state' => $state, 'model' => 'jev-latest', 'questions' => $questions], JSON_UNESCAPED_UNICODE);
    $apiUrl = setting('jev_api_url') ?: ($CONFIG['jev_api_url'] ?? 'https://api.typesafe.ai/v1/systemone');

    for ($attempt = 0; ; $attempt++) {
        $ch = curl_init($apiUrl);
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => $body,
            CURLOPT_HTTPHEADER => ['Authorization: Bearer ' . $key, 'Content-Type: application/json'],
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CONNECTTIMEOUT => 6,
            CURLOPT_TIMEOUT => $timeout,
        ]);
        $res = curl_exec($ch);
        $status = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err = curl_error($ch);
        curl_close($ch);
        if (($status === 429 || $status === 529) && $attempt < 2) {
            sleep(1 << $attempt);
            continue;
        }
        if ($res === false) throw new RuntimeException('Jev unreachable: ' . $err);
        if ($status === 401) throw new RuntimeException('TypeSafe rejected the API key.');
        if ($status !== 200) throw new RuntimeException('Jev answered ' . $status . ': ' . substr((string)$res, 0, 200));
        break;
    }
    $answers = json_decode((string)$res, true)['answers'] ?? null;
    if (!is_array($answers)) throw new RuntimeException('Jev answer unreadable');
    return $answers;
}

// A Score answer as 0..1, using its own legend whatever the level numbering.
function jev_unit(?array $a): ?float
{
    if (!$a || !isset($a['score'])) return null;
    $levels = isset($a['legend']) && is_array($a['legend']) ? array_map('floatval', array_keys($a['legend'])) : [0, 4];
    $lo = min($levels);
    $hi = max($levels);
    return $hi > $lo ? max(0, min(1, ((float)$a['score'] - $lo) / ($hi - $lo))) : 0;
}

// What Jev is told about a product.
function jev_product(array $p): array
{
    return [
        'name' => $p['name'],
        'category' => $p['category'] ?? '',
        'price_mad' => (int)$p['price'],
        'description' => mb_substr(trim(strip_tags((string)$p['description'])), 0, 260),
        'made_for' => ['gender' => $p['gender'], 'ages' => (int)$p['age_min'] . '-' . (int)$p['age_max']],
        'tags' => trim(implode(', ', array_merge(
            array_map(fn($i) => interests()[$i]['label']['en'] ?? $i, list_split($p['interests'])),
            array_map(fn($o) => occasions()[$o]['label']['en'] ?? $o, list_split($p['occasions'])),
            list_split($p['tags'])
        ))),
    ];
}

// Asks Jev to rate every candidate for this person. Returns [id => 0..1] or throws.
function jev_rate(array $cands, array $c, string $note): array
{
    $products = [];
    $questions = [];
    $levels = [
        'Wrong gift: does not suit their gender, age or the relationship, or clashes with what the description says (something they dislike, already have, or cannot use).',
        'Poor gift: technically suitable but unrelated to who they are; a forgettable choice.',
        'Decent gift: a safe, pleasant choice for this kind of person, but not personal.',
        'Great gift: clearly fits their interests or the occasion described.',
        'Perfect gift: exactly what someone who knows them well would pick for them.',
    ];
    foreach ($cands as $p) {
        $k = 'p' . $p['id'];
        $products[$k] = jev_product($p);
        $questions[$k] = [
            'type' => 'score',
            'instructions' => "Rate how good a gift `products.$k` would be for the person described in `recipient`, "
                . 'given by someone who is their `recipient.relationship` and spending `recipient.budget_mad` dirhams. '
                . 'Weigh their gender, age, the relationship and everything in `recipient.description`, which may be written '
                . 'in English, French or Moroccan Darija (in Latin letters like "kaybghi lkora" or in Arabic script).',
            'criteria' => $levels,
        ];
    }
    $state = [
        'recipient' => [
            'gender' => $c['gender'],
            'age' => $c['age'],
            'relationship' => relation_label($c['relation'], $c['gender'], 'en') . ' (of the gift giver)',
            'budget_mad' => $c['max'] >= 100000000 ? 'from ' . $c['min'] . ', no upper limit' : $c['min'] . ' to ' . $c['max'],
            'description' => $c['note'] !== '' ? $c['note'] : 'No extra description given.',
        ],
        'products' => $products,
    ];
    $answers = jev_call($state, $questions);
    $out = [];
    foreach ($cands as $p) {
        $u = jev_unit($answers['p' . $p['id']] ?? null);
        if ($u !== null) $out[(int)$p['id']] = $u;
    }
    if (!$out) throw new RuntimeException('Jev rated nothing');
    return $out;
}

// Validates the visitor's answers. Returns [criteria, error].
function finder_input(array $in): array
{
    $gender = $in['gender'] ?? '';
    if (!in_array($gender, ['male', 'female'], true)) return [null, t('f_pick_gender')];
    $relation = (string)($in['relation'] ?? '');
    if (!isset(relations()[$relation])) return [null, t('f_pick_relation')];
    $age = max(0, min(99, (int)($in['age'] ?? 30)));
    $min = max(0, (int)($in['min'] ?? 0));
    $max = max($min, (int)($in['max'] ?? 100000));
    $note = mb_substr(trim(strip_tags((string)($in['note'] ?? ''))), 0, 600);
    return [['gender' => $gender, 'age' => $age, 'relation' => $relation, 'min' => $min, 'max' => $max, 'note' => $note], null];
}

// Products of the right gender that miss the other rules, with how far off
// they are and what differs. Closest first.
function finder_close(array $c, array $exclude, int $limit): array
{
    $rows = q(
        'SELECT p.*, c.name AS category FROM products p LEFT JOIN categories c ON c.id = p.category_id
         WHERE p.active = 1 AND (p.gender = ? OR p.gender = ?) AND (p.stock IS NULL OR p.stock > 0)',
        [$c['gender'], 'unisex']
    )->fetchAll();
    $out = [];
    foreach ($rows as $p) {
        if (isset($exclude[(int)$p['id']])) continue;
        $gaps = [];
        $d = 0.0;
        $price = (int)$p['price'];
        if ($c['max'] < 100000000 && $price > $c['max']) {
            $d += ($price - $c['max']) / max(50, $c['max']);
            $gaps[] = t('gap_over', ['x' => money($price - $c['max'])]);
        } elseif ($price < $c['min']) {
            $d += 0.3 * ($c['min'] - $price) / max(50, $c['min']);
            $gaps[] = t('gap_under');
        }
        $amin = (int)$p['age_min'];
        $amax = (int)$p['age_max'];
        if ($c['age'] < $amin || $c['age'] > $amax) {
            $years = $c['age'] < $amin ? $amin - $c['age'] : $c['age'] - $amax;
            $d += $years / 8;
            $gaps[] = t('gap_age', ['a' => $amin, 'b' => $amax >= 99 ? '99+' : $amax]);
        }
        $rel = list_split($p['relations']);
        if ($rel && !in_array($c['relation'], $rel, true)) {
            $d += 0.6;
            $gaps[] = t('gap_relation', ['r' => relation_label($c['relation'], $c['gender'])]);
        }
        if (!$gaps || $d > 4) continue; // too far to be useful
        $p['_dist'] = $d;
        $p['_gaps'] = $gaps;
        $out[] = $p;
    }
    usort($out, fn($a, $b) => $a['_dist'] <=> $b['_dist']);
    return array_slice($out, 0, $limit);
}

function finder_recommend(array $c): array
{
    $read = read_notes($c['note']);
    $hash = sha1(json_encode([$c, setting('catalog_version', '1'), lang(), jev_key() !== '', 2]));
    $now = time();

    $hit = q('SELECT response FROM finder_cache WHERE hash = ? AND created_at > ?', [$hash, $now - 7 * 86400])->fetchColumn();
    if ($hit) return json_decode($hit, true);

    $recent = (int)q('SELECT COUNT(*) FROM finder_log WHERE ip = ? AND created_at > ?', [client_ip(), $now - 600])->fetchColumn();
    if ($recent >= FINDER_RATE) return ['error' => t('res_error'), 'status' => 429];

    $exact = finder_candidates($c);
    foreach ($exact as &$p) $p['_local'] = local_score($p, $c, $read);
    unset($p);
    usort($exact, fn($a, $b) => $b['_local']['score'] <=> $a['_local']['score']);

    // Fewer than 6 exact matches: also look at the closest ones.
    $close = [];
    if (count($exact) < 6) {
        $ids = array_flip(array_map(fn($p) => (int)$p['id'], $exact));
        $close = finder_close($c, $ids, FINDER_MAX_CLOSE + 4);
        foreach ($close as &$p) $p['_local'] = local_score($p, $c, $read);
        unset($p);
    }

    $source = 'local';
    $batch = array_merge(array_slice($exact, 0, FINDER_MAX_JEV - min(count($close), 8)), array_slice($close, 0, 8));
    $jev = [];
    if (count($batch) > 1) {
        try {
            $jev = jev_rate($batch, $c, $c['note']);
            $source = 'jev';
        } catch (Throwable $e) {
            error_log('[finder] ' . $e->getMessage());
        }
    }
    $score = function (array $p) use ($jev): float {
        $l = $p['_local']['score'];
        if (!$jev) return $l;
        return isset($jev[(int)$p['id']])
            ? 0.78 * $jev[(int)$p['id']] + 0.22 * $l - ($p['_local']['dislikes'] ? 0.3 : 0)
            : 0.6 * $l; // not in Jev's batch: ranked after the ones Jev saw
    };
    foreach ($exact as &$p) $p['_score'] = $score($p);
    unset($p);
    foreach ($close as &$p) $p['_score'] = $score($p) - 0.12 * $p['_dist'];
    unset($p);
    usort($exact, fn($a, $b) => $b['_score'] <=> $a['_score']);
    usort($close, fn($a, $b) => $b['_score'] <=> $a['_score']);
    $exact = hydrate_products(array_slice($exact, 0, FINDER_MAX_RESULTS));
    $close = hydrate_products(array_slice($close, 0, FINDER_MAX_CLOSE));

    $item = fn(array $p, bool $isClose) => [
        'id' => (int)$p['id'],
        'name' => $p['name'],
        'price' => (int)$p['price'],
        'compare' => $p['compare_price'] ? (int)$p['compare_price'] : null,
        'price_label' => money($p['price']),
        'compare_label' => $p['compare_price'] ? money($p['compare_price']) : null,
        'image' => img_url($p['image']),
        'url' => $p['url'],
        'category' => $p['category'] ?? '',
        'match' => (int)round(max(0, min(1, $p['_score'])) * 100),
        'reasons' => $isClose ? [] : finder_reasons($p, $c),
        'gaps' => $isClose ? $p['_gaps'] : [],
        'close' => $isClose,
    ];
    $exactItems = array_map(fn($p) => $item($p, false), $exact);
    $closeItems = array_map(fn($p) => $item($p, true), $close);

    // The podium always has 3 when possible: exact matches first, then the closest.
    $top = array_slice($exactItems, 0, 3);
    while (count($top) < 3 && $closeItems) $top[] = array_shift($closeItems);

    $res = [
        'source' => $source,
        'exact' => count($exactItems),
        'top' => $top,
        'more' => array_slice($exactItems, 3),
        'close' => $closeItems,
        'understood' => array_merge(
            array_map(fn($k) => ['type' => 'like', 'label' => tag_label(interests(), $k)], $read['likes']),
            array_map(fn($k) => ['type' => 'dislike', 'label' => tag_label(interests(), $k)], $read['dislikes']),
            array_map(fn($k) => ['type' => 'occasion', 'label' => tag_label(occasions(), $k)], $read['occasions'])
        ),
    ];

    q('INSERT INTO finder_log (ip, gender, age, relation, budget_min, budget_max, note, source, results, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)', [
        client_ip(), $c['gender'], $c['age'], $c['relation'], $c['min'], $c['max'], $c['note'], $source,
        implode(',', array_map(fn($i) => $i['id'], $exactItems)), $now,
    ]);
    if ($source === 'jev' || jev_key() === '') {
        q('DELETE FROM finder_cache WHERE hash = ?', [$hash]);
        q('INSERT INTO finder_cache (hash, response, created_at) VALUES (?, ?, ?)', [$hash, json_encode($res, JSON_UNESCAPED_UNICODE), $now]);
    }
    return $res;
}

function finder_reasons(array $p, array $c): array
{
    $r = [];
    $l = $p['_local'];
    if ($l['likes']) $r[] = t($c['gender'] === 'female' ? 'why_likes_f' : 'why_likes', ['x' => implode(', ', array_map(fn($k) => tag_label(interests(), $k), array_slice($l['likes'], 0, 2)))]);
    if ($l['occasions']) $r[] = t('why_occasion', ['x' => tag_label(occasions(), $l['occasions'][0])]);
    $rel = list_split($p['relations']);
    if ($rel && in_array($c['relation'], $rel, true)) $r[] = t('why_relation', ['r' => relation_label($c['relation'], $c['gender'])]);
    if (count($r) < 3 && (int)$p['age_max'] - (int)$p['age_min'] <= 30) $r[] = t('why_age', ['a' => $c['age']]);
    if (count($r) < 3) $r[] = t('why_budget');
    return array_slice($r, 0, 3);
}
