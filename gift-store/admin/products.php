<?php
require __DIR__ . '/_inc.php';
require_admin();

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    csrf_check();
    $id = (int)($_POST['id'] ?? 0);
    if (($_POST['action'] ?? '') === 'toggle') {
        q('UPDATE products SET active = 1 - active, updated_at = ? WHERE id = ?', [time(), $id]);
        bump_catalog();
    }
    redirect($_SERVER['REQUEST_URI']);
}

$s = trim((string)($_GET['s'] ?? ''));
$where = '1=1';
$args = [];
if ($s !== '') { $where .= ' AND (p.name LIKE ? OR p.tags LIKE ?)'; $args[] = "%$s%"; $args[] = "%$s%"; }
if (!empty($_GET['untagged'])) $where .= " AND (p.interests = '' OR p.occasions = '')";
$rows = hydrate_products(q("SELECT p.*, c.name AS category FROM products p LEFT JOIN categories c ON c.id = p.category_id WHERE $where ORDER BY p.created_at DESC", $args)->fetchAll());

$gLabel = ['male' => 'Homme', 'female' => 'Femme', 'unisex' => 'Mixte'];
admin_header('Produits', 'products');
?>
<div class="page-top">
    <h1>Produits <span class="muted">(<?= count($rows) ?>)</span></h1>
    <a class="btn primary" href="product.php">+ Nouveau produit</a>
</div>
<form class="toolbar">
    <input name="s" value="<?= e($s) ?>" placeholder="Rechercher un produit…">
    <button class="btn">Rechercher</button>
</form>
<div class="plist">
    <?php foreach ($rows as $p): ?>
    <div class="prow <?= $p['active'] ? '' : 'off' ?>">
        <a href="product.php?id=<?= (int)$p['id'] ?>"><img src="<?= e(img_url($p['image'])) ?>" alt="" loading="lazy"></a>
        <div class="prow-main">
            <a href="product.php?id=<?= (int)$p['id'] ?>"><strong><?= e($p['name']) ?></strong></a>
            <div class="muted small"><?= e($p['category'] ?? '—') ?> · <?= e(money($p['price'])) ?> · <?= e($gLabel[$p['gender']] ?? '') ?> · <?= (int)$p['age_min'] ?>–<?= (int)$p['age_max'] ?> ans<?= $p['stock'] !== null ? ' · stock ' . (int)$p['stock'] : '' ?></div>
            <div class="mini-tags">
                <?php foreach (list_split($p['interests']) as $k): ?><span><?= e(interests()[$k]['label']['fr'] ?? $k) ?></span><?php endforeach; ?>
                <?php if (!$p['interests'] || !$p['occasions']): ?><span class="warn">tags à compléter</span><?php endif; ?>
                <?php if ($p['featured']): ?><span class="star">★ coup de cœur</span><?php endif; ?>
            </div>
        </div>
        <form method="post">
            <?= csrf_field() ?><input type="hidden" name="id" value="<?= (int)$p['id'] ?>"><input type="hidden" name="action" value="toggle">
            <button class="switch <?= $p['active'] ? 'on' : '' ?>" title="<?= $p['active'] ? 'En ligne — cliquer pour masquer' : 'Masqué — cliquer pour publier' ?>"><i></i></button>
        </form>
    </div>
    <?php endforeach; ?>
    <?php if (!$rows): ?><p class="muted">Aucun produit.</p><?php endif; ?>
</div>
<?php admin_footer();
