<?php
// POST /api/order.php — quick order from the "Acheter" pop-up.
// Body: JSON {id, qty, name, phone, city, website (honeypot, must be empty)}.
require dirname(__DIR__) . '/inc/bootstrap.php';
require ROOT . '/inc/orders.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') json_out(['error' => 'POST only'], 405);
csrf_check();
$in = json_decode((string)file_get_contents('php://input'), true);
if (!is_array($in)) json_out(['error' => t('res_error')], 400);

// Bots fill every field; people never see this one. Pretend it worked.
if (!empty($in['website'])) json_out(['ref' => 'HD' . strtoupper(substr(bin2hex(random_bytes(3)), 0, 6)), 'total' => 0]);

$recent = (int)q('SELECT COUNT(*) FROM orders WHERE ip = ? AND created_at > ?', [client_ip(), time() - 3600])->fetchColumn();
if ($recent >= 6) json_out(['error' => t('err_too_many')], 429);

try {
    $res = create_order($in);
} catch (Throwable $e) {
    error_log('[order] ' . $e->getMessage());
    json_out(['error' => t('res_error')], 500);
}
if (isset($res['errors'])) json_out(['errors' => $res['errors']], 422);
json_out([
    'ref' => $res['ref'],
    'total' => $res['total'],
    'message' => t('qb_ok_sub', ['p' => trim(chunk_split($res['phone'], 2, ' ')), 't' => money($res['total'])]),
]);
