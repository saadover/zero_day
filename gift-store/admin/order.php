<?php
require __DIR__ . '/_inc.php';
require ROOT . '/inc/orders.php';
require_admin();

$id = (int)($_GET['id'] ?? 0);
$o = q('SELECT * FROM orders WHERE id = ?', [$id])->fetch();
if (!$o) redirect(url('admin/orders.php'));

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    csrf_check();
    $st = (string)($_POST['status'] ?? $o['status']);
    if (isset(ORDER_STATUSES[$st])) {
        // Put stock back when an order is cancelled or returned, take it again if reopened.
        $wasOut = in_array($o['status'], ['cancelled', 'returned'], true);
        $isOut = in_array($st, ['cancelled', 'returned'], true);
        if ($wasOut !== $isOut) {
            foreach (q('SELECT * FROM order_items WHERE order_id = ?', [$id])->fetchAll() as $it) {
                q('UPDATE products SET stock = stock ' . ($isOut ? '+' : '-') . ' ? WHERE id = ? AND stock IS NOT NULL', [$it['qty'], $it['product_id']]);
            }
        }
        q('UPDATE orders SET status = ?, admin_note = ? WHERE id = ?', [$st, mb_substr(trim((string)($_POST['admin_note'] ?? '')), 0, 1000), $id]);
        flash('Commande mise à jour.');
    }
    redirect(url('admin/order.php', ['id' => $id]));
}

$items = q('SELECT * FROM order_items WHERE order_id = ?', [$id])->fetchAll();
$intl = '212' . substr($o['phone'], 1);
$msg = "Bonjour {$o['name']}, ici " . store_name() . ". Nous confirmons votre commande {$o['ref']} d'un total de {$o['total']} DH, livrée à {$o['city']}. Merci !";

admin_header('Commande ' . $o['ref'], 'orders');
?>
<div class="page-top">
    <h1>Commande <?= e($o['ref']) ?> <?= status_pill($o['status']) ?></h1>
    <a class="btn" href="orders.php">← Commandes</a>
</div>
<div class="two">
    <div>
        <div class="panel">
            <h2>Client</h2>
            <p><strong><?= e($o['name']) ?></strong><br><?= e(trim(chunk_split($o['phone'], 2, ' '))) ?><br><?= e($o['city']) ?><br><?= nl2br(e($o['address'])) ?></p>
            <?php if ($o['note']): ?><p class="note">📝 <?= e($o['note']) ?></p><?php endif; ?>
            <div class="actions">
                <a class="btn primary" href="tel:<?= e($o['phone']) ?>">📞 Appeler</a>
                <a class="btn wa" href="https://wa.me/<?= e($intl) ?>?text=<?= rawurlencode($msg) ?>" target="_blank" rel="noopener">WhatsApp</a>
            </div>
        </div>
        <div class="panel">
            <h2>Articles</h2>
            <?php foreach ($items as $it): ?><div class="line-row"><span><?= (int)$it['qty'] ?> × <?= e($it['name']) ?></span><span><?= e(money($it['price'] * $it['qty'])) ?></span></div><?php endforeach; ?>
            <div class="line-row muted"><span>Livraison</span><span><?= e(money($o['delivery'])) ?></span></div>
            <?php if ($o['gift_wrap']): ?><div class="line-row muted"><span>Emballage cadeau 🎁</span><span><?= e(money($o['wrap_fee'])) ?></span></div><?php endif; ?>
            <div class="line-row total"><span>Total à encaisser</span><strong><?= e(money($o['total'])) ?></strong></div>
            <?php if ($o['gift_wrap'] && $o['gift_message']): ?><p class="note">💌 Message de la carte : « <?= e($o['gift_message']) ?> »</p><?php endif; ?>
        </div>
    </div>
    <form method="post" class="panel">
        <?= csrf_field() ?>
        <h2>Suivi</h2>
        <div class="status-pick">
            <?php foreach (ORDER_STATUSES as $k => $l): ?><label><input type="radio" name="status" value="<?= $k ?>" <?= $o['status'] === $k ? 'checked' : '' ?>><span class="st st-<?= $k ?>"><?= e($l) ?></span></label><?php endforeach; ?>
        </div>
        <label>Note interne <textarea name="admin_note" rows="4" placeholder="ex. confirmée par téléphone, livreur Amana n°…"><?= e($o['admin_note']) ?></textarea></label>
        <button class="btn primary">Enregistrer</button>
        <p class="muted small">Passée le <?= date('d/m/Y à H:i', (int)$o['created_at']) ?></p>
    </form>
</div>
<?php admin_footer();
