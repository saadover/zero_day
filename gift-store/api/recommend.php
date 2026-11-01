<?php
// POST /api/recommend.php — the gift finder. Body: JSON {gender, age, relation, min, max, note}.
require dirname(__DIR__) . '/inc/bootstrap.php';
require ROOT . '/inc/finder.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') json_out(['error' => 'POST only'], 405);
csrf_check();
$in = json_decode((string)file_get_contents('php://input'), true);
[$criteria, $err] = finder_input(is_array($in) ? $in : []);
if ($err) json_out(['error' => $err], 400);
try {
    $res = finder_recommend($criteria);
} catch (Throwable $e) {
    error_log('[recommend] ' . $e->getMessage());
    json_out(['error' => t('res_error')], 500);
}
if (isset($res['error'])) json_out(['error' => $res['error']], $res['status'] ?? 400);
json_out($res);
