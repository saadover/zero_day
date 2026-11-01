<?php
// Suggests the "Pour qui ?" tags of a product from its name, description and
// category: gender, age range, relationships, interests and occasions.
// Uses Jev when a key is set, keyword rules otherwise. The admin always
// reviews the suggestion before saving.

require_once ROOT . '/inc/finder.php';

const AGE_FROM = [0, 3, 6, 10, 13, 16, 18, 25, 40, 60];
const AGE_TO = [2, 5, 9, 12, 15, 17, 25, 35, 50, 99];

function autotag(string $name, string $desc, string $category, string $tags = ''): array
{
    $local = autotag_local($name, $desc, $category, $tags);
    if (jev_key() === '') return $local + ['source' => 'local'];
    try {
        return autotag_jev($name, $desc, $category, $tags, $local) + ['source' => 'jev'];
    } catch (Throwable $e) {
        error_log('[autotag] ' . $e->getMessage());
        return $local + ['source' => 'local', 'error' => $e->getMessage()];
    }
}

function kw_hit(string $text, array $words): bool
{
    foreach ($words as $w) if (preg_match(kw_regex($w), $text)) return true;
    return false;
}

function autotag_local(string $name, string $desc, string $category, string $tags): array
{
    $text = norm_text("$name. $category. $tags. $desc");

    $female = ['femme', 'femmes', 'fille', '=elle', 'robe', 'jupe', 'maquillage', 'makeup', 'rouge a levres', 'mascara', 'vernis', 'sac a main', 'collier', 'boucles d\'oreilles', 'caftan', 'takchita', 'maman', '=mere', 'soeur', 'epouse', 'women', 'woman', '=her', 'she', 'girl', 'mom', 'mother', 'sister', 'wife', 'lady', 'feminin', 'feminine', 'هي', 'المرأة', 'نساء', 'ماما', 'الأم', 'قفطان', 'تكشيطة'];
    $male = ['homme', 'hommes', 'garcon', '=lui', 'barbe', 'rasoir', 'rasage', 'cravate', 'boutons de manchette', '=papa', '=pere', 'frere', '=mari', '=men', '=man', '=his', '=him', 'boy', 'dad', 'father', 'brother', 'husband', 'beard', 'shaving', 'masculin', 'masculine', 'gentleman', 'رجل', 'رجال', 'بابا', 'الأب', 'لحية'];
    $f = kw_hit($text, $female);
    $m = kw_hit($text, $male);
    $gender = $f && !$m ? 'female' : ($m && !$f ? 'male' : 'unisex');

    $age = [16, 99];
    if (kw_hit($text, ['bebe', 'naissance', 'nouveau-ne', 'baby', 'newborn', 'bavoir', 'tetine', 'رضيع', 'بيبي', 'السبوع'])) $age = [0, 2];
    elseif (kw_hit($text, ['jouet', 'jouets', 'enfant', 'enfants', 'kids', 'kid', 'toy', 'toys', 'lego', 'peluche', 'doudou', 'poupee', 'doll', 'puzzle', 'conte', 'أطفال', 'لعبة'])) $age = [3, 12];
    elseif (kw_hit($text, ['ado', 'adolescent', 'teen', 'teenager', 'مراهق'])) $age = [12, 19];
    elseif (kw_hit($text, ['gaming', 'gamer', 'playstation', 'ps5', 'manette', 'console'])) $age = [8, 45];
    elseif (kw_hit($text, ['parfum', 'perfume', 'montre', 'watch', 'cuir', 'leather', 'bijou', 'bijoux', 'cravate', 'stylo plume', 'service a the', 'theiere', 'caftan', 'barbe', 'maquillage'])) $age = [16, 99];
    if (kw_hit($text, ['senior', 'retraite', 'grand-pere', 'grand-mere', 'grandparent', 'retirement'])) $age = [55, 99];

    // Every relationship the text mentions (a "gift for a husband or a father" fits both).
    $relations = [];
    $groups = [
        'partner,fiance' => ['romantique', 'romantic', 'saint valentin', 'valentine', 'roses eternelles', 'lingerie', 'couple', '=mari', 'epouse', 'husband', 'wife', 'fiance', 'fiancee', 'amoureux', 'amoureuse', 'zawja', 'الزوج', 'الزوجة'],
        'sibling' => ['frere', 'soeur', 'brother', 'sister', 'khouya', 'khti', 'خويا', 'ختي'],
        'parent' => ['maman', '=mere', '=papa', '=pere', 'mom', 'mother', 'dad', 'father', 'parents', '=mama', 'ماما', 'بابا'],
        'grandparent' => ['grand-pere', 'grand-mere', 'grandfather', 'grandmother', 'grandparent', 'jedda', 'جدة', 'جد'],
        'colleague,boss,teacher' => ['collegue', 'colleague', 'patron', 'boss', 'professeur', 'teacher', 'manager', 'directeur'],
        'friend' => ['ami', 'amie', 'copine', 'copain', 'friend', 'sahbi', 'sahbti', 'صاحبي', 'صاحبتي'],
    ];
    foreach ($groups as $keys => $words) if (kw_hit($text, $words)) $relations = array_merge($relations, explode(',', $keys));
    $relations = array_values(array_unique($relations));
    if ($age[1] <= 12 && !$relations) $relations = ['child', 'sibling', 'family', 'friend'];

    $ints = [];
    foreach (interests() as $k => $i) if (kw_hit($text, $i['kw'])) $ints[] = $k;
    $occ = [];
    foreach (occasions() as $k => $o) if (kw_hit($text, $o['kw'])) $occ[] = $k;
    if (!$occ) $occ = $age[1] <= 2 ? ['newborn'] : ['birthday'];

    return ['gender' => $gender, 'age_min' => $age[0], 'age_max' => $age[1], 'relations' => $relations, 'interests' => array_slice($ints, 0, 5), 'occasions' => $occ];
}

