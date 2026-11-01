<?php
require __DIR__ . '/_inc.php';
require_admin();

$today = strtotime('today');
$stats = [
    'Nouvelles commandes' => (int)q("SELECT COUNT(*) FROM orders WHERE status = 'new'")->fetchColumn(),
    "Commandes aujourd'hui" => (int)q('SELECT COUNT(*) FROM orders WHERE created_at >= ?', [$today])->fetchColumn(),
    'Ventes du mois (DH)' => number_format((int)q("SELECT COALESCE(SUM(total),0) FROM orders WHERE created_at >= ? AND status NOT IN ('cancelled','returned')", [strtotime('first day of this month 00:00')])->fetchColumn(), 0, ',', ' '),
    "Recherches AI aujourd'hui" => (int)q('SELECT COUNT(*) FROM finder_log WHERE created_at >= ?', [$today])->fetchColumn(),
    'Produits en ligne' => (int)q('SELECT COUNT(*) FROM products WHERE active = 1')->fetchColumn(),
];
$orders = q('SELECT * FROM orders ORDER BY created_at DESC LIMIT 8')->fetchAll();
$untagged = (int)q("SELECT COUNT(*) FROM products WHERE active = 1 AND (interests = '' OR occasions = '')")->fetchColumn();

admin_header('Tableau de bord', 'index');
?>
<h1>Tableau de bord</h1>
<?php if (!jev_key_set()): ?>
    <div class="alert warn">Jev n'est pas encore connecté : le conseiller cadeau utilise ses règles intégrées. <a href="settings.php">Ajouter la clé TypeSafe →</a></div>
<?php endif; ?>
<?php if ($untagged): ?>
    <div class="alert warn"><?= $untagged ?> produit(s) sans centres d'intérêt ou occasions : le conseiller les recommande moins bien. <a href="products.php?untagged=1">Les compléter →</a></div>
<?php endif; ?>
<div class="stats">
    <?php foreach ($stats as $label => $n): ?><div class="stat"><b><?= e($n) ?></b><span><?= e($label) ?></span></div><?php endforeach; ?>
</div>

<div class="panel">
    <div class="panel-head"><h2>Dernières commandes</h2><a href="orders.php">Tout voir →</a></div>
    <?php if (!$orders): ?><p class="muted">Pas encore de commande.</p><?php else: ?>
    <div class="table-wrap"><table>
        <tr><th>N°</th><th>Client</th><th>Ville</th><th>Total</th><th>Statut</th><th>Date</th></tr>
        <?php foreach ($orders as $o): ?>
        <tr class="clickable" data-href="order.php?id=<?= (int)$o['id'] ?>">
            <td><a href="order.php?id=<?= (int)$o['id'] ?>"><strong><?= e($o['ref']) ?></strong></a></td>
            <td><?= e($o['name']) ?><br><span class="muted"><?= e($o['phone']) ?></span></td>
            <td><?= e($o['city']) ?></td>
            <td><?= e(money($o['total'])) ?></td>
            <td><?= status_pill($o['status']) ?></td>
            <td class="muted"><?= e(ago((int)$o['created_at'])) ?></td>
        </tr>
        <?php endforeach; ?>
    </table></div>
    <?php endif; ?>
</div>
<?php admin_footer();

function jev_key_set(): bool
{
    require_once ROOT . '/inc/finder.php';
    return jev_key() !== '';
}
