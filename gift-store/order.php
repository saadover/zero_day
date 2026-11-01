<?php
require __DIR__ . '/inc/bootstrap.php';
require __DIR__ . '/inc/layout.php';

$o = q('SELECT * FROM orders WHERE ref = ?', [(string)($_GET['ref'] ?? '')])->fetch();
if (!$o || !hash_equals($o['token'], (string)($_GET['t'] ?? ''))) redirect(url());
$items = q('SELECT * FROM order_items WHERE order_id = ?', [$o['id']])->fetchAll();

page_header(t('ok_title'), ['body' => 'order-page']);
?>
<section class="wrap order-ok" data-order-done>
    <div class="ok-burst" aria-hidden="true"><span class="ok-circle"><?= icon('check', 44) ?></span><?php for ($i = 0; $i < 14; $i++): ?><i style="--a:<?= $i * 360 / 14 ?>deg;--d:<?= $i * 25 ?>ms"></i><?php endfor; ?></div>
    <h1 class="display small center"><?= e(t('ok_title')) ?></h1>
    <p class="lead center"><?= e(t('ok_sub', ['p' => trim(chunk_split($o['phone'], 2, ' ')), 't' => money($o['total'])])) ?></p>
    <div class="receipt">
        <div class="row"><span class="muted"><?= e(t('ok_ref')) ?></span><strong><?= e($o['ref']) ?></strong></div>
        <?php foreach ($items as $it): ?>
            <div class="row"><span><?= (int)$it['qty'] ?> × <?= e($it['name']) ?></span><span><?= e(money($it['price'] * $it['qty'])) ?></span></div>
        <?php endforeach; ?>
        <div class="row"><span class="muted"><?= e(t('delivery')) ?></span><span><?= $o['delivery'] ? e(money($o['delivery'])) : e(t('free')) ?></span></div>
        <?php if ($o['wrap_fee']): ?><div class="row"><span class="muted"><?= e(t('co_wrap_fee')) ?></span><span><?= e(money($o['wrap_fee'])) ?></span></div><?php endif; ?>
        <div class="row total"><span><?= e(t('total')) ?></span><strong><?= e(money($o['total'])) ?></strong></div>
    </div>
    <p class="center"><a class="btn primary" href="<?= e(url('shop.php')) ?>"><?= e(t('ok_back')) ?> <?= icon('arrow', 18) ?></a></p>
</section>
<?php page_footer();
