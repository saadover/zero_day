<?php
// Demo catalogue so the store and the gift finder can be tried right after
// installing. Delete these products from the admin panel when yours are in.

function demo_categories(): array
{
    // slug => [name, illustration]
    return [
        'parfums' => ['Parfums', 'perfume'],
        'montres-bijoux' => ['Montres & bijoux', 'watch'],
        'beaute-soins' => ['Beauté & soins', 'beauty'],
        'maison-deco' => ['Maison & déco', 'home'],
        'high-tech' => ['High-tech & gaming', 'tech'],
        'sport' => ['Sport', 'sport'],
        'gourmandises' => ['Gourmandises & café', 'coffee'],
        'lecture-papeterie' => ['Lecture & papeterie', 'book'],
        'mode' => ['Mode & accessoires', 'bag'],
        'enfants-bebe' => ['Enfants & bébé', 'kids'],
        'coffrets' => ['Coffrets cadeaux', 'box'],
    ];
}

function demo_products(): array
{
    $any = '';
    $close = 'parent,partner,fiance,sibling,child,grandparent,family,friend';
    $work = 'colleague,boss,teacher';
    // [name, category, price, compare, gender, age_min, age_max, relations, interests, occasions, tags, featured, description]
    return [
        ['Coffret parfum Oud & Ambre', 'parfums', 690, 850, 'male', 18, 99, "$close,boss", 'perfume', 'birthday,eid,wedding', 'oud, ambre, coffret, homme', 1, 'Un eau de parfum boisé et chaleureux, notes d\'oud, d\'ambre et de cuir, avec son gel douche assorti. Tenue longue durée.'],
        ['Eau de parfum Jasmin de Marrakech', 'parfums', 590, null, 'female', 16, 99, $close, 'perfume,beauty', 'birthday,love,eid', 'jasmin, floral, femme', 1, 'Un floral lumineux : jasmin, fleur d\'oranger et musc blanc. Flacon de 100 ml dans un écrin en velours.'],
        ['Musc blanc — format voyage', 'parfums', 199, null, 'unisex', 16, 99, $any, 'perfume,travel', 'thanks,birthday', 'musc, mini, voyage', 0, 'Le musc blanc doux et propre que tout le monde aime, en format 30 ml à glisser dans le sac.'],
        ['Montre classique cuir marron', 'montres-bijoux', 890, 1090, 'male', 18, 99, "$close,boss", 'watches,fashion,office', 'birthday,graduation,wedding', 'montre, cuir, classique, homme', 1, 'Cadran minimaliste, verre saphir, bracelet en cuir véritable. Gravure du dos offerte.'],
        ['Montre fine dorée', 'montres-bijoux', 790, null, 'female', 16, 99, $close, 'watches,jewelry,fashion', 'birthday,graduation,love', 'montre, doré, femme, élégante', 1, 'Une montre fine au bracelet maille milanaise dorée. Discrète, élégante, pour tous les jours.'],
        ['Bracelet argent gravé au prénom', 'montres-bijoux', 349, null, 'female', 12, 99, $close, 'jewelry', 'birthday,love,graduation', 'personnalisé, prénom, argent 925', 1, 'Bracelet en argent 925 gravé au prénom de votre choix. Livré dans sa boîte cadeau.'],
        ['Collier Main de Fatma plaqué or', 'montres-bijoux', 299, null, 'female', 14, 99, $close, 'jewelry', 'birthday,eid,newborn', 'khmissa, main de fatma, collier, doré', 0, 'La khmissa porte-bonheur, finement ciselée, sur une chaîne fine plaquée or 18 carats.'],
        ['Boutons de manchette & pince à cravate', 'montres-bijoux', 259, null, 'male', 22, 99, "partner,parent,sibling,friend,$work", 'office,fashion', 'wedding,graduation,farewell', 'costume, cravate, élégant', 0, 'Un duo acier brossé pour les hommes en costume : mariage, bureau, grandes occasions.'],
        ['Coffret soin Argan & Ghassoul', 'beaute-soins', 329, 390, 'female', 16, 99, $close, 'beauty,wellness', 'birthday,thanks,eid', 'argan, hammam, naturel', 1, 'Huile d\'argan bio, ghassoul, savon noir et gant de kessa : le rituel du hammam marocain à la maison.'],
        ['Kit barbe premium', 'beaute-soins', 279, null, 'male', 16, 70, "$close", 'beauty', 'birthday', 'barbe, huile, baume, peigne', 0, 'Huile, baume et peigne en bois de santal pour une barbe douce et nette.'],
        ['Palette maquillage & pinceaux', 'beaute-soins', 249, null, 'female', 14, 50, 'sibling,child,friend,partner,fiance,family', 'beauty', 'birthday', 'maquillage, makeup, fards', 0, '18 fards mats et irisés, 6 pinceaux doux et une trousse. Pour les passionnées de makeup.'],
        ['Coffret spa à domicile', 'beaute-soins', 449, null, 'female', 18, 99, $close, 'wellness,beauty', 'birthday,love,getwell,thanks', 'spa, détente, peignoir, sels', 1, 'Peignoir gaufré, sels de bain à la rose, bougie et masque yeux : une vraie pause rien que pour elle.'],
        ['Bougie parfumée fleur d\'oranger', 'maison-deco', 149, null, 'unisex', 16, 99, $any, 'home,wellness', 'thanks,housewarming,birthday', 'bougie, zhar, cire de soja', 0, 'Cire de soja, mèche en coton et le parfum de la fleur d\'oranger. 45 heures de combustion.'],
        ['Plaid en laine tissé main', 'maison-deco', 459, null, 'unisex', 18, 99, "$close", 'home,wellness', 'housewarming,wedding,getwell', 'laine, berbère, tissé main', 0, 'Un plaid berbère tissé à la main dans l\'Atlas. Chaud, doux et beau sur un canapé.'],
        ['Service à thé marocain gravé', 'maison-deco', 549, 650, 'unisex', 25, 99, "parent,grandparent,family,partner,$work", 'coffee,home', 'housewarming,wedding,eid,farewell', 'théière, atay, verres, plateau', 1, 'Théière en maillechort ciselée, 6 verres peints et un plateau. Le cadeau qui honore la maison.'],
        ['Bouquet de roses éternelles', 'maison-deco', 349, null, 'female', 16, 99, 'partner,fiance', 'home', 'love,birthday', 'roses, éternelles, romantique', 1, 'Des roses stabilisées qui restent belles plus d\'un an, dans une box ronde en velours.'],
        ['Kit plantes aromatiques', 'maison-deco', 169, null, 'unisex', 14, 99, $any, 'nature,cooking,home', 'housewarming,thanks', 'menthe, basilic, jardin', 0, 'Pots, terreau et graines de menthe, basilic et coriandre pour un mini-jardin sur le balcon.'],
        ['Écouteurs sans fil', 'high-tech', 399, 499, 'unisex', 12, 60, $any, 'tech,music,sport', 'birthday,graduation', 'bluetooth, réduction de bruit', 1, 'Réduction de bruit, 30 heures d\'autonomie avec le boîtier, résistants à la transpiration.'],
        ['Enceinte bluetooth étanche', 'high-tech', 449, null, 'unisex', 12, 60, $any, 'music,tech,travel,nature', 'birthday', 'enceinte, plage, waterproof', 0, 'Un son puissant qui tient la plage et la piscine. Étanche IP67, 12 heures de musique.'],
        ['Manette sans fil PS5', 'high-tech', 749, null, 'unisex', 8, 45, 'sibling,child,friend,partner,fiance,family', 'gaming,tech', 'birthday,graduation', 'playstation, ps5, manette', 1, 'La manette officielle avec retour haptique. Le cadeau qui fait crier de joie les gamers.'],
        ['Casque gaming RGB', 'high-tech', 399, null, 'unisex', 10, 40, 'sibling,child,friend,partner,fiance,family', 'gaming,tech,music', 'birthday', 'casque, micro, gamer', 0, 'Son surround 7.1, micro antibruit et éclairage RGB. Compatible PC, PS5 et Xbox.'],
        ['Montre connectée sport', 'high-tech', 699, 799, 'unisex', 14, 65, $any, 'tech,sport', 'birthday,graduation', 'smartwatch, cardio, GPS', 1, 'GPS, cardio, sommeil et notifications. 10 jours d\'autonomie, étanche pour la natation.'],
        ['Maillot de l\'équipe nationale', 'sport', 349, null, 'unisex', 6, 70, 'sibling,child,friend,partner,fiance,family,parent', 'football,sport', 'birthday', 'maroc, lions de l\'atlas, maillot', 1, 'Le maillot des Lions de l\'Atlas. Flocage du prénom et du numéro offert.'],
        ['Ballon de foot officiel', 'sport', 229, null, 'unisex', 6, 50, 'sibling,child,friend,family', 'football,sport', 'birthday', 'ballon, foot', 0, 'Taille 5, cousu main, le même que dans les stades. Pour les matchs entre potes du week-end.'],
        ['Tapis de yoga & briques', 'sport', 279, null, 'unisex', 16, 70, $any, 'sport,wellness', 'birthday', 'yoga, pilates, tapis', 0, 'Tapis antidérapant 6 mm, deux briques en liège et une sangle. Pour bouger chez soi.'],
        ['Sac de sport cuir & toile', 'sport', 389, null, 'male', 16, 60, "$close", 'sport,travel,fashion', 'birthday', 'sac, gym, week-end', 0, 'Un sac élégant pour la salle ou le week-end, avec compartiment chaussures.'],
        ['Coffret chocolats & dattes fourrées', 'gourmandises', 189, null, 'unisex', 6, 99, $any, 'sweets', 'eid,thanks,birthday', 'chocolat, dattes, medjool', 1, 'Dattes Medjool fourrées aux amandes et chocolats artisanaux. Le cadeau qui plaît à tout le monde.'],
        ['Coffret café de spécialité & moulin', 'gourmandises', 399, null, 'unisex', 20, 99, $any, 'coffee', 'birthday,thanks', 'café, grains, moulin', 0, 'Trois cafés de spécialité en grains et un moulin manuel en céramique. Pour les vrais amateurs.'],
        ['Mug « Meilleur frère du monde »', 'gourmandises', 119, null, 'male', 10, 99, 'sibling', 'coffee', 'birthday', 'mug, frère, humour', 0, 'Un mug en céramique avec une jolie illustration. Il le gardera longtemps sur son bureau.'],
        ['Mug « Meilleure maman »', 'gourmandises', 119, null, 'female', 25, 99, 'parent', 'coffee', 'birthday,thanks', 'mug, maman', 0, 'Pour son café ou son thé du matin, avec un mot tendre qu\'elle relira chaque jour.'],
        ['Carnet cuir gravé & stylo', 'lecture-papeterie', 229, null, 'unisex', 14, 99, $any, 'writing,office,reading', 'graduation,birthday,thanks,farewell', 'carnet, cuir, gravure, initiales', 0, 'Carnet A5 rechargeable en cuir pleine fleur, gravé aux initiales, et son stylo assorti.'],
        ['Liseuse Kindle', 'lecture-papeterie', 1290, null, 'unisex', 12, 99, $close, 'reading,tech,travel', 'birthday,graduation', 'kindle, liseuse, ebook', 1, 'Des milliers de livres dans la poche. Écran sans reflet, des semaines d\'autonomie.'],
        ['Coffret 3 romans best-sellers', 'lecture-papeterie', 259, null, 'unisex', 14, 99, $any, 'reading', 'birthday,getwell', 'livres, romans', 0, 'Trois romans qui se dévorent, choisis par nos libraires, avec un marque-page en cuir.'],
        ['Stylo plume élégant gravé', 'lecture-papeterie', 389, null, 'unisex', 20, 99, "parent,grandparent,$work", 'office,writing', 'farewell,graduation,thanks', 'stylo, plume, gravure', 0, 'Corps laqué noir, plume en acier, gravure du nom offerte. Le cadeau classe pour le bureau.'],
        ['Kit aquarelle artiste', 'lecture-papeterie', 219, null, 'unisex', 8, 99, $any, 'art', 'birthday', 'peinture, aquarelle, dessin', 0, '24 couleurs, pinceaux à réservoir et un carnet de papier épais. Pour les âmes créatives.'],
        ['Sac à main cuir camel', 'mode', 690, 790, 'female', 18, 99, 'parent,partner,fiance,sibling,friend,family', 'fashion', 'birthday,eid,love', 'sac, cuir, camel', 1, 'Cuir tanné à Fès, bandoulière amovible, finitions dorées. Intemporel.'],
        ['Robe d\'été en lin', 'mode', 399, null, 'female', 16, 60, 'partner,fiance,sibling,child,friend', 'fashion', 'birthday', 'robe, lin, été', 0, 'Une robe fluide en lin lavé, légère et facile à porter tout l\'été.'],
        ['Caftan moderne brodé', 'mode', 1490, null, 'female', 16, 99, 'parent,partner,fiance,sibling,child,family', 'fashion', 'wedding,eid', 'caftan, brodé, fête', 1, 'Un caftan aux lignes modernes, broderies faites main et ceinture assortie. Pour les fêtes et les mariages.'],
        ['Trousse de toilette voyage en cuir', 'mode', 289, null, 'male', 18, 99, $close, 'travel,fashion', 'birthday,farewell', 'trousse, voyage, cuir', 0, 'Cuir souple, doublure imperméable, assez grande pour tout le nécessaire du week-end.'],
        ['Porte-clés voiture cuir gravé', 'mode', 129, null, 'male', 18, 99, $any, 'cars', 'birthday,graduation', 'porte-clés, voiture, initiales', 0, 'Cuir pleine fleur et anneau en acier, gravé à ses initiales. Pour sa première voiture ou sa dixième.'],
        ['Peluche ourson géante', 'enfants-bebe', 199, null, 'unisex', 0, 10, 'child,sibling,family', 'kids', 'birthday,newborn', 'peluche, doudou, ourson', 0, 'Un ourson tout doux d\'un mètre, lavable en machine. Le meilleur ami des petits.'],
        ['Boîte de LEGO créatif', 'enfants-bebe', 349, null, 'unisex', 6, 14, 'child,sibling,family', 'kids,art', 'birthday,graduation', 'lego, construction', 0, '900 briques pour construire maisons, animaux et véhicules. Des heures de jeu créatif.'],
        ['Livre d\'histoires personnalisé', 'enfants-bebe', 179, null, 'unisex', 2, 9, $any, 'kids,reading', 'birthday', 'livre, prénom, conte', 0, 'Un conte illustré où votre enfant est le héros, avec son prénom à chaque page.'],
        ['Atelier pâte à modeler & tampons', 'enfants-bebe', 159, null, 'unisex', 3, 10, $any, 'kids,art', 'birthday', 'pâte à modeler, créatif', 0, '12 couleurs de pâte non toxique, moules, rouleaux et tampons. Des heures de création.'],
        ['Coffret naissance', 'enfants-bebe', 389, null, 'unisex', 0, 1, $any, 'baby', 'newborn', 'naissance, bébé, body, doudou', 1, 'Body en coton bio, bavoir, doudou et couverture brodée. Pour accueillir bébé en douceur.'],
        ['Coffret prière : tapis & sebha', 'coffrets', 299, null, 'unisex', 12, 99, $any, 'faith', 'eid,thanks', 'sejada, tasbih, ramadan', 1, 'Tapis de prière molletonné, sebha en bois d\'olivier et un petit coffret en bois gravé.'],
        ['Coffret « Merci » au bureau', 'coffrets', 159, null, 'unisex', 20, 99, $work, 'coffee,sweets,office', 'thanks,farewell', 'collègue, thé, biscuits', 0, 'Thé à la menthe, biscuits fins et une carte « Merci » : parfait pour un collègue ou un patron.'],
        ['Coffret chef à la maison', 'coffrets', 259, null, 'unisex', 18, 99, $any, 'cooking', 'housewarming,birthday', 'tablier, épices, cuisine', 0, 'Tablier en lin, épices du souk (ras el hanout, cumin, safran) et cuillères en bois d\'olivier.'],
        ['Mini appareil photo instantané', 'coffrets', 899, null, 'unisex', 12, 50, $any, 'photo,travel,tech', 'birthday,graduation,wedding', 'polaroid, instax, photos', 0, 'Photos imprimées en quelques secondes, avec un album et 20 films. Pour garder les souvenirs.'],
    ];
}

