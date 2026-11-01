<?php
require __DIR__ . '/inc/bootstrap.php';
require __DIR__ . '/inc/layout.php';
require __DIR__ . '/inc/orders.php';

$errors = [];
$v = ['name' => '', 'phone' => '', 'city' => '', 'address' => '', 'note' => '', 'gift_wrap' => '', 'gift_message' => '', 'cart' => '[]'];

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    csrf_check();
    foreach ($v as $k => $_) $v[$k] = is_string($_POST[$k] ?? null) ? $_POST[$k] : '';
    $items = json_decode($v['cart'], true);
    $cart = price_cart(is_array($items) ? $items : []);
    $res = create_order($_POST, $cart);
    if (isset($res['ref'])) redirect(url('order.php', ['ref' => $res['ref'], 't' => $res['token']]));
    $errors = $res['errors'];
}

$wrapFee = (int)setting('wrap_fee', '25');
page_header(t('co_title'), ['body' => 'checkout-page']);
?>
<section class="wrap checkout">
    <div class="page-head">
        <h1 class="display small"><?= e(t('co_title')) ?></h1>
        <p class="muted"><?= e(t('co_sub')) ?></p>
    </div>
    <?php if (isset($errors['cart'])): ?><div class="alert error"><?= e($errors['cart']) ?></div><?php endif; ?>

    <form method="post" class="co-grid" data-checkout data-wrap-fee="<?= $wrapFee ?>" novalidate>
        <?= csrf_field() ?>
        <input type="hidden" name="cart" value="<?= e($v['cart']) ?>" data-cart-field>
        <div class="co-form">
            <div class="field <?= isset($errors['name']) ? 'bad' : '' ?>">
                <label for="name"><?= e(t('co_name')) ?></label>
                <input id="name" name="name" value="<?= e($v['name']) ?>" autocomplete="name" required>
                <?php if (isset($errors['name'])): ?><small><?= e($errors['name']) ?></small><?php endif; ?>
            </div>
            <div class="field <?= isset($errors['phone']) ? 'bad' : '' ?>">
                <label for="phone"><?= e(t('co_phone')) ?></label>
                <input id="phone" name="phone" value="<?= e($v['phone']) ?>" type="tel" inputmode="tel" autocomplete="tel" placeholder="06 12 34 56 78" dir="ltr" required>
                <?php if (isset($errors['phone'])): ?><small><?= e($errors['phone']) ?></small><?php endif; ?>
            </div>
            <div class="field <?= isset($errors['city']) ? 'bad' : '' ?>">
                <label for="city"><?= e(t('co_city')) ?></label>
                <select id="city" name="city" required>
                    <option value=""><?= e(t('co_city_pick')) ?></option>
                    <?php foreach (cities() as $c): ?><option <?= $v['city'] === $c ? 'selected' : '' ?>><?= e($c) ?></option><?php endforeach; ?>
                </select>
                <?php if (isset($errors['city'])): ?><small><?= e($errors['city']) ?></small><?php endif; ?>
            </div>
            <div class="field <?= isset($errors['address']) ? 'bad' : '' ?>">
                <label for="address"><?= e(t('co_address')) ?></label>
                <textarea id="address" name="address" rows="2" placeholder="<?= e(t('co_address_ph')) ?>" autocomplete="street-address" required><?= e($v['address']) ?></textarea>
                <?php if (isset($errors['address'])): ?><small><?= e($errors['address']) ?></small><?php endif; ?>
            </div>

            <label class="wrap-opt">
                <input type="checkbox" name="gift_wrap" value="1" <?= $v['gift_wrap'] ? 'checked' : '' ?> data-wrap>
                <span class="wrap-card">
                    <span class="wrap-ic"><?= icon('ribbon', 24) ?></span>
                    <span><strong><?= e(t('co_wrap')) ?></strong><span class="muted tiny"><?= e(t('co_wrap_sub')) ?></span></span>
                    <span class="wrap-price">+<?= e(money($wrapFee)) ?></span>
                </span>
            </label>
            <div class="field" data-message <?= $v['gift_wrap'] ? '' : 'hidden' ?>>
                <label for="gift_message"><?= e(t('co_message')) ?></label>
                <textarea id="gift_message" name="gift_message" rows="2" maxlength="300" placeholder="<?= e(t('co_message_ph')) ?>" dir="auto"><?= e($v['gift_message']) ?></textarea>
            </div>
            <div class="field">
                <label for="note"><?= e(t('co_note')) ?> <em class="opt"><?= e(t('f_optional')) ?></em></label>
                <input id="note" name="note" value="<?= e($v['note']) ?>">
            </div>

            <div class="pay-box">
                <span class="tiny muted"><?= e(t('co_pay')) ?></span>
                <div class="pay-opt"><?= icon('cash', 24) ?><div><strong><?= e(t('trust_cod')) ?></strong><span class="muted tiny"><?= e(t('cod_note')) ?></span></div><?= icon('check', 20) ?></div>
            </div>
        </div>

        <aside class="co-summary">
            <h2 class="h3"><?= e(t('co_summary')) ?></h2>
            <div class="co-lines" data-co-lines></div>
            <div class="co-totals">
                <div class="row"><span><?= e(t('subtotal')) ?></span><span data-co-subtotal>—</span></div>
                <div class="row"><span><?= e(t('delivery')) ?></span><span data-co-delivery>—</span></div>
                <div class="row" data-co-wrap-row hidden><span><?= e(t('co_wrap_fee')) ?></span><span><?= e(money($wrapFee)) ?></span></div>
                <div class="row total"><span><?= e(t('total')) ?></span><strong data-co-total>—</strong></div>
            </div>
            <button class="btn primary big block shine" type="submit" data-co-submit><?= e(t('co_submit')) ?></button>
            <p class="tiny muted center"><?= icon('cash', 15) ?> <?= e(t('cod_note')) ?></p>
        </aside>
    </form>
</section>
<?php page_footer();
