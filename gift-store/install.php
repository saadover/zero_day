<?php
// One-time installer: connects to the database, creates the tables, the admin
// account and (optionally) the demo catalogue, then writes inc/config.php.
// Once inc/config.php exists this page refuses to run again.

require __DIR__ . '/inc/bootstrap.php';
require __DIR__ . '/inc/schema.php';
require __DIR__ . '/inc/demo.php';

if (is_file(CONFIG_FILE)) {
    http_response_code(403);
    exit('Déjà installé. Pour réinstaller, supprimez inc/config.php.');
}

$errors = [];
$v = [
    'driver' => $_POST['driver'] ?? 'mysql',
    'host' => $_POST['host'] ?? 'localhost',
    'name' => $_POST['name'] ?? '',
    'user' => $_POST['user'] ?? '',
    'pass' => $_POST['pass'] ?? '',
    'email' => $_POST['email'] ?? '',
    'store' => $_POST['store'] ?? 'Hdiya',
    'whatsapp' => $_POST['whatsapp'] ?? '',
    'demo' => isset($_POST['demo']) || $_SERVER['REQUEST_METHOD'] !== 'POST',
];

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $password = (string)($_POST['password'] ?? '');
    if (!filter_var($v['email'], FILTER_VALIDATE_EMAIL)) $errors[] = 'Email administrateur invalide.';
    if (mb_strlen($password) < 8) $errors[] = 'Le mot de passe doit faire au moins 8 caractères.';
    if (!is_writable(__DIR__ . '/inc')) $errors[] = 'Le dossier inc/ doit être accessible en écriture.';
    if (!is_writable(__DIR__ . '/uploads')) $errors[] = 'Le dossier uploads/ doit être accessible en écriture.';

    if (!$errors) {
        $db = $v['driver'] === 'sqlite'
            ? ['driver' => 'sqlite', 'file' => 'inc/store.sqlite']
            : ['driver' => 'mysql', 'host' => $v['host'], 'port' => 3306, 'name' => $v['name'], 'user' => $v['user'], 'pass' => $v['pass']];
        try {
            $GLOBALS['CONFIG'] = ['db' => $db];
            $pdo = db();
            install_schema($pdo, $db['driver']);
            foreach (default_settings() as $k => $val) {
                $pdo->prepare('DELETE FROM settings WHERE k = ?')->execute([$k]);
                $pdo->prepare('INSERT INTO settings (k, v) VALUES (?, ?)')->execute([$k, $val]);
            }
            foreach (['store_name' => trim($v['store']) ?: 'Hdiya', 'whatsapp' => preg_replace('/\D/', '', $v['whatsapp'])] as $k => $val) {
                $pdo->prepare('DELETE FROM settings WHERE k = ?')->execute([$k]);
                $pdo->prepare('INSERT INTO settings (k, v) VALUES (?, ?)')->execute([$k, $val]);
            }
            $pdo->prepare('DELETE FROM admins WHERE email = ?')->execute([$v['email']]);
            $pdo->prepare('INSERT INTO admins (email, password_hash, created_at) VALUES (?, ?, ?)')
                ->execute([$v['email'], password_hash($password, PASSWORD_DEFAULT), time()]);
            if ($v['demo']) seed_demo($pdo);

            $config = ['db' => $db, 'debug' => false, 'jev_api_key' => '', 'secret' => bin2hex(random_bytes(16))];
            file_put_contents(CONFIG_FILE, "<?php\n// Written by install.php. Keep this file private.\nreturn " . var_export($config, true) . ";\n");
            redirect(url('admin/'));
        } catch (Throwable $e) {
            $errors[] = 'Connexion ou création impossible : ' . $e->getMessage();
        }
    }
}
?><!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Installation</title>
<link rel="stylesheet" href="<?= e(asset('css/admin.css')) ?>">
</head>
<body class="auth">
<form method="post" class="auth-card wide">
    <h1>Installer la boutique</h1>
    <p class="muted">Créez d'abord une base MySQL dans hPanel (Bases de données → MySQL), puis remplissez ce formulaire.</p>
    <?php foreach ($errors as $err): ?><div class="alert error"><?= e($err) ?></div><?php endforeach; ?>

    <fieldset>
        <legend>Base de données</legend>
        <label>Type
            <select name="driver" onchange="document.getElementById('mysql').hidden = this.value === 'sqlite'">
                <option value="mysql" <?= $v['driver'] === 'mysql' ? 'selected' : '' ?>>MySQL (recommandé sur Hostinger)</option>
                <option value="sqlite" <?= $v['driver'] === 'sqlite' ? 'selected' : '' ?>>SQLite (fichier, pour tester)</option>
            </select>
        </label>
        <div id="mysql" <?= $v['driver'] === 'sqlite' ? 'hidden' : '' ?>>
            <label>Hôte <input name="host" value="<?= e($v['host']) ?>"></label>
            <label>Nom de la base <input name="name" value="<?= e($v['name']) ?>" placeholder="u123456789_store"></label>
            <label>Utilisateur <input name="user" value="<?= e($v['user']) ?>" placeholder="u123456789_admin"></label>
            <label>Mot de passe <input name="pass" type="password" value="<?= e($v['pass']) ?>"></label>
        </div>
    </fieldset>

    <fieldset>
        <legend>Boutique & administrateur</legend>
        <label>Nom de la boutique <input name="store" value="<?= e($v['store']) ?>"></label>
        <label>WhatsApp (ex. 212612345678) <input name="whatsapp" value="<?= e($v['whatsapp']) ?>" inputmode="tel"></label>
        <label>Email administrateur <input name="email" type="email" value="<?= e($v['email']) ?>" required></label>
        <label>Mot de passe administrateur <input name="password" type="password" minlength="8" required></label>
        <label class="check"><input type="checkbox" name="demo" <?= $v['demo'] ? 'checked' : '' ?>> Ajouter les produits de démonstration (pour tester)</label>
    </fieldset>
    <button class="btn primary">Installer</button>
</form>
</body>
</html>
