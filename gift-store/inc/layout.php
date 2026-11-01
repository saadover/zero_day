<?php
// Page shell (header, mobile tab bar, cart drawer, footer) and the product card.

function icon(string $name, int $size = 22): string
{
    $p = [
        'bag' => '<path d="M5 8h14l-1.2 11.2a2 2 0 01-2 1.8H8.2a2 2 0 01-2-1.8z"/><path d="M9 8V6.5a3 3 0 016 0V8"/>',
        'search' => '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>',
        'home' => '<path d="M4 10.5L12 4l8 6.5V20a1 1 0 01-1 1h-4.5v-6h-5v6H5a1 1 0 01-1-1z"/>',
        'grid' => '<rect x="4" y="4" width="7" height="7" rx="2"/><rect x="13" y="4" width="7" height="7" rx="2"/><rect x="4" y="13" width="7" height="7" rx="2"/><rect x="13" y="13" width="7" height="7" rx="2"/>',
        'gift' => '<rect x="3.5" y="8" width="17" height="4.5" rx="1"/><path d="M5 12.5V20a1 1 0 001 1h12a1 1 0 001-1v-7.5M12 8v13"/><path d="M12 8C10.5 5 7 4.2 7 6.4 7 8 12 8 12 8zm0 0c1.5-3 5-3.8 5-1.6C17 8 12 8 12 8z"/>',
        'sparkle' => '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 16l.7 1.8 1.8.7-1.8.7L19 21l-.7-1.8-1.8-.7 1.8-.7z"/>',
        'close' => '<path d="M6 6l12 12M18 6L6 18"/>',
        'plus' => '<path d="M12 5v14M5 12h14"/>',
        'minus' => '<path d="M5 12h14"/>',
        'arrow' => '<path d="M5 12h14M13 6l6 6-6 6"/>',
        'truck' => '<path d="M3 6h11v10H3zM14 10h4l3 3v3h-7z"/><circle cx="7" cy="17.5" r="1.8"/><circle cx="17.5" cy="17.5" r="1.8"/>',
        'cash' => '<rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.6"/><path d="M6.5 9.5v5M17.5 9.5v5"/>',
        'ribbon' => '<path d="M12 8C10 4 5.5 4 6 7c.4 2.4 6 1 6 1zm0 0c2-4 6.5-4 6-1-.4 2.4-6 1-6 1z"/><path d="M12 8l-4 12 3-2 1 3 1-3 3 2z"/>',
        'whatsapp' => '<path d="M4 20l1.3-4A8 8 0 1112 20a8 8 0 01-4-1.1z"/><path d="M9 9.5c0 3 2.5 5.5 5.5 5.5l1-1.5-2-1-1 .8a4 4 0 01-1.8-1.8l.8-1-1-2z"/>',
        'check' => '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
        'heart' => '<path d="M12 20s-7-4.4-7-10a4 4 0 017-2.6A4 4 0 0119 10c0 5.6-7 10-7 10z"/>',
    ][$name] ?? '';
    return '<svg class="i" width="' . $size . '" height="' . $size . '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' . $p . '</svg>';
}

function logo(): string
{
    return '<span class="logo-mark" aria-hidden="true"><svg viewBox="0 0 32 32" width="30" height="30"><rect x="5" y="13" width="22" height="15" rx="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M16 13v15M5 18h22" stroke="currentColor" stroke-width="2"/><path class="logo-bow" d="M16 13c-2.5-5-8-6-7.5-2.6C9 13 16 13 16 13zm0 0c2.5-5 8-6 7.5-2.6C23 13 16 13 16 13z" fill="var(--accent)"/></svg></span><span class="logo-word">' . e(store_name()) . '</span>';
}

