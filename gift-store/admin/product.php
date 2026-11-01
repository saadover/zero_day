<?php
require __DIR__ . '/_inc.php';
require_admin();

$id = (int)($_GET['id'] ?? 0);
$p = $id ? q('SELECT * FROM products WHERE id = ?', [$id])->fetch() : null;
if ($id && !$p) redirect(url('admin/products.php'));
$errors = [];

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    csrf_check();
    $action = $_POST['action'] ?? 'save';

    if ($action === 'delete' && $p) {
        foreach (q('SELECT path FROM product_images WHERE product_id = ?', [$id])->fetchAll() as $i) delete_file($i['path']);
        q('DELETE FROM product_images WHERE product_id = ?', [$id]);
        q('DELETE FROM products WHERE id = ?', [$id]);
        bump_catalog();
        flash('Produit supprimé.');
        redirect(url('admin/products.php'));
    }
    if ($action === 'img_delete' && $p) {
        $img = q('SELECT * FROM product_images WHERE id = ? AND product_id = ?', [(int)$_POST['img'], $id])->fetch();
        if ($img) { delete_file($img['path']); q('DELETE FROM product_images WHERE id = ?', [$img['id']]); }
        redirect(url('admin/product.php', ['id' => $id]) . '#photos');
    }
    if ($action === 'img_main' && $p) {
        q('UPDATE product_images SET sort = sort + 1 WHERE product_id = ?', [$id]);
        q('UPDATE product_images SET sort = 0 WHERE id = ? AND product_id = ?', [(int)$_POST['img'], $id]);
        redirect(url('admin/product.php', ['id' => $id]) . '#photos');
    }

    $in = [
        'name' => trim((string)($_POST['name'] ?? '')),
        'description' => trim((string)($_POST['description'] ?? '')),
        'price' => (int)($_POST['price'] ?? 0),
        'compare_price' => ($_POST['compare_price'] ?? '') === '' ? null : (int)$_POST['compare_price'],
        'stock' => ($_POST['stock'] ?? '') === '' ? null : max(0, (int)$_POST['stock']),
        'category_id' => ($_POST['category_id'] ?? '') === '' ? null : (int)$_POST['category_id'],
        'gender' => in_array($_POST['gender'] ?? '', GENDERS, true) ? $_POST['gender'] : '',
        'age_min' => max(0, min(99, (int)($_POST['age_min'] ?? 0))),
        'age_max' => max(0, min(99, (int)($_POST['age_max'] ?? 99))),
        'relations' => implode(',', array_intersect((array)($_POST['relations'] ?? []), array_keys(relations()))),
        'interests' => implode(',', array_intersect((array)($_POST['interests'] ?? []), array_keys(interests()))),
        'occasions' => implode(',', array_intersect((array)($_POST['occasions'] ?? []), array_keys(occasions()))),
        'tags' => mb_substr(implode(', ', list_split((string)($_POST['tags'] ?? ''))), 0, 500),
        'featured' => !empty($_POST['featured']) ? 1 : 0,
        'active' => !empty($_POST['active']) ? 1 : 0,
    ];
    if (!empty($_POST['everyone'])) $in['relations'] = '';
    if ($in['name'] === '') $errors[] = 'Le nom est obligatoire.';
    if ($in['price'] <= 0) $errors[] = 'Le prix doit être supérieur à 0.';
    if ($in['gender'] === '') $errors[] = 'Choisissez pour qui est ce produit : homme, femme ou mixte.';
    if ($in['age_min'] > $in['age_max']) $errors[] = "L'âge minimum doit être inférieur à l'âge maximum.";
    if ($in['compare_price'] !== null && $in['compare_price'] <= $in['price']) $in['compare_price'] = null;

    if (!$errors) {
        $now = time();
        if ($p) {
            $sets = implode(', ', array_map(fn($k) => "$k = ?", array_keys($in)));
            q("UPDATE products SET $sets, updated_at = ? WHERE id = ?", array_merge(array_values($in), [$now, $id]));
        } else {
            $slug = slugify($in['name']);
            $base = $slug;
            for ($n = 2; q('SELECT 1 FROM products WHERE slug = ?', [$slug])->fetchColumn(); $n++) $slug = "$base-$n";
            $cols = array_merge(array_keys($in), ['slug', 'created_at', 'updated_at']);
            q('INSERT INTO products (' . implode(', ', $cols) . ') VALUES (' . implode(', ', array_fill(0, count($cols), '?')) . ')', array_merge(array_values($in), [$slug, $now, $now]));
            $id = (int)db()->lastInsertId();
        }
        // New photos
        $files = $_FILES['photos'] ?? null;
        $failed = 0;
        if ($files && is_array($files['name'])) {
            $sort = (int)q('SELECT COALESCE(MAX(sort), -1) FROM product_images WHERE product_id = ?', [$id])->fetchColumn();
            foreach ($files['name'] as $i => $_) {
                if (($files['error'][$i] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_NO_FILE) continue;
                $path = save_upload(['tmp_name' => $files['tmp_name'][$i], 'error' => $files['error'][$i], 'size' => $files['size'][$i]]);
                if ($path) q('INSERT INTO product_images (product_id, path, sort) VALUES (?, ?, ?)', [$id, $path, ++$sort]);
                else $failed++;
            }
        }
        bump_catalog();
        flash('Produit enregistré.' . ($failed ? " $failed photo(s) refusée(s) : JPG, PNG ou WebP de moins de 12 Mo." : ''));
        redirect(url('admin/product.php', ['id' => $id]));
    }
    $p = array_merge($p ?: [], $in);
}

