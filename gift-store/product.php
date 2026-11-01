<?php
require __DIR__ . '/inc/bootstrap.php';
require __DIR__ . '/inc/layout.php';

$slug = (string)($_GET['p'] ?? '');
$rows = products_query('p.slug = ?', [$slug], 'p.id', 1);
$p = $rows[0] ?? null;
if (!$p) {
    http_response_code(404);
    page_header(t('no_products'));
    echo '<section class="wrap section empty-state"><div class="empty-art">' . icon('gift', 56) . '</div><p>' . e(t('no_products')) . '</p><a class="btn ghost" href="' . e(url('shop.php')) . '">' . e(t('nav_shop')) . '</a></section>';
    page_footer();
    exit;
}

$related = products_query('p.category_id = ? AND p.id <> ?', [$p['category_id'], $p['id']], 'p.featured DESC, p.created_at DESC', 4);
if (count($related) < 4) {
    $ids = array_merge([(int)$p['id']], array_map(fn($r) => (int)$r['id'], $related));
    $in = implode(',', $ids);
    $related = array_merge($related, products_query("p.id NOT IN ($in) AND (p.gender = ? OR p.gender = 'unisex')", [$p['gender'] === 'unisex' ? 'male' : $p['gender']], 'p.featured DESC, p.created_at DESC', 4 - count($related)));
}

$off = ($p['compare_price'] && $p['compare_price'] > $p['price']) ? round(100 - $p['price'] * 100 / $p['compare_price']) : 0;
$stock = in_stock($p);
$g = $p['gender'] === 'female' ? 'female' : 'male';
$ideal = [];
if ($p['gender'] !== 'unisex') $ideal[] = $p['gender'] === 'male' ? t('for_him') : t('for_her');
foreach (list_split($p['relations']) as $r) if (isset(relations()[$r])) $ideal[] = $p['gender'] === 'unisex'
    ? (relation_label($r, 'male') === relation_label($r, 'female') ? relation_label($r, 'male') : relation_label($r, 'male') . ' / ' . relation_label($r, 'female'))
    : relation_label($r, $g);
$ideal[] = ((int)$p['age_max'] >= 99 ? (int)$p['age_min'] . '+ ' : (int)$p['age_min'] . '–' . (int)$p['age_max'] . ' ') . t('f_years');
$tags = array_merge(
    array_map(fn($k) => tag_label(interests(), $k), array_filter(list_split($p['interests']), fn($k) => isset(interests()[$k]))),
    array_map(fn($k) => tag_label(occasions(), $k), array_filter(list_split($p['occasions']), fn($k) => isset(occasions()[$k])))
);
$wa = setting('whatsapp');
$abs = (is_https() ? 'https://' : 'http://') . ($_SERVER['HTTP_HOST'] ?? '');

page_header($p['name'], ['active' => 'shop', 'description' => mb_substr((string)$p['description'], 0, 160), 'image' => $abs . img_url($p['image'])]);
?>
<div class="wrap crumbs tiny muted">
    <a href="<?= e(url('shop.php')) ?>"><?= e(t('nav_shop')) ?></a>
    <?php if ($p['category']): ?> / <a href="<?= e(url('shop.php', ['cat' => $p['category_slug']])) ?>"><?= e($p['category']) ?></a><?php endif; ?>
</div>