function demo_svg(string $icon, int $seed): string
{
    $palettes = [
        ['#FBEFE6', '#F3D9C6', '#C8643B'], ['#EEF1EA', '#D8E2D1', '#4E7451'], ['#F2EEF8', '#DED5EE', '#6B4FA0'],
        ['#FDF3E1', '#F5E0B5', '#B07A1E'], ['#EAF2F5', '#CFE1E8', '#2E6B80'], ['#FBEDEE', '#F2D2D6', '#B04A5A'],
    ];
    [$bg1, $bg2, $ink] = $palettes[$seed % count($palettes)];
    $icons = [
        'perfume' => '<rect x="150" y="170" width="100" height="120" rx="22"/><rect x="178" y="138" width="44" height="32" rx="6"/><path d="M186 138v-18h28v18"/><path d="M168 220h64"/>',
        'watch' => '<circle cx="200" cy="200" r="58"/><path d="M200 168v34l22 14"/><path d="M172 150l8-42h40l8 42M172 250l8 42h40l8-42"/>',
        'beauty' => '<rect x="170" y="200" width="60" height="96" rx="8"/><path d="M178 200v-38h44v38"/><path d="M186 162v-34l28-20v54"/>',
        'home' => '<rect x="160" y="190" width="80" height="104" rx="10"/><path d="M200 190v-24"/><path d="M200 166c-14-14-8-32 0-44 8 12 14 30 0 44z"/>',
        'tech' => '<path d="M136 230v-26a64 64 0 01128 0v26"/><rect x="126" y="226" width="34" height="58" rx="12"/><rect x="240" y="226" width="34" height="58" rx="12"/>',
        'sport' => '<circle cx="200" cy="200" r="70"/><path d="M200 168l28 20-10 33h-36l-10-33z"/><path d="M200 168v-38M228 188l36-10M218 221l22 32M182 221l-22 32M172 188l-36-10"/>',
        'coffee' => '<path d="M144 180h96v58a40 40 0 01-40 40h-16a40 40 0 01-40-40z"/><path d="M240 196h14a20 20 0 010 40h-16"/><path d="M172 154c-6-10 6-16 0-26M200 154c-6-10 6-16 0-26"/>',
        'book' => '<path d="M200 150c-22-14-48-16-72-12v128c24-4 50-2 72 12 22-14 48-16 72-12V138c-24-4-50-2-72 12z"/><path d="M200 150v128"/>',
        'bag' => '<path d="M140 190h120l-10 100H150z"/><path d="M172 190v-18a28 28 0 0156 0v18"/>',
        'kids' => '<circle cx="200" cy="214" r="54"/><circle cx="156" cy="160" r="20"/><circle cx="244" cy="160" r="20"/><circle cx="184" cy="206" r="4"/><circle cx="216" cy="206" r="4"/><path d="M188 232c8 8 16 8 24 0"/>',
        'box' => '<rect x="136" y="186" width="128" height="100" rx="8"/><rect x="128" y="160" width="144" height="30" rx="6"/><path d="M200 160v126"/><path d="M200 160c-20-30-52-26-44-6 6 12 44 6 44 6zm0 0c20-30 52-26 44-6-6 12-44 6-44 6z"/>',
    ];
    $art = $icons[$icon] ?? $icons['box'];
    $dots = '';
    mt_srand($seed * 7919);
    for ($i = 0; $i < 7; $i++) {
        $dots .= sprintf('<circle cx="%d" cy="%d" r="%d" fill="%s" opacity=".35"/>', mt_rand(20, 380), mt_rand(20, 380), mt_rand(3, 9), $ink);
    }
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="' . $bg1 . '"/><stop offset="1" stop-color="' . $bg2 . '"/></linearGradient></defs>'
        . '<rect width="400" height="400" fill="url(#g)"/><circle cx="200" cy="205" r="118" fill="#fff" opacity=".55"/>' . $dots
        . '<g fill="none" stroke="' . $ink . '" stroke-width="7" stroke-linecap="round" stroke-linejoin="round">' . $art . '</g></svg>';
}

