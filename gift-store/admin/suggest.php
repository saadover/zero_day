<?php
// POST /admin/suggest.php — suggested "Pour qui ?" tags for a product being edited.
require __DIR__ . '/_inc.php';
require ROOT . '/inc/autotag.php';

if (!admin_id()) json_out(['error' => 'Session expirée, reconnectez-vous.'], 401);
if ($_SERVER['REQUEST_METHOD'] !== 'POST') json_out(['error' => 'POST only'], 405);
csrf_check();

$name = trim((string)($_POST['name'] ?? ''));
$desc = trim((string)($_POST['description'] ?? ''));
if (mb_strlen($name) < 3) json_out(['error' => 'Écrivez d\'abord le nom du produit.'], 400);
$cat = '';
if (!empty($_POST['category_id'])) $cat = (string)q('SELECT name FROM categories WHERE id = ?', [(int)$_POST['category_id']])->fetchColumn();
json_out(autotag($name, $desc, $cat, (string)($_POST['tags'] ?? '')));
