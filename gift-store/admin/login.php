<?php
require __DIR__ . '/_inc.php';

$error = '';
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    csrf_check();
    $_SESSION['login_tries'] = ($_SESSION['login_tries'] ?? 0) + 1;
    if ($_SESSION['login_tries'] > 8) {
        $error = 'Trop de tentatives. Réessayez plus tard.';
    } else {
        $a = q('SELECT * FROM admins WHERE email = ?', [trim((string)($_POST['email'] ?? ''))])->fetch();
        if ($a && password_verify((string)($_POST['password'] ?? ''), $a['password_hash'])) {
            session_regenerate_id(true);
            $_SESSION['admin_id'] = (int)$a['id'];
            $_SESSION['login_tries'] = 0;
            redirect(url('admin/'));
        }
        usleep(400000);
        $error = 'Email ou mot de passe incorrect.';
    }
}
?><!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Connexion · <?= e(store_name()) ?></title>
<link rel="stylesheet" href="<?= e(asset('css/admin.css')) ?>">
</head>
<body class="auth">
<form method="post" class="auth-card">
    <?= csrf_field() ?>
    <h1><?= e(store_name()) ?> <span class="muted">admin</span></h1>
    <?php if ($error): ?><div class="alert error"><?= e($error) ?></div><?php endif; ?>
    <label>Email <input type="email" name="email" required autofocus autocomplete="username"></label>
    <label>Mot de passe <input type="password" name="password" required autocomplete="current-password"></label>
    <button class="btn primary">Se connecter</button>
</form>
</body>
</html>