// Writes every demo picture into assets/img/demo/ (run once by the developer;
// the files are committed so they upload with the site).
function build_demo_images(): void
{
    $cats = demo_categories();
    foreach (demo_products() as $n => $p) {
        file_put_contents(ROOT . '/assets/img/demo/' . slugify($p[0]) . '.svg', demo_svg($cats[$p[1]][1], $n));
    }
}

function seed_demo(PDO $pdo): void
{
    $catIds = [];
    $icons = [];
    $sort = 0;
    foreach (demo_categories() as $slug => [$name, $icon]) {
        $st = $pdo->prepare('SELECT id FROM categories WHERE slug = ?');
        $st->execute([$slug]);
        $id = $st->fetchColumn();
        if (!$id) {
            $pdo->prepare('INSERT INTO categories (name, slug, sort) VALUES (?, ?, ?)')->execute([$name, $slug, $sort]);
            $id = $pdo->lastInsertId();
        }
        $catIds[$slug] = (int)$id;
        $icons[$slug] = $icon;
        $sort++;
    }
    $now = time();
    foreach (demo_products() as $n => $p) {
        [$name, $cat, $price, $compare, $gender, $amin, $amax, $rel, $int, $occ, $tags, $feat, $desc] = $p;
        $slug = slugify($name);
        $st = $pdo->prepare('SELECT id FROM products WHERE slug = ?');
        $st->execute([$slug]);
        if ($st->fetchColumn()) continue;
        $pdo->prepare('INSERT INTO products (name, slug, description, price, compare_price, stock, category_id, gender, age_min, age_max, relations, interests, occasions, tags, featured, active, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,?)')
            ->execute([$name, $slug, $desc, $price, $compare, null, $catIds[$cat], $gender, $amin, $amax, $rel, $int, $occ, $tags, $feat, $now - $n * 3600, $now - $n * 3600]);
        $pid = (int)$pdo->lastInsertId();
        $file = 'assets/img/demo/' . $slug . '.svg'; // shipped with the site (see build_demo_images)
        if (!is_file(ROOT . '/' . $file) && is_writable(dirname(ROOT . '/' . $file))) file_put_contents(ROOT . '/' . $file, demo_svg($icons[$cat], $n));
        $pdo->prepare('INSERT INTO product_images (product_id, path, sort) VALUES (?, ?, 0)')->execute([$pid, $file]);
    }
}
