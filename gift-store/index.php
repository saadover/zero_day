<?php
require __DIR__ . '/inc/bootstrap.php';
require __DIR__ . '/inc/layout.php';

$featured = products_query('p.featured = 1', [], 'p.created_at DESC', 8);
$newest = products_query('1=1', [], 'p.created_at DESC', 8);
$cats = q('SELECT c.*, (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id AND p.active = 1) AS n,
                  (SELECT i.path FROM product_images i JOIN products p ON p.id = i.product_id WHERE p.category_id = c.id AND p.active = 1 ORDER BY p.featured DESC, i.sort LIMIT 1) AS image
           FROM categories c ORDER BY c.sort, c.name')->fetchAll();
$cats = array_filter($cats, fn($c) => $c['n'] > 0);

$bmin = (int)setting('budget_min', '50');
$bmax = (int)setting('budget_max', '5000');
$examples = [
    'kaybghi lkora w l9hwa, w kaykhdem f bureau',
    'Elle adore lire et boit du thé toute la journée',
    'He\'s into gaming and just passed his bac',
    'ماكيبغيش العطور، كيحب السفر و التصاور',
    'Elle vient d\'avoir un bébé, elle est très fatiguée',
    'katbghi lmekyaj w l3tr, 3id miladha ghedda',
];

page_header('', ['active' => 'home', 'body' => 'home']);
?>
<section class="hero" id="finder">
    <div class="hero-deco" aria-hidden="true">
        <span class="blob b1"></span><span class="blob b2"></span><span class="blob b3"></span>
        <svg class="zellige" viewBox="0 0 200 200"><defs><pattern id="z" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M20 0l6 14 14 6-14 6-6 14-6-14-14-6 14-6z" fill="none" stroke="currentColor" stroke-width=".8"/></pattern></defs><rect width="200" height="200" fill="url(#z)"/></svg>
        <span class="float-gift g1"><?= icon('gift', 34) ?></span>
        <span class="float-gift g2"><?= icon('heart', 26) ?></span>
        <span class="float-gift g3"><?= icon('sparkle', 28) ?></span>
    </div>
    <div class="wrap hero-in">
        <div class="hero-copy">
            <span class="kicker"><span class="kicker-dot"></span><?= e(t('hero_kicker')) ?></span>
            <h1 class="display"><?= t('hero_title') ?></h1>
            <p class="lead"><?= e(t('hero_sub')) ?></p>
            <ol class="hero-steps">
                <li><?= e(t('step_1')) ?></li>
                <li><?= e(t('step_2')) ?></li>
                <li><?= e(t('step_3')) ?></li>
            </ol>
        </div>

        <form class="finder" data-finder novalidate>
            <div class="step">
                <div class="step-label"><span class="step-n">01</span><?= e(t('f_gender')) ?></div>
                <div class="gender">
                    <label class="gender-opt">
                        <input type="radio" name="gender" value="male">
                        <span class="gender-card"><span class="gender-glyph">♂</span><?= e(t('f_him')) ?></span>
                    </label>
                    <label class="gender-opt">
                        <input type="radio" name="gender" value="female">
                        <span class="gender-card"><span class="gender-glyph">♀</span><?= e(t('f_her')) ?></span>
                    </label>
                </div>
            </div>

            <div class="step">
                <div class="step-label"><span class="step-n">02</span><?= e(t('f_age')) ?>
                    <output class="step-value" data-age-out><b>30</b> <?= e(t('f_years')) ?> <small></small></output>
                </div>
                <div class="range single">
                    <div class="range-track"><i data-age-fill></i></div>
                    <input type="range" name="age" min="0" max="90" step="1" value="30" aria-label="<?= e(t('f_age')) ?>" data-age>
                </div>
                <div class="range-scale"><span>0</span><span>18</span><span>35</span><span>60</span><span>90+</span></div>
            </div>

            <div class="step">
                <div class="step-label"><span class="step-n">03</span><?= e(t('f_relation')) ?></div>
                <div class="chips" data-relations>
                    <?php foreach (relations() as $key => $r): ?>
                        <label class="chip">
                            <input type="radio" name="relation" value="<?= e($key) ?>">
                            <span data-m="<?= e($r['m'][lang()]) ?>" data-f="<?= e($r['f'][lang()]) ?>"><?= e($r['m'][lang()]) ?></span>
                        </label>
                    <?php endforeach; ?>
                </div>
            </div>

            <div class="step">
                <div class="step-label"><span class="step-n">04</span><?= e(t('f_budget')) ?>
                    <output class="step-value" data-budget-out></output>
                </div>
                <div class="range dual" data-budget data-min="<?= $bmin ?>" data-max="<?= $bmax ?>">
                    <div class="range-track"><i data-budget-fill></i></div>
                    <input type="range" min="0" max="100" value="0" aria-label="Min" data-budget-lo>
                    <input type="range" min="0" max="100" value="100" aria-label="Max" data-budget-hi>
                </div>
                <div class="range-scale"><span><?= e(money($bmin)) ?></span><span><?= e(money($bmax)) ?>+</span></div>
            </div>

            <div class="step">
                <div class="step-label"><span class="step-n">05</span><?= e(t('f_notes')) ?> <em class="opt"><?= e(t('f_optional')) ?></em></div>
                <div class="notes">
                    <textarea name="note" rows="3" maxlength="600" data-examples='<?= e(json_encode($examples, JSON_UNESCAPED_UNICODE)) ?>' placeholder="<?= e($examples[0]) ?>" dir="auto"></textarea>
                    <span class="notes-hint"><?= icon('sparkle', 14) ?> <?= e(t('f_notes_hint')) ?></span>
                </div>
            </div>

            <p class="form-error" data-finder-error role="alert" hidden></p>
            <button class="btn primary big shine" type="submit"><?= icon('sparkle', 20) ?> <span><?= e(t('f_submit')) ?></span></button>
        </form>
    </div>
</section>

<section class="results wrap" id="results" hidden aria-live="polite">
    <div class="thinking" data-thinking>
        <div class="orb"><span></span><span></span><span></span></div>
        <p data-thinking-text><?= e(t('thinking_1')) ?></p>
    </div>
    <div data-results-body hidden>
        <div class="results-head">
            <div>
                <span class="kicker small"><span class="kicker-dot"></span><span data-source-label data-jev="<?= e(t('hero_kicker')) ?>" data-local="<?= e(t('res_local')) ?>"></span></span>
                <h2 class="h2"><?= e(t('res_title')) ?></h2>
            </div>
            <button class="btn ghost small" type="button" data-finder-edit><?= e(t('res_retry')) ?></button>
        </div>
        <div class="understood" data-understood hidden><span class="tiny muted"><?= e(t('res_understood')) ?> :</span></div>
        <div class="podium" data-top></div>
        <div data-more-wrap hidden>
            <h3 class="h3"><?= e(t('res_more')) ?></h3>
            <div class="grid" data-more></div>
        </div>
        <p class="empty-note" data-none hidden><?= e(t('res_none')) ?></p>
    </div>
</section>

<?php if ($cats): ?>
<section class="section">
    <div class="wrap">
        <div class="section-head reveal">
            <h2 class="h2"><?= e(t('sec_categories')) ?></h2>
            <a class="link" href="<?= e(url('shop.php')) ?>"><?= e(t('see_all')) ?> <?= icon('arrow', 16) ?></a>
        </div>
    </div>
    <div class="cat-rail">
        <?php foreach ($cats as $i => $c): ?>
            <a class="cat reveal" style="--d:<?= $i * 60 ?>ms" href="<?= e(url('shop.php', ['cat' => $c['slug']])) ?>">
                <span class="cat-img"><img src="<?= e(img_url($c['image'] ?: 'assets/img/demo/placeholder.svg')) ?>" alt="" loading="lazy" width="200" height="200"></span>
                <span class="cat-name"><?= e($c['name']) ?></span>
                <span class="cat-n tiny muted"><?= e(t('n_products', ['n' => $c['n']])) ?></span>
            </a>
        <?php endforeach; ?>
    </div>
</section>
<?php endif; ?>

<section class="section occasions-band">
    <div class="wrap">
        <div class="occasions reveal">
            <?php foreach (occasions() as $key => $o): ?>
                <a href="<?= e(url('shop.php', ['occasion' => $key])) ?>" class="occ"><?= e($o['label'][lang()]) ?></a>
            <?php endforeach; ?>
        </div>
    </div>
</section>

<?php if ($featured): ?>
<section class="section">
    <div class="wrap">
        <div class="section-head reveal">
            <div><h2 class="h2"><?= e(t('sec_featured')) ?></h2><p class="muted"><?= e(t('sec_featured_sub')) ?></p></div>
            <a class="link" href="<?= e(url('shop.php', ['sort' => 'featured'])) ?>"><?= e(t('see_all')) ?> <?= icon('arrow', 16) ?></a>
        </div>
        <div class="grid"><?php foreach ($featured as $p) echo product_card($p); ?></div>
    </div>
</section>
<?php endif; ?>

<section class="section">
    <div class="wrap">
        <div class="split-cta reveal">
            <a class="split for-him" href="<?= e(url('shop.php', ['for' => 'male'])) ?>"><span class="h2"><?= e(t('for_him')) ?></span><?= icon('arrow') ?></a>
            <a class="split for-her" href="<?= e(url('shop.php', ['for' => 'female'])) ?>"><span class="h2"><?= e(t('for_her')) ?></span><?= icon('arrow') ?></a>
        </div>
    </div>
</section>

<?php if ($newest): ?>
<section class="section">
    <div class="wrap">
        <div class="section-head reveal">
            <h2 class="h2"><?= e(t('sec_new')) ?></h2>
            <a class="link" href="<?= e(url('shop.php')) ?>"><?= e(t('see_all')) ?> <?= icon('arrow', 16) ?></a>
        </div>
        <div class="grid"><?php foreach ($newest as $p) echo product_card($p); ?></div>
    </div>
</section>
<?php endif; ?>

<section class="section trust-band">
    <div class="wrap trust">
        <div class="trust-item reveal"><span class="trust-ic"><?= icon('cash', 26) ?></span><strong><?= e(t('trust_cod')) ?></strong><span class="muted"><?= e(t('trust_cod_sub')) ?></span></div>
        <div class="trust-item reveal" style="--d:80ms"><span class="trust-ic"><?= icon('truck', 26) ?></span><strong><?= e(t('trust_ship')) ?></strong><span class="muted"><?= e(t('trust_ship_sub')) ?></span></div>
        <div class="trust-item reveal" style="--d:160ms"><span class="trust-ic"><?= icon('ribbon', 26) ?></span><strong><?= e(t('trust_wrap')) ?></strong><span class="muted"><?= e(t('trust_wrap_sub')) ?></span></div>
    </div>
</section>
<?php page_footer(['active' => 'home']);