<section class="wrap pdp">
    <div class="gallery" data-gallery>
        <div class="gallery-main">
            <?php foreach ($p['images'] ?: [$p['image']] as $i => $img): ?>
                <img src="<?= e(img_url($img)) ?>" alt="<?= e($p['name']) ?>" <?= $i ? 'loading="lazy"' : 'fetchpriority="high"' ?> width="800" height="800">
            <?php endforeach; ?>
        </div>
        <?php if (count($p['images']) > 1): ?>
        <div class="gallery-dots">
            <?php foreach ($p['images'] as $i => $img): ?><button type="button" class="<?= $i ? '' : 'on' ?>" aria-label="<?= $i + 1 ?>"><img src="<?= e(img_url($img)) ?>" alt="" loading="lazy"></button><?php endforeach; ?>
        </div>
        <?php endif; ?>
        <?php if ($off): ?><span class="pill sale big">-<?= $off ?>%</span><?php endif; ?>
    </div>

    <div class="pdp-info">
        <?php if ($p['category']): ?><span class="card-cat"><?= e($p['category']) ?></span><?php endif; ?>
        <h1 class="display small"><?= e($p['name']) ?></h1>
        <div class="price big"><strong><?= e(money($p['price'])) ?></strong><?php if ($off): ?> <s><?= e(money($p['compare_price'])) ?></s><?php endif; ?></div>

        <div class="ideal">
            <span class="tiny muted"><?= e(t('ideal_for')) ?></span>
            <div class="tags"><?php foreach ($ideal as $x): ?><span class="tag"><?= e($x) ?></span><?php endforeach; ?></div>
        </div>

        <?php if ($stock): ?>
        <div class="buy" data-buy='<?= e(buy_data($p)) ?>'>
            <div class="stepper" aria-label="<?= e(t('qty')) ?>">
                <button type="button" data-step="-1" aria-label="-"><?= icon('minus', 18) ?></button>
                <input type="number" value="1" min="1" max="10" inputmode="numeric" data-qty aria-label="<?= e(t('qty')) ?>">
                <button type="button" data-step="1" aria-label="+"><?= icon('plus', 18) ?></button>
            </div>
            <button class="btn primary grow shine" type="button" data-buy-main><?= icon('bag', 20) ?> <span><?= e(t('buy_now')) ?></span></button>
        </div>
        <?php if ($wa): ?>
            <a class="btn ghost block wa" target="_blank" rel="noopener" href="https://wa.me/<?= e($wa) ?>?text=<?= rawurlencode($p['name'] . ' — ' . money($p['price']) . "\n" . $abs . $p['url']) ?>"><?= icon('whatsapp', 20) ?> <?= e(t('order_whatsapp')) ?></a>
        <?php endif; ?>
        <?php else: ?>
            <button class="btn block" disabled><?= e(t('out_of_stock')) ?></button>
        <?php endif; ?>

        <ul class="perks">
            <li><?= icon('cash', 20) ?> <span><strong><?= e(t('trust_cod')) ?></strong><br><span class="muted"><?= e(t('cod_note')) ?></span></span></li>
            <li><?= icon('truck', 20) ?> <span><strong><?= e(t('trust_ship')) ?></strong><br><span class="muted"><?= e(t('trust_ship_sub')) ?> · <?= e(t('free_from', ['x' => money(setting('free_delivery_from', '499'))])) ?></span></span></li>
            <li><?= icon('ribbon', 20) ?> <span><strong><?= e(t('trust_wrap')) ?></strong><br><span class="muted"><?= e(t('trust_wrap_sub')) ?></span></span></li>
        </ul>

        <?php if (trim((string)$p['description']) !== ''): ?>
        <div class="desc">
            <h2 class="h3"><?= e(t('details')) ?></h2>
            <p><?= nl2br(e($p['description'])) ?></p>
        </div>
        <?php endif; ?>
        <?php if ($tags): ?><div class="tags soft"><?php foreach ($tags as $x): ?><span class="tag"><?= e($x) ?></span><?php endforeach; ?></div><?php endif; ?>
    </div>
</section>

<?php if ($stock): ?>
<div class="sticky-buy" data-sticky-buy>
    <div><strong><?= e(money($p['price'])) ?></strong><span class="tiny muted"><?= e(t('trust_cod')) ?></span></div>
    <button class="btn primary" type="button" data-buy-main><?= icon('bag', 18) ?> <?= e(t('buy_now')) ?></button>
</div>
<?php endif; ?>

<?php if ($related): ?>
<section class="section">
    <div class="wrap">
        <h2 class="h2 reveal"><?= e(t('related')) ?></h2>
        <div class="grid"><?php foreach ($related as $r) echo product_card($r); ?></div>
    </div>
</section>
<?php endif; ?>
<?php page_footer(['active' => 'shop']);
