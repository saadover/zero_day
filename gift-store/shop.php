<?php
require __DIR__ . '/inc/bootstrap.php';
require __DIR__ . '/inc/layout.php';

$cat = (string)($_GET['cat'] ?? '');
$qs = trim((string)($_GET['q'] ?? ''));
$for = (string)($_GET['for'] ?? '');
$occasion = (string)($_GET['occasion'] ?? '');
$interest = (string)($_GET['interest'] ?? '');
$sort = (string)($_GET['sort'] ?? 'new');
$page = max(1, (int)($_GET['page'] ?? 1));
$per = 24;

$where = ['1=1'];
$args = [];
$category = null;
if ($cat !== '') {
    $category = q('SELECT * FROM categories WHERE slug = ?', [$cat])->fetch();
    if ($category) {
        $where[] = 'p.category_id = ?';
        $args[] = $category['id'];
    }
}
if ($qs !== '') {
    $where[] = '(p.name LIKE ? OR p.tags LIKE ? OR p.description LIKE ? OR c.name LIKE ?)';
    $like = '%' . str_replace(['%', '_'], ['\%', '\_'], $qs) . '%';
    array_push($args, $like, $like, $like, $like);
}
if (in_array($for, ['male', 'female'], true)) {
    $where[] = "(p.gender = ? OR p.gender = 'unisex')";
    $args[] = $for;
}
if (isset(occasions()[$occasion])) {
    $where[] = "(',' || p.occasions || ',') LIKE ?";
    $args[] = '%,' . $occasion . ',%';
}
if (isset(interests()[$interest])) {
    $where[] = "(',' || p.interests || ',') LIKE ?";
    $args[] = '%,' . $interest . ',%';
}
$orders = ['new' => 'p.created_at DESC', 'low' => 'p.price ASC', 'high' => 'p.price DESC', 'featured' => 'p.featured DESC, p.created_at DESC'];
$order = $orders[$sort] ?? $orders['new'];

$w = implode(' AND ', $where);
// "||" concatenation is standard SQL; MySQL needs PIPES_AS_CONCAT, so use CONCAT there.
if (db()->getAttribute(PDO::ATTR_DRIVER_NAME) === 'mysql') {
    $w = str_replace(["(',' || p.occasions || ',')", "(',' || p.interests || ',')"], ["CONCAT(',', p.occasions, ',')", "CONCAT(',', p.interests, ',')"], $w);
}
$total = (int)q("SELECT COUNT(*) FROM products p LEFT JOIN categories c ON c.id = p.category_id WHERE p.active = 1 AND ($w)", $args)->fetchColumn();
$products = products_query($w, $args, $order, $per, ($page - 1) * $per);

// Nothing matches exactly: show the closest products instead of an empty page.
$closest = [];
if (!$total) $closest = shop_closest($qs, $category, $for, $occasion, $interest);

