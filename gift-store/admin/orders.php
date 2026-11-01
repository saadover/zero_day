<?php
require __DIR__ . '/_inc.php';
require ROOT . '/inc/orders.php';
require_admin();

$status = (string)($_GET['status'] ?? '');
$s = trim((string)($_GET['s'] ?? ''));
$where = '1=1';
$args = [];
if (isset(ORDER_STATUSES[$status])) { $where .= ' AND status = ?'; $args[] = $status; }
if ($s !== '') { $where .= ' AND (ref LIKE ? OR name LIKE ? OR phone LIKE ?)'; array_push($args, "%$s%", "%$s%", '%' . preg_replace('/\D/', '', $s) . '%'); }
$orders = q("SELECT * FROM orders WHERE $where ORDER BY created_at DESC LIMIT 300", $args)->fetchAll();
$counts = [];
foreach (q('SELECT status, COUNT(*) AS n FROM orders GROUP BY status')->fetchAll() as $r) $counts[$r['status']] = (int)$r['n'];

if (($_GET['export'] ?? '') === 'csv') {
    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="commandes-' . date('Y-m-d') . '.csv"');
    $out = fopen('php://output', 'w');
    fwrite($out, "\xEF\xBB\xBF");
    fputcsv($out, ['N°', 'Date', 'Nom', 'Téléphone', 'Ville', 'Adresse', 'Articles', 'Emballage', 'Message', 'Total', 'Statut'], ';');
    foreach ($orders as $o) {
        $items = implode(' + ', array_map(fn($i) => $i['qty'] . '× ' . $i['name'], q('SELECT * FROM order_items WHERE order_id = ?', [$o['id']])->fetchAll()));
        fputcsv($out, [$o['ref'], date('d/m/Y H:i', (int)$o['created_at']), $o['name'], $o['phone'], $o['city'], $o['address'], $items, $o['gift_wrap'] ? 'oui' : 'non', $o['gift_message'], $o['total'], ORDER_STATUSES[$o['status']] ?? $o['status']], ';');
    }
    exit;
}

admin_header('Commandes', 'orders');
?>
<div class="page-top">
    <h1>Commandes</h1>
    <a class="btn" href="?<?= e(http_build_query(array_merge($_GET, ['export' => 'csv']))) ?>">Exporter (Excel)</a>
</div>
<div class="tabs">
    <a href="orders.php" class="<?= $status === '' ? 'on' : '' ?>">Toutes</a>
    <?php foreach (ORDER_STATUSES as $k => $l): ?><a href="?status=<?= $k ?>" class="<?= $status === $k ? 'on' : '' ?>"><?= e($l) ?> <span><?= $counts[$k] ?? 0 ?></span></a><?php endforeach; ?>
</div>
<form class="toolbar">
    <?php if ($status): ?><input type="hidden" name="status" value="<?= e($status) ?>"><?php endif; ?>
    <input name="s" value="<?= e($s) ?>" placeholder="N°, nom ou téléphone">
    <button class="btn">Rechercher</button>
</form>
<div class="panel">
<?php if (!$orders): ?><p class="muted">Aucune commande.</p><?php else: ?>
<div class="table-wrap"><table>
    <tr><th>N°</th><th>Client</th><th>Ville</th><th>Total</th><th>Statut</th><th>Date</th></tr>
    <?php foreach ($orders as $o): ?>
    <tr class="clickable" data-href="order.php?id=<?= (int)$o['id'] ?>">
        <td><a href="order.php?id=<?= (int)$o['id'] ?>"><strong><?= e($o['ref']) ?></strong></a><?= $o['gift_wrap'] ? ' 🎁' : '' ?></td>
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
