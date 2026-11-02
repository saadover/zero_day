<?php
// Loaded by every page: config, database, session, language and helpers.

declare(strict_types=1);

define('ROOT', dirname(__DIR__));
define('CONFIG_FILE', ROOT . '/inc/config.php');

if (!is_file(CONFIG_FILE)) {
    if (basename($_SERVER['SCRIPT_NAME']) !== 'install.php') {
        header('Location: ' . base_url() . 'install.php');
        exit;
    }
    $CONFIG = [];
} else {
    $CONFIG = require CONFIG_FILE;
}

ini_set('display_errors', !empty($CONFIG['debug']) ? '1' : '0');
error_reporting(E_ALL);
date_default_timezone_set('Africa/Casablanca');

if (session_status() === PHP_SESSION_NONE) {
    session_set_cookie_params(['httponly' => true, 'samesite' => 'Lax', 'secure' => is_https()]);
    session_name('hdiya');
    session_start();
}

require_once ROOT . '/inc/i18n.php';
require_once ROOT . '/inc/taxonomy.php';

// ---------- URLs ----------

function is_https(): bool
{
    return (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
}

// Path of the store folder on the site, ending in "/", e.g. "/" or "/shop/".
function base_url(): string
{
    static $base = null;
    if ($base === null) {
        $docRoot = realpath($_SERVER['DOCUMENT_ROOT'] ?? '') ?: '';
        $root = realpath(dirname(__DIR__)) ?: dirname(__DIR__);
        $rel = ($docRoot && str_starts_with($root, $docRoot)) ? substr($root, strlen($docRoot)) : '';
        $base = rtrim(str_replace('\\', '/', $rel), '/') . '/';
    }
    return $base;
}

function url(string $path = '', array $query = []): string
{
    $u = base_url() . ltrim($path, '/');
    return $query ? $u . '?' . http_build_query($query) : $u;
}

function asset(string $path): string
{
    $file = ROOT . '/assets/' . $path;
    $v = is_file($file) ? filemtime($file) : 0;
    return url('assets/' . $path) . '?v=' . $v;
}

function redirect(string $to): never
{
    header('Location: ' . $to);
    exit;
}

// ---------- Database ----------

function db(): PDO
{
    static $pdo = null;
    global $CONFIG;
    if ($pdo) return $pdo;
    $c = $CONFIG['db'] ?? [];
    $opts = [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ];
    if (($c['driver'] ?? 'mysql') === 'sqlite') {
        $pdo = new PDO('sqlite:' . ROOT . '/' . ($c['file'] ?? 'inc/store.sqlite'), null, null, $opts);
        $pdo->exec('PRAGMA foreign_keys = ON');
    } else {
        $dsn = sprintf('mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4', $c['host'] ?? 'localhost', $c['port'] ?? 3306, $c['name'] ?? '');
        $pdo = new PDO($dsn, $c['user'] ?? '', $c['pass'] ?? '', $opts);
    }
    return $pdo;
}

function q(string $sql, array $args = []): PDOStatement
{
    $st = db()->prepare($sql);
    $st->execute($args);
    return $st;
}

function setting(string $key, $default = '')
{
    static $all = null;
    if ($all === null) {
        $all = [];
        try {
            foreach (q('SELECT k, v FROM settings')->fetchAll() as $r) $all[$r['k']] = $r['v'];
        } catch (Throwable $e) {
            // not installed yet
        }
    }
    return array_key_exists($key, $all) && $all[$key] !== '' ? $all[$key] : $default;
}

function save_setting(string $key, string $value): void
{
    q('DELETE FROM settings WHERE k = ?', [$key]);
    q('INSERT INTO settings (k, v) VALUES (?, ?)', [$key, $value]);
}

function store_name(): string
{
    return setting('store_name', 'Hdiya');
}

// ---------- Output helpers ----------

function e($s): string
{
    return htmlspecialchars((string)$s, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function money($amount): string
{
    return number_format((float)$amount, 0, ',', ' ') . ' ' . t('currency');
}

function slugify(string $s): string
{
    $s = mb_strtolower(trim($s));
    $s = strtr($s, ['à' => 'a', 'â' => 'a', 'ä' => 'a', 'é' => 'e', 'è' => 'e', 'ê' => 'e', 'ë' => 'e', 'î' => 'i', 'ï' => 'i', 'ô' => 'o', 'ö' => 'o', 'ù' => 'u', 'û' => 'u', 'ü' => 'u', 'ç' => 'c', 'œ' => 'oe']);
    $s = preg_replace('/[^\p{L}\p{N}]+/u', '-', $s);
    return trim($s, '-') ?: 'produit';
}

function list_split(?string $s): array
{
    return array_values(array_filter(array_map('trim', explode(',', (string)$s)), 'strlen'));
}

// ---------- Security ----------

function csrf_token(): string
{
    if (empty($_SESSION['csrf'])) $_SESSION['csrf'] = bin2hex(random_bytes(16));
    return $_SESSION['csrf'];
}

function csrf_field(): string
{
    return '<input type="hidden" name="csrf" value="' . e(csrf_token()) . '">';
}

function csrf_check(): void
{
    $sent = $_POST['csrf'] ?? $_SERVER['HTTP_X_CSRF'] ?? '';
    if (!is_string($sent) || !hash_equals(csrf_token(), $sent)) {
        http_response_code(400);
        exit('Session expirée. Rechargez la page et réessayez.');
    }
}

function client_ip(): string
{
    return substr((string)($_SERVER['REMOTE_ADDR'] ?? ''), 0, 45);
}

function json_out($data, int $status = 200): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

// ---------- Products ----------

// Adds `image` (first photo), `images` and `url` to product rows.
function hydrate_products(array $rows): array
{
    if (!$rows) return [];
    $ids = array_map(fn($r) => (int)$r['id'], $rows);
    $in = implode(',', array_fill(0, count($ids), '?'));
    $imgs = [];
    foreach (q("SELECT product_id, path FROM product_images WHERE product_id IN ($in) ORDER BY sort, id", $ids)->fetchAll() as $i) {
        $path = image_path($i['path']);
        if ($path !== null) $imgs[(int)$i['product_id']][] = $path;
    }
    foreach ($rows as &$r) {
        $r['images'] = $imgs[(int)$r['id']] ?? [];
        $r['image'] = $r['images'][0] ?? 'assets/img/demo/placeholder.svg';
        $r['url'] = url('product.php', ['p' => $r['slug']]);
    }
    return $rows;
}

// The stored image path if the file is really there, so a missing photo never
// shows as a broken image. Demo pictures ship in assets/img/demo/.
function image_path(string $path): ?string
{
    if (preg_match('~^https?://~', $path)) return $path;
    if (str_starts_with($path, 'uploads/demo/')) $path = 'assets/img/demo/' . basename($path);
    return is_file(ROOT . '/' . $path) ? $path : null;
}

function img_url(string $path): string
{
    return preg_match('~^https?://~', $path) ? $path : url($path);
}

function in_stock(array $p): bool
{
    return $p['stock'] === null || $p['stock'] === '' || (int)$p['stock'] > 0;
}
