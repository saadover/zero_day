<?php
require __DIR__ . '/_inc.php';
require ROOT . '/inc/finder.php';
require_admin();

$fields = [
    'store_name' => ['Nom de la boutique', 'text'],
    'whatsapp' => ['Numéro WhatsApp (format 2126XXXXXXXX)', 'tel'],
    'store_phone' => ['Téléphone affiché', 'tel'],
    'store_email' => ['Email qui reçoit les nouvelles commandes', 'email'],
    'instagram' => ['Instagram (@compte)', 'text'],
    'delivery_fee' => ['Frais de livraison (DH)', 'number'],
    'free_delivery_from' => ['Livraison offerte à partir de (DH, 0 = jamais)', 'number'],
    'budget_min' => ['Budget minimum du curseur (DH)', 'number'],
    'budget_max' => ['Budget maximum du curseur (DH)', 'number'],
];
$test = null;

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    csrf_check();
    $action = $_POST['action'] ?? 'save';
    if ($action === 'save') {
        foreach ($fields as $k => [$label, $type]) {
            $v = trim((string)($_POST[$k] ?? ''));
            if ($k === 'whatsapp') $v = preg_replace('/\D/', '', $v);
            if ($type === 'number') $v = (string)max(0, (int)$v);
            save_setting($k, $v);
        }
        if (!empty($_POST['clear_key'])) save_setting('jev_api_key', '');
        elseif (trim((string)($_POST['jev_api_key'] ?? '')) !== '') save_setting('jev_api_key', trim($_POST['jev_api_key']));
        bump_catalog();
        flash('Réglages enregistrés.');
        redirect(url('admin/settings.php'));
    }
    if ($action === 'password') {
        $new = (string)($_POST['new_password'] ?? '');
        $me = q('SELECT * FROM admins WHERE id = ?', [admin_id()])->fetch();
        if (!password_verify((string)($_POST['old_password'] ?? ''), $me['password_hash'])) flash('Mot de passe actuel incorrect.');
        elseif (mb_strlen($new) < 8) flash('Le nouveau mot de passe doit faire au moins 8 caractères.');
        else { q('UPDATE admins SET password_hash = ? WHERE id = ?', [password_hash($new, PASSWORD_DEFAULT), admin_id()]); flash('Mot de passe changé.'); }
        redirect(url('admin/settings.php'));
    }
    if ($action === 'test') {
        $c = ['gender' => 'male', 'age' => 28, 'relation' => 'sibling', 'min' => 0, 'max' => 100000, 'note' => 'kaybghi lkora w l9hwa'];
        $cands = array_slice(finder_candidates($c), 0, 5);
        try {
            $t0 = microtime(true);
            $r = jev_rate($cands, $c, $c['note']);
            $test = ['ok' => true, 'msg' => 'Jev répond (' . round(microtime(true) - $t0, 1) . ' s). Notes pour un frère qui aime le foot et le café : ' . implode(', ', array_map(fn($p) => $p['name'] . ' ' . round(($r[(int)$p['id']] ?? 0) * 100) . '%', $cands))];
        } catch (Throwable $e) {
            $test = ['ok' => false, 'msg' => 'Échec : ' . $e->getMessage()];
        }
    }
}

$key = jev_key();
admin_header('Réglages', 'settings');
?>
<h1>Réglages</h1>
<?php if ($test): ?><div class="alert <?= $test['ok'] ? 'ok' : 'error' ?>"><?= e($test['msg']) ?></div><?php endif; ?>
<form method="post" class="panel">
    <?= csrf_field() ?>
    <h2>Boutique</h2>
    <div class="cols2">
        <?php foreach ($fields as $k => [$label, $type]): ?>
            <label><?= e($label) ?> <input type="<?= $type ?>" name="<?= $k ?>" value="<?= e(setting($k)) ?>" <?= $type === 'number' ? 'min="0" inputmode="numeric"' : '' ?>></label>
        <?php endforeach; ?>
    </div>
    <h2>Conseiller cadeau — Jev (TypeSafe)</h2>
    <p class="help">Collez votre clé API TypeSafe. Elle reste sur le serveur et n'est jamais envoyée aux visiteurs. Sans clé, le conseiller utilise ses règles intégrées (genre, âge, lien, budget et mots-clés en français, anglais et darija).</p>
    <label>Clé API <?= $key ? '<span class="st st-delivered">connectée · ••••' . e(substr($key, -4)) . '</span>' : '<span class="st st-cancelled">non configurée</span>' ?>
        <input type="password" name="jev_api_key" placeholder="<?= $key ? 'Laisser vide pour garder la clé actuelle' : 'ts_…' ?>" autocomplete="off">
    </label>
    <?php if ($key): ?><label class="check"><input type="checkbox" name="clear_key" value="1"> Retirer la clé</label><?php endif; ?>
    <div class="actions">
        <button class="btn primary" name="action" value="save">Enregistrer</button>
        <?php if ($key): ?><button class="btn" name="action" value="test">Tester Jev</button><?php endif; ?>
    </div>
</form>

<form method="post" class="panel narrow">
    <?= csrf_field() ?><input type="hidden" name="action" value="password">
    <h2>Mot de passe administrateur</h2>
    <label>Mot de passe actuel <input type="password" name="old_password" required autocomplete="current-password"></label>
    <label>Nouveau mot de passe <input type="password" name="new_password" minlength="8" required autocomplete="new-password"></label>
    <button class="btn">Changer</button>
</form>
<?php admin_footer();
