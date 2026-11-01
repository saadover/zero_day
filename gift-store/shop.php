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
$cats = q('SELECT * FROM categories ORDER BY sort, name')->fetchAll();

$title = $qs !== '' ? t('results_for', ['q' => $qs]) : ($category['name'] ?? (isset(occasions()[$occasion]) ? tag_label(occasions(), $occasion) : ($for === 'male' ? t('for_him') : ($for === 'female' ? t('for_her') : t('shop_title')))));
$keep = fn(array $change) => url('shop.php', array_filter(array_merge(['cat' => $cat, 'q' => $qs, 'for' => $for, 'occasion' => $occasion, 'interest' => $interest, 'sort' => $sort === 'new' ? '' : $sort], $change), 'strlen'));

page_header($title, ['active' => 'shop']);
?>
<section class="page-head wrap">
    <h1 class="display small"><?= e($title) ?></h1>
    <p class="muted"><?= e(t('n_products', ['n' => $total])) ?></p>
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
        <div class="empty-state">
            <div class="empty-art"><?= icon('gift', 56) ?></div>
            <p><?= e(t('no_products')) ?></p>
            <a class="btn ghost" href="<?= e(url()) ?>#finder"><?= icon('sparkle', 18) ?> <?= e(t('cart_empty_cta')) ?></a>
        </div>
    <?php endif; ?>
</section>
<?php page_footer(['active' => 'shop']);
