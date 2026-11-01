<?php
require __DIR__ . '/_inc.php';
require_admin();

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    csrf_check();
    $action = $_POST['action'] ?? '';
    $name = trim((string)($_POST['name'] ?? ''));
    $id = (int)($_POST['id'] ?? 0);
    if ($action === 'add' && $name !== '') {
        $slug = slugify($name);
        $base = $slug;
        for ($n = 2; q('SELECT 1 FROM categories WHERE slug = ?', [$slug])->fetchColumn(); $n++) $slug = "$base-$n";
        q('INSERT INTO categories (name, slug, sort) VALUES (?, ?, ?)', [$name, $slug, (int)q('SELECT COALESCE(MAX(sort),0)+1 FROM categories')->fetchColumn()]);
        flash('Catégorie ajoutée.');
    } elseif ($action === 'save' && $id && $name !== '') {
        q('UPDATE categories SET name = ?, sort = ? WHERE id = ?', [$name, (int)($_POST['sort'] ?? 0), $id]);
        flash('Catégorie enregistrée.');
    } elseif ($action === 'delete' && $id) {
        q('UPDATE products SET category_id = NULL WHERE category_id = ?', [$id]);
        q('DELETE FROM categories WHERE id = ?', [$id]);
        flash('Catégorie supprimée. Ses produits sont maintenant sans catégorie.');
    }
    bump_catalog();
    redirect(url('admin/categories.php'));
}

$cats = q('SELECT c.*, (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id) AS n FROM categories c ORDER BY c.sort, c.name')->fetchAll();
admin_header('Catégories', 'categories');
?>
<h1>Catégories</h1>
<form method="post" class="toolbar panel">
    <?= csrf_field() ?><input type="hidden" name="action" value="add">
    <input name="name" placeholder="Nouvelle catégorie, ex. Parfums" required>
    <button class="btn primary">Ajouter</button>
</form>
<div class="panel">
    <?php foreach ($cats as $c): ?>
    <form method="post" class="cat-row">
        <?= csrf_field() ?><input type="hidden" name="id" value="<?= (int)$c['id'] ?>">
        <input type="number" name="sort" value="<?= (int)$c['sort'] ?>" class="sort" title="Ordre d'affichage">
        <input name="name" value="<?= e($c['name']) ?>" required>
        <span class="muted small"><?= (int)$c['n'] ?> produit(s)</span>
        <button class="btn small" name="action" value="save">Enregistrer</button>
        <button class="btn small danger-ghost" name="action" value="delete" onclick="return confirm('Supprimer cette catégorie ?')">Supprimer</button>
    </form>
    <?php endforeach; ?>
    <?php if (!$cats): ?><p class="muted">Aucune catégorie.</p><?php endif; ?>
</div>
<?php admin_footer();
