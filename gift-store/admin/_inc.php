<?php
// Shared by every admin page: login check and the admin page shell.

require dirname(__DIR__) . '/inc/bootstrap.php';

function admin_id(): ?int
{
    return isset($_SESSION['admin_id']) ? (int)$_SESSION['admin_id'] : null;
}

function require_admin(): void
{
    if (!admin_id()) redirect(url('admin/login.php'));
}

function flash(?string $msg = null): ?string
{
    if ($msg !== null) {
        $_SESSION['flash'] = $msg;
        return null;
    }
    $m = $_SESSION['flash'] ?? null;
    unset($_SESSION['flash']);
    return $m;
}

function bump_catalog(): void
{
    save_setting('catalog_version', (string)((int)setting('catalog_version', '1') + 1));
}

function admin_header(string $title, string $active = ''): void
{
    $newOrders = (int)q("SELECT COUNT(*) FROM orders WHERE status = 'new'")->fetchColumn();
    $nav = [
        'index' => ['Tableau de bord', 'index.php'],
        'orders' => ['Commandes', 'orders.php'],
        'products' => ['Produits', 'products.php'],
        'categories' => ['Catégories', 'categories.php'],
        'searches' => ['Recherches AI', 'searches.php'],
        'settings' => ['Réglages', 'settings.php'],
    ];
    ?><!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title><?= e($title) ?> · Admin <?= e(store_name()) ?></title>
<link rel="icon" href="<?= e(url('assets/img/favicon.svg')) ?>">
<link rel="stylesheet" href="<?= e(asset('css/admin.css')) ?>">
</head>
<body>
<header class="a-top">
    <a class="a-brand" href="<?= e(url('admin/')) ?>"><?= e(store_name()) ?> <span>admin</span></a>
    <nav class="a-nav">
        <?php foreach ($nav as $key => [$label, $href]): ?>
            <a href="<?= e(url('admin/' . $href)) ?>" class="<?= $active === $key ? 'on' : '' ?>"><?= e($label) ?><?php if ($key === 'orders' && $newOrders): ?> <b class="a-badge"><?= $newOrders ?></b><?php endif; ?></a>
        <?php endforeach; ?>
    </nav>
    <div class="a-top-right">
        <a href="<?= e(url()) ?>" target="_blank">Voir la boutique ↗</a>
        <a href="<?= e(url('admin/logout.php')) ?>">Déconnexion</a>
    </div>
</header>
<main class="a-main">
<?php if ($m = flash()): ?><div class="alert ok"><?= e($m) ?></div><?php endif; ?>
<?php
}

function admin_footer(): void
{
    echo "</main>\n<script src=\"" . e(asset('js/admin.js')) . "\"></script>\n</body>\n</html>\n";
}

// Saves an uploaded image resized to at most 1400px, as WebP when the server
// supports it. Returns the stored path (relative to the site) or null.
function save_upload(array $file): ?string
{
    if (($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK || $file['size'] > 12 * 1024 * 1024) return null;
    $info = @getimagesize($file['tmp_name']);
    if (!$info || !in_array($info[2], [IMAGETYPE_JPEG, IMAGETYPE_PNG, IMAGETYPE_WEBP, IMAGETYPE_GIF], true)) return null;
    $dir = 'uploads/' . date('Y/m');
    if (!is_dir(ROOT . '/' . $dir)) mkdir(ROOT . '/' . $dir, 0755, true);
    $name = bin2hex(random_bytes(8));

    if (!function_exists('imagecreatetruecolor')) {
        $ext = image_type_to_extension($info[2], false);
        $path = "$dir/$name.$ext";
        return move_uploaded_file($file['tmp_name'], ROOT . '/' . $path) ? $path : null;
    }
    $src = match ($info[2]) {
        IMAGETYPE_JPEG => @imagecreatefromjpeg($file['tmp_name']),
        IMAGETYPE_PNG => @imagecreatefrompng($file['tmp_name']),
        IMAGETYPE_WEBP => @imagecreatefromwebp($file['tmp_name']),
        IMAGETYPE_GIF => @imagecreatefromgif($file['tmp_name']),
    };
    if (!$src) return null;
    if ($info[2] === IMAGETYPE_JPEG && function_exists('exif_read_data')) {
        $o = (int)(@exif_read_data($file['tmp_name'])['Orientation'] ?? 1);
        if ($o === 3) $src = imagerotate($src, 180, 0);
        elseif ($o === 6) $src = imagerotate($src, -90, 0);
        elseif ($o === 8) $src = imagerotate($src, 90, 0);
    }
    $w = imagesx($src);
    $h = imagesy($src);
    $scale = min(1, 1400 / max($w, $h));
    $nw = (int)round($w * $scale);
    $nh = (int)round($h * $scale);
    $dst = imagecreatetruecolor($nw, $nh);
    imagefill($dst, 0, 0, imagecolorallocate($dst, 255, 255, 255));
    imagecopyresampled($dst, $src, 0, 0, 0, 0, $nw, $nh, $w, $h);
    if (function_exists('imagewebp')) {
        $path = "$dir/$name.webp";
        imagewebp($dst, ROOT . '/' . $path, 82);
    } else {
        $path = "$dir/$name.jpg";
        imagejpeg($dst, ROOT . '/' . $path, 84);
    }
    imagedestroy($src);
    imagedestroy($dst);
    return $path;
}

function delete_file(string $path): void
{
    if (str_starts_with($path, 'uploads/') && !str_contains($path, '..') && is_file(ROOT . '/' . $path)) @unlink(ROOT . '/' . $path);
}

function ago(int $ts): string
{
    $d = time() - $ts;
    if ($d < 60) return "à l'instant";
    if ($d < 3600) return 'il y a ' . floor($d / 60) . ' min';
    if ($d < 86400) return 'il y a ' . floor($d / 3600) . ' h';
    return date('d/m/Y H:i', $ts);
}

function status_pill(string $s): string
{
    require_once ROOT . '/inc/orders.php';
    return '<span class="st st-' . e($s) . '">' . e(ORDER_STATUSES[$s] ?? $s) . '</span>';
}