function autotag_jev(string $name, string $desc, string $category, string $tags, array $local): array
{
    $state = ['product' => [
        'name' => $name,
        'category' => $category,
        'description' => mb_substr(trim(strip_tags($desc)), 0, 700),
        'keywords' => $tags,
    ], 'shop' => 'An online gift shop in Morocco. Customers buy these products as gifts for someone else.'];

    $q = [
        'gender' => [
            'type' => 'choice',
            'instructions' => ['question' => 'Who is `product` meant for as a gift?'],
            'criteria' => [
                'male' => 'Mainly men or boys: giving it to a woman would be odd.',
                'female' => 'Mainly women or girls: giving it to a man would be odd.',
                'unisex' => 'Suits men and women alike.',
            ],
        ],
        'age_from' => [
            'type' => 'choice',
            'instructions' => ['question' => 'What is the youngest age at which `product` makes a good, appropriate gift?'],
            'criteria' => array_combine(array_map(fn($a) => "from_$a", AGE_FROM), array_map(fn($a) => $a === 0 ? 'Newborn babies and up.' : "From about $a years old.", AGE_FROM)),
        ],
        'age_to' => [
            'type' => 'choice',
            'instructions' => ['question' => 'Up to what age does `product` still make a good gift (after that most people would find it unsuitable or childish)?'],
            'criteria' => array_combine(array_map(fn($a) => "to_$a", AGE_TO), array_map(fn($a) => $a >= 99 ? 'No upper limit: fine for adults of any age.' : "Up to about $a years old.", AGE_TO)),
        ],
    ];
    foreach (relations() as $k => $r) {
        $q["rel_$k"] = ['type' => 'noul', 'instructions' => 'Would `product` be a natural, appropriate gift from someone to their ' . strtolower($r['m']['en'] . ' or ' . $r['f']['en']) . '?'];
    }
    foreach (interests() as $k => $i) {
        $q["int_$k"] = ['type' => 'noul', 'instructions' => 'Is `product` specifically suited to someone whose interests include ' . strtolower($i['label']['en']) . '? Answer no if it is only loosely related.'];
    }
    foreach (occasions() as $k => $o) {
        $q["occ_$k"] = ['type' => 'noul', 'instructions' => 'Is `product` a typical, fitting gift for this occasion: ' . $o['label']['en'] . '?'];
    }

    $a = jev_call($state, $q, 45);
    $yes = fn(string $k) => isset($a[$k]['noul']) && (float)$a[$k]['noul'] >= 0.5;

    $gender = $a['gender']['choice'] ?? $local['gender'];
    $from = (int)substr((string)($a['age_from']['choice'] ?? 'from_' . $local['age_min']), 5);
    $to = (int)substr((string)($a['age_to']['choice'] ?? 'to_' . $local['age_max']), 3);
    if ($to < $from) $to = max($from, $local['age_max']);

    $rel = array_values(array_filter(array_keys(relations()), fn($k) => $yes("rel_$k")));
    if (count($rel) >= count(relations()) - 1) $rel = []; // fits (nearly) everyone
    $ints = array_values(array_filter(array_keys(interests()), fn($k) => $yes("int_$k")));
    $occ = array_values(array_filter(array_keys(occasions()), fn($k) => $yes("occ_$k")));

    return [
        'gender' => in_array($gender, GENDERS, true) ? $gender : $local['gender'],
        'age_min' => $from,
        'age_max' => $to,
        'relations' => $rel,
        'interests' => $ints ?: $local['interests'],
        'occasions' => $occ ?: $local['occasions'],
    ];
}