function shop_closest(string $qs, ?array $category, string $for, string $occasion, string $interest): array
{
    require_once ROOT . '/inc/finder.php';
    $gender = in_array($for, ['male', 'female'], true) ? $for : null;
    $rows = q("SELECT p.*, c.name AS category, c.slug AS category_slug FROM products p LEFT JOIN categories c ON c.id = p.category_id
               WHERE p.active = 1 AND (p.stock IS NULL OR p.stock > 0)" . ($gender ? " AND (p.gender = ? OR p.gender = 'unisex')" : ''), $gender ? [$gender] : [])->fetchAll();
    // What the search is about: words, plus interests/occasions it mentions (FR/EN/Darija).
    $read = $qs !== '' ? read_notes($qs) : ['likes' => [], 'occasions' => [], 'words' => []];
    $words = array_filter(preg_split('/[^\p{L}\p{N}]+/u', norm_text($qs)), fn($x) => mb_strlen($x) >= 3);
    $likes = array_unique(array_merge($read['likes'], $interest !== '' ? [$interest] : []));
    $occs = array_unique(array_merge($read['occasions'], $occasion !== '' ? [$occasion] : []));
    $scored = [];
    foreach ($rows as $p) {
        $s = 0;
        $hay = norm_text($p['name'] . ' ' . $p['tags'] . ' ' . $p['category'] . ' ' . $p['description']);
        foreach ($words as $w) if (mb_strpos($hay, $w) !== false || (mb_strlen($w) > 4 && mb_strpos($hay, mb_substr($w, 0, -1)) !== false)) $s += 3;
        $s += 2.5 * count(array_intersect($likes, list_split($p['interests'])));
        $s += 2 * count(array_intersect($occs, list_split($p['occasions'])));
        if ($category && (int)$p['category_id'] === (int)$category['id']) $s += 1.5;
        if ($s <= 0) continue;
        $s += (int)$p['featured'] * 0.3;
        $p['_s'] = $s;
        $scored[] = $p;
    }
    usort($scored, fn($a, $b) => $b['_s'] <=> $a['_s']);
    if (!$scored) { // still nothing: our favourites
        $scored = array_values(array_filter($rows, fn($p) => (int)$p['featured'] === 1)) ?: $rows;
    }
    return hydrate_products(array_slice($scored, 0, 12));
}
$cats = q('SELECT * FROM categories ORDER BY sort, name')->fetchAll();

$title = $qs !== '' ? t('results_for', ['q' => $qs]) : ($category['name'] ?? (isset(occasions()[$occasion]) ? tag_label(occasions(), $occasion) : ($for === 'male' ? t('for_him') : ($for === 'female' ? t('for_her') : t('shop_title')))));
$keep = fn(array $change) => url('shop.php', array_filter(array_merge(['cat' => $cat, 'q' => $qs, 'for' => $for, 'occasion' => $occasion, 'interest' => $interest, 'sort' => $sort === 'new' ? '' : $sort], $change), 'strlen'));

page_header($title, ['active' => 'shop']);
?>
<section class="page-head wrap">
    <h1 class="display small"><?= e($title) ?></h1>
    <?php if ($total): ?><p class="muted"><?= e(t('n_products', ['n' => $total])) ?></p><?php endif; ?>
</section>

<div class="filters-bar">
    <div class="wrap">
        <div class="chip-rail">
            <a class="chip-link <?= !$category ? 'on' : '' ?>" href="<?= e($keep(['cat' => ''])) ?>"><?= e(t('all')) ?></a>
            <?php foreach ($cats as $c): ?>
                <a class="chip-link <?= $category && $category['id'] == $c['id'] ? 'on' : '' ?>" href="<?= e($keep(['cat' => $c['slug']])) ?>"><?= e($c['name']) ?></a>
            <?php endforeach; ?>
        </div>
        <div class="filter-row">
            <div class="seg">
                <a class="<?= $for === '' ? 'on' : '' ?>" href="<?= e($keep(['for' => ''])) ?>"><?= e(t('all')) ?></a>
                <a class="<?= $for === 'male' ? 'on' : '' ?>" href="<?= e($keep(['for' => 'male'])) ?>"><?= e(t('for_him')) ?></a>
                <a class="<?= $for === 'female' ? 'on' : '' ?>" href="<?= e($keep(['for' => 'female'])) ?>"><?= e(t('for_her')) ?></a>
            </div>
            <label class="select">
                <span class="sr"><?= e(t('sort')) ?></span>
                <select onchange="location.href=this.value" aria-label="<?= e(t('sort')) ?>">
                    <?php foreach (['new' => 'sort_new', 'featured' => 'sec_featured', 'low' => 'sort_low', 'high' => 'sort_high'] as $k => $label): ?>
                        <option value="<?= e($keep(['sort' => $k === 'new' ? '' : $k, 'page' => ''])) ?>" <?= $sort === $k ? 'selected' : '' ?>><?= e(t($label)) ?></option>
                    <?php endforeach; ?>
                </select>
            </label>
        </div>
    </div>
</div>

<section class="wrap section tight">
    <?php if ($products): ?>
        <div class="grid"><?php foreach ($products as $p) echo product_card($p); ?></div>
        <?php $pages = (int)ceil($total / $per); if ($pages > 1): ?>
        <nav class="pager">
            <?php for ($i = 1; $i <= $pages; $i++): ?>
                <a class="<?= $i === $page ? 'on' : '' ?>" href="<?= e($keep(['page' => $i > 1 ? $i : ''])) ?>"><?= $i ?></a>
            <?php endfor; ?>
        </nav>
        <?php endif; ?>
    <?php else: ?>
        <div class="close-banner">
            <span><?= icon('sparkle', 18) ?></span>
            <p><?= e(t('shop_close')) ?></p>
        </div>
        <div class="grid"><?php foreach ($closest as $p) echo product_card($p); ?></div>
            <p><?= e(t('no_products')) ?></p>
            <a class="btn ghost" href="<?= e(url()) ?>#finder"><?= icon('sparkle', 18) ?> <?= e(t('cart_empty_cta')) ?></a>
        </div>
    <?php endif; ?>
</section>
<?php page_footer(['active' => 'shop']);