function page_header(string $title = '', array $opt = []): void
{
    $active = $opt['active'] ?? '';
    $full = $title ? $title . ' · ' . store_name() : store_name() . ' — ' . t('hero_kicker');
    $desc = $opt['description'] ?? t('footer_tag');
    $settings = [
        'deliveryFee' => (int)setting('delivery_fee', '35'),
        'freeFrom' => (int)setting('free_delivery_from', '499'),
        'currency' => t('currency'),
        'lang' => lang(),
        'base' => base_url(),
        'csrf' => csrf_token(),
        't' => [
            'added' => t('added'), 'add' => t('add_to_cart'), 'empty' => t('cart_empty'), 'free' => t('free'),
            'freeLeft' => t('free_left'), 'freeOk' => t('free_ok'), 'remove' => t('remove'),
            'thinking' => [t('thinking_1'), t('thinking_2'), t('thinking_3')],
            'years' => t('f_years'), 'match' => t('res_match'), 'best' => t('res_best'), 'error' => t('res_error'),
            'ages' => [t('age_baby'), t('age_kid'), t('age_teen'), t('age_young'), t('age_adult'), t('age_senior')],
            'view' => t('view'), 'pickGender' => t('f_pick_gender'), 'pickRelation' => t('f_pick_relation'),
        ],
    ];
    ?><!doctype html>
<html lang="<?= e(lang()) ?>" dir="<?= is_rtl() ? 'rtl' : 'ltr' ?>">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title><?= e($full) ?></title>
<meta name="description" content="<?= e($desc) ?>">
<meta name="theme-color" content="#ffffff">
<meta property="og:title" content="<?= e($full) ?>">
<meta property="og:description" content="<?= e($desc) ?>">
<?php if (!empty($opt['image'])): ?><meta property="og:image" content="<?= e($opt['image']) ?>"><?php endif; ?>
<script>document.documentElement.classList.add('js')</script>
<link rel="icon" href="<?= e(url('assets/img/favicon.svg')) ?>" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500;0,9..144,600;1,9..144,400;1,9..144,500&family=Manrope:wght@400;500;600;700&family=Noto+Kufi+Arabic:wght@400;500;700&display=swap">
<link rel="stylesheet" href="<?= e(asset('css/style.css')) ?>">
<script>window.STORE = <?= json_encode($settings, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_HEX_TAG) ?>;</script>
<script src="<?= e(asset('js/app.js')) ?>" defer></script>
</head>
<body class="<?= e($opt['body'] ?? '') ?>">
<a class="skip" href="#main">Skip</a>
<div class="ticker" aria-hidden="true"><div class="ticker-track">
    <?php for ($i = 0; $i < 2; $i++): ?><span><?= icon('cash', 15) ?> <?= e(t('trust_cod')) ?></span><span><?= icon('truck', 15) ?> <?= e(t('trust_ship')) ?></span><span><?= icon('ribbon', 15) ?> <?= e(t('trust_wrap')) ?></span><span><?= icon('sparkle', 15) ?> <?= e(t('hero_kicker')) ?></span><?php endfor; ?>
</div></div>
<header class="topbar" id="topbar">
    <div class="wrap topbar-in">
        <a class="logo" href="<?= e(url()) ?>" aria-label="<?= e(store_name()) ?>"><?= logo() ?></a>
        <nav class="topnav" aria-label="Menu">
            <a href="<?= e(url()) ?>" class="<?= $active === 'home' ? 'on' : '' ?>"><?= e(t('nav_home')) ?></a>
            <a href="<?= e(url('shop.php')) ?>" class="<?= $active === 'shop' ? 'on' : '' ?>"><?= e(t('nav_shop')) ?></a>
            <a href="<?= e(url('', [])) ?>#finder"><?= e(t('nav_finder')) ?> <span class="ai-dot">AI</span></a>
        </nav>
        <form class="search" action="<?= e(url('shop.php')) ?>" role="search">
            <?= icon('search', 18) ?>
            <input name="q" value="<?= e($_GET['q'] ?? '') ?>" placeholder="<?= e(t('search_ph')) ?>" aria-label="<?= e(t('search_ph')) ?>">
        </form>
        <div class="top-actions">
            <div class="langs" role="group" aria-label="Langue">
                <?php foreach (LANGS as $code => $label): ?>
                    <a href="?<?= e(http_build_query(array_merge($_GET, ['lang' => $code]))) ?>" class="<?= lang() === $code ? 'on' : '' ?>" hreflang="<?= $code ?>"><?= e($label) ?></a>
                <?php endforeach; ?>
            </div>
            <button class="icon-btn search-toggle" type="button" aria-label="<?= e(t('search_ph')) ?>" data-search-toggle><?= icon('search') ?></button>
            <button class="icon-btn cart-btn" type="button" aria-label="<?= e(t('nav_cart')) ?>" data-cart-open><?= icon('bag') ?><span class="badge" data-cart-count hidden>0</span></button>
        </div>
    </div>
</header>
<main id="main">
<?php
}

