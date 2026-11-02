<?php
// What visitors asked the gift finder: useful to see which products are missing.
require __DIR__ . '/_inc.php';
require_admin();

$rows = q('SELECT * FROM finder_log ORDER BY created_at DESC LIMIT 200')->fetchAll();
$names = [];
foreach (q('SELECT id, name FROM products')->fetchAll() as $p) $names[(int)$p['id']] = $p['name'];
$empty = (int)q("SELECT COUNT(*) FROM finder_log WHERE results = '' AND created_at > ?", [time() - 30 * 86400])->fetchColumn();

admin_header('Recherches AI', 'searches');
?>
<h1>Recherches du conseiller cadeau</h1>
<p class="muted">Les 200 dernières demandes. Les recherches sans résultat montrent les cadeaux à ajouter au catalogue.</p>
<?php if ($empty): ?><div class="alert warn"><?= $empty ?> recherche(s) sans aucun résultat ces 30 derniers jours.</div><?php endif; ?>
<div class="panel">
<?php if (!$rows): ?><p class="muted">Aucune recherche pour l'instant.</p><?php else: ?>
<div class="table-wrap"><table>
    <tr><th>Pour</th><th>Budget</th><th>Description</th><th>Top 3 proposé</th><th>Date</th></tr>
    <?php foreach ($rows as $r):
        $ids = array_slice(list_split($r['results']), 0, 3); ?>
    <tr>
        <td><?= e(relation_label($r['relation'], $r['gender'], 'fr')) ?>, <?= (int)$r['age'] ?> ans</td>
        <td class="nowrap"><?= (int)$r['budget_min'] ?>–<?= (int)$r['budget_max'] >= 1e8 ? '∞' : (int)$r['budget_max'] ?> DH</td>
        <td><?= $r['note'] !== '' ? e($r['note']) : '<span class="muted">—</span>' ?></td>
        <td><?= $ids ? e(implode(' · ', array_map(fn($i) => $names[(int)$i] ?? '#' . $i, $ids))) : '<span class="st st-cancelled">Aucun résultat</span>' ?>
            <?= in_array($r['source'], ['ai', 'jev'], true) ? '<span class="st st-confirmed">IA</span>' : '' ?></td>
        <td class="muted nowrap"><?= e(ago((int)$r['created_at'])) ?></td>
    </tr>
    <?php endforeach; ?>
</table></div>
<?php endif; ?>
</div>
<?php admin_footer();
