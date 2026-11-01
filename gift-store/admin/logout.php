<?php
require __DIR__ . '/_inc.php';
$_SESSION = [];
session_destroy();
redirect(url('admin/login.php'));