function page_footer(array $opt = []): void
{
    $wa = setting('whatsapp');
    $active = $opt['active'] ?? '';
    ?>
</main>
<footer class="footer">
    <div class="wrap footer-in">
        <div>
            <a class="logo" href="<?= e(url()) ?>"><?= logo() ?></a>
            <p class="muted"><?= e(t('footer_tag')) ?></p>
        </div>
        <div class="footer-trust">
            <span><?= icon('cash', 18) ?> <?= e(t('trust_cod')) ?></span>
            <span><?= icon('truck', 18) ?> <?= e(t('trust_ship')) ?></span>
            <span><?= icon('ribbon', 18) ?> <?= e(t('trust_wrap')) ?></span>
        </div>
        <div>
            <strong><?= e(t('footer_help')) ?></strong>
            <?php if ($wa): ?><p><a class="link" href="https://wa.me/<?= e($wa) ?>" target="_blank" rel="noopener"><?= icon('whatsapp', 18) ?> WhatsApp</a></p><?php endif; ?>
            <?php if (setting('store_phone')): ?><p><a class="link" href="tel:<?= e(setting('store_phone')) ?>"><?= e(setting('store_phone')) ?></a></p><?php endif; ?>
            <?php if (setting('instagram')): ?><p><a class="link" href="https://instagram.com/<?= e(ltrim(setting('instagram'), '@')) ?>" target="_blank" rel="noopener">Instagram</a></p><?php endif; ?>
        </div>
    </div>
    <div class="wrap footer-base muted">© <?= date('Y') ?> <?= e(store_name()) ?></div>
</footer>

<nav class="tabbar" aria-label="Menu">
    <a href="<?= e(url()) ?>" class="<?= $active === 'home' ? 'on' : '' ?>"><?= icon('home') ?><span><?= e(t('nav_home')) ?></span></a>
    <a href="<?= e(url('shop.php')) ?>" class="<?= $active === 'shop' ? 'on' : '' ?>"><?= icon('grid') ?><span><?= e(t('nav_shop')) ?></span></a>
    <a href="<?= e(url()) ?>#finder" class="tab-ai" data-finder-link><span class="tab-ai-bubble"><?= icon('sparkle') ?></span><span><?= e(t('nav_finder')) ?></span></a>
    <button type="button" data-cart-open><?= icon('bag') ?><span><?= e(t('nav_cart')) ?></span><span class="badge" data-cart-count hidden>0</span></button>
</nav>

<div class="drawer-scrim" data-cart-close hidden></div>
<aside class="drawer" id="cart" aria-label="<?= e(t('cart_title')) ?>" aria-hidden="true">
    <div class="drawer-head">
        <h2><?= e(t('cart_title')) ?></h2>
        <button class="icon-btn" type="button" data-cart-close aria-label="Close"><?= icon('close') ?></button>
    </div>
    <div class="free-meter" data-free-meter><div class="free-bar"><i></i></div><p></p></div>
    <div class="drawer-body" data-cart-items></div>
    <div class="drawer-empty" data-cart-empty>
        <div class="empty-art"><?= icon('gift', 56) ?></div>
        <p><?= e(t('cart_empty')) ?></p>
        <a class="btn ghost" href="<?= e(url()) ?>#finder" data-cart-close><?= icon('sparkle', 18) ?> <?= e(t('cart_empty_cta')) ?></a>
    </div>
    <div class="drawer-foot" data-cart-foot>
        <div class="row"><span><?= e(t('subtotal')) ?></span><strong data-cart-subtotal></strong></div>
        <a class="btn primary block" href="<?= e(url('checkout.php')) ?>"><?= e(t('checkout')) ?> <?= icon('arrow', 18) ?></a>
        <p class="tiny muted center"><?= icon('cash', 15) ?> <?= e(t('cod_note')) ?></p>
    </div>
</aside>
<div class="toast" role="status" aria-live="polite" data-toast></div>
</body>
</html>
<?php
}

function product_card(array $p, string $extra = ''): string
{
    $off = ($p['compare_price'] && $p['compare_price'] > $p['price']) ? round(100 - $p['price'] * 100 / $p['compare_price']) : 0;
    $stock = in_stock($p);
    ob_start(); ?>
    <article class="card reveal <?= e($extra) ?>">
        <a class="card-media" href="<?= e($p['url']) ?>">
            <img src="<?= e(img_url($p['image'])) ?>" alt="<?= e($p['name']) ?>" loading="lazy" decoding="async" width="400" height="400">
            <?php if ($off): ?><span class="pill sale">-<?= $off ?>%</span><?php endif; ?>
            <?php if (!$stock): ?><span class="pill dark"><?= e(t('out_of_stock')) ?></span><?php endif; ?>
        </a>
        <div class="card-body">
            <?php if (!empty($p['category'])): ?><span class="card-cat"><?= e($p['category']) ?></span><?php endif; ?>
            <h3><a href="<?= e($p['url']) ?>"><?= e($p['name']) ?></a></h3>
            <div class="card-foot">
                <div class="price"><strong><?= e(money($p['price'])) ?></strong><?php if ($off): ?> <s><?= e(money($p['compare_price'])) ?></s><?php endif; ?></div>
                <?php if ($stock): ?>
                <button class="add-btn" type="button" aria-label="<?= e(t('add_to_cart')) ?>" data-add='<?= e(json_encode(['id' => (int)$p['id'], 'name' => $p['name'], 'price' => (int)$p['price'], 'image' => img_url($p['image']), 'url' => $p['url']], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)) ?>'><?= icon('plus', 20) ?></button>
                <?php endif; ?>
            </div>
        </div>
    </article>
    <?php return ob_get_clean();
}

// Active products with their category name.
function products_query(string $where = '1=1', array $args = [], string $order = 'p.created_at DESC', int $limit = 48, int $offset = 0): array
{
    $rows = q("SELECT p.*, c.name AS category, c.slug AS category_slug FROM products p LEFT JOIN categories c ON c.id = p.category_id WHERE p.active = 1 AND ($where) ORDER BY $order LIMIT $limit OFFSET $offset", $args)->fetchAll();
    return hydrate_products($rows);
}