$p = $p ?: ['name' => '', 'description' => '', 'price' => '', 'compare_price' => null, 'stock' => null, 'category_id' => null, 'gender' => '', 'age_min' => 0, 'age_max' => 99, 'relations' => '', 'interests' => '', 'occasions' => '', 'tags' => '', 'featured' => 0, 'active' => 1];
$cats = q('SELECT * FROM categories ORDER BY sort, name')->fetchAll();
$images = $id ? q('SELECT * FROM product_images WHERE product_id = ? ORDER BY sort, id', [$id])->fetchAll() : [];
$rel = list_split($p['relations']);
$int = list_split($p['interests']);
$occ = list_split($p['occasions']);

admin_header($id ? 'Modifier le produit' : 'Nouveau produit', 'products');
?>
<div class="page-top">
    <h1><?= $id ? e($p['name']) : 'Nouveau produit' ?></h1>
    <?php if ($id && !empty($p['slug'])): ?><a class="btn" href="<?= e(url('product.php', ['p' => $p['slug']])) ?>" target="_blank">Voir sur la boutique ↗</a><?php endif; ?>
</div>
<?php foreach ($errors as $err): ?><div class="alert error"><?= e($err) ?></div><?php endforeach; ?>

<form method="post" enctype="multipart/form-data" class="pform" id="pform">
    <?= csrf_field() ?>
    <section class="panel">
        <h2>Informations</h2>
        <label>Nom du produit <input name="name" value="<?= e($p['name']) ?>" required></label>
        <div class="cols3">
            <label>Prix (DH) <input name="price" type="number" min="1" value="<?= e($p['price']) ?>" required inputmode="numeric"></label>
            <label>Ancien prix <small>(barré, facultatif)</small> <input name="compare_price" type="number" min="0" value="<?= e($p['compare_price']) ?>" inputmode="numeric"></label>
            <label>Stock <small>(vide = illimité)</small> <input name="stock" type="number" min="0" value="<?= e($p['stock']) ?>" inputmode="numeric"></label>
        </div>
        <label>Catégorie
            <select name="category_id">
                <option value="">— Sans catégorie —</option>
                <?php foreach ($cats as $c): ?><option value="<?= (int)$c['id'] ?>" <?= (int)$p['category_id'] === (int)$c['id'] ? 'selected' : '' ?>><?= e($c['name']) ?></option><?php endforeach; ?>
            </select>
        </label>
        <label>Description <textarea name="description" rows="5"><?= e($p['description']) ?></textarea></label>
        <div class="checks">
            <label class="check"><input type="checkbox" name="active" value="1" <?= $p['active'] ? 'checked' : '' ?>> En ligne</label>
            <label class="check"><input type="checkbox" name="featured" value="1" <?= $p['featured'] ? 'checked' : '' ?>> Coup de cœur (page d'accueil)</label>
        </div>
    </section>

    <section class="panel" id="photos">
        <h2>Photos</h2>
        <?php if ($images): ?>
        <div class="thumbs">
            <?php foreach ($images as $i => $img): ?>
                <div class="thumb">
                    <img src="<?= e(img_url($img['path'])) ?>" alt="">
                    <?php if ($i === 0): ?><span class="thumb-main">Principale</span><?php else: ?>
                        <button class="mini" name="action" value="img_main" formnovalidate onclick="this.form.img.value=<?= (int)$img['id'] ?>">Principale</button>
                    <?php endif; ?>
                    <button class="mini danger" name="action" value="img_delete" formnovalidate onclick="if(!confirm('Supprimer cette photo ?'))return false;this.form.img.value=<?= (int)$img['id'] ?>">✕</button>
                </div>
            <?php endforeach; ?>
        </div>
        <?php endif; ?>
        <input type="hidden" name="img" value="">
        <label class="drop">
            <input type="file" name="photos[]" accept="image/jpeg,image/png,image/webp" multiple data-preview>
            <span><b>Ajouter des photos</b><br><small class="muted">JPG, PNG ou WebP. Carrées de préférence. Redimensionnées automatiquement.</small></span>
        </label>
        <div class="thumbs" data-preview-out></div>
    </section>

    <section class="panel tagging" data-tagging data-new="<?= $id ? '0' : '1' ?>" data-suggest-url="<?= e(url('admin/suggest.php')) ?>">
        <h2>Pour qui ? <small class="muted">— ce que le conseiller cadeau utilise</small></h2>
        <p class="help">Ces informations sont des règles strictes : un produit « Femme » ne sera jamais proposé pour un homme, et un produit 18–99 ans jamais pour un enfant de 10 ans.</p>

        <div class="suggest-box" data-suggest-box>
            <div>
                <strong>✨ Remplissage automatique</strong>
                <span class="muted small" data-suggest-status><?= $id ? 'Relancez-le si vous avez changé le nom ou la description.' : 'Se lance tout seul quand le nom et la description sont écrits. Vérifiez ensuite et corrigez si besoin.' ?></span>
            </div>
            <button type="button" class="btn small" data-suggest>Remplir à partir du texte</button>
        </div>

        <div class="tag-block">
            <h3>Genre</h3>
            <div class="seg-radio">
                <?php foreach (['male' => 'Homme', 'female' => 'Femme', 'unisex' => 'Mixte (les deux)'] as $k => $l): ?>
                    <label><input type="radio" name="gender" value="<?= $k ?>" <?= $p['gender'] === $k ? 'checked' : '' ?> required><span><?= $l ?></span></label>
                <?php endforeach; ?>
            </div>
        </div>

        <div class="tag-block">
            <h3>Âge <span class="age-out" data-age-out></span></h3>
            <div class="arange" data-arange>
                <div class="arange-track"><i data-arange-fill></i></div>
                <input type="range" min="0" max="99" value="<?= (int)$p['age_min'] ?>" name="age_min" data-age-min aria-label="Âge minimum">
                <input type="range" min="0" max="99" value="<?= (int)$p['age_max'] ?>" name="age_max" data-age-max aria-label="Âge maximum">
            </div>
            <div class="arange-scale"><span>0</span><span>12</span><span>18</span><span>30</span><span>50</span><span>99+</span></div>
            <div class="presets">
                <?php foreach (['Bébé' => [0, 2], 'Enfant' => [3, 12], 'Ado' => [13, 17], 'Jeune' => [16, 35], 'Adulte' => [18, 99], 'Senior' => [55, 99], 'Tous' => [0, 99]] as $l => [$a, $b]): ?>
                    <button type="button" class="mini" data-age-preset="<?= $a ?>,<?= $b ?>"><?= $l ?> <small><?= $a ?>–<?= $b ?></small></button>
                <?php endforeach; ?>
            </div>
        </div>

        <div class="tag-block">
            <h3>Lien avec la personne qui offre</h3>
            <label class="check strong"><input type="checkbox" name="everyone" value="1" <?= !$rel ? 'checked' : '' ?> data-everyone> Convient à tout le monde</label>
            <div class="chipset" data-relations-set <?= !$rel ? 'data-disabled' : '' ?>>
                <?php foreach (relations() as $k => $_): ?>
                    <label><input type="checkbox" name="relations[]" value="<?= $k ?>" <?= in_array($k, $rel, true) ? 'checked' : '' ?>><span><?= e(relation_admin_label($k)) ?></span></label>
                <?php endforeach; ?>
            </div>
        </div>

        <div class="tag-block">
            <h3>Centres d'intérêt <small class="muted">— à qui ce cadeau parle</small></h3>
            <div class="chipset">
                <?php foreach (interests() as $k => $i): ?>
                    <label><input type="checkbox" name="interests[]" value="<?= $k ?>" <?= in_array($k, $int, true) ? 'checked' : '' ?>><span><?= e($i['label']['fr']) ?></span></label>
                <?php endforeach; ?>
            </div>
        </div>

        <div class="tag-block">
            <h3>Occasions</h3>
            <div class="chipset">
                <?php foreach (occasions() as $k => $o): ?>
                    <label><input type="checkbox" name="occasions[]" value="<?= $k ?>" <?= in_array($k, $occ, true) ? 'checked' : '' ?>><span><?= e($o['label']['fr']) ?></span></label>
                <?php endforeach; ?>
            </div>
        </div>

        <div class="tag-block">
            <h3>Mots-clés libres <small class="muted">— séparés par des virgules</small></h3>
            <input name="tags" value="<?= e($p['tags']) ?>" placeholder="ex. personnalisé, cuir, Real Madrid, argan">
        </div>
    </section>

    <div class="savebar">
        <?php if ($id): ?><button class="btn danger-ghost" name="action" value="delete" formnovalidate onclick="return confirm('Supprimer définitivement ce produit ?')">Supprimer</button><?php endif; ?>
        <a class="btn" href="products.php">Annuler</a>
        <button class="btn primary" name="action" value="save">Enregistrer</button>
    </div>
</form>
<?php admin_footer();
