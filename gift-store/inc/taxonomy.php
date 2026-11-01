<?php
// The tag vocabulary shared by the admin panel (tagging products) and the
// gift finder (matching people to products).
//
// Interests and occasions carry keywords in English, French, Moroccan Darija
// written in Latin letters ("3arbizi") and Darija/Arabic script, so the free
// text box understands all of them. Add words here to teach the finder more.

const GENDERS = ['male', 'female', 'unisex'];

// Relationship keys are gender-neutral; the label follows the chosen gender.
function relations(): array
{
    return [
        'parent' => ['m' => ['fr' => 'Père', 'ar' => 'الأب', 'en' => 'Father'], 'f' => ['fr' => 'Mère', 'ar' => 'الأم', 'en' => 'Mother'], 'icon' => '♡'],
        'partner' => ['m' => ['fr' => 'Mari', 'ar' => 'الزوج', 'en' => 'Husband'], 'f' => ['fr' => 'Épouse', 'ar' => 'الزوجة', 'en' => 'Wife'], 'icon' => '❦'],
        'fiance' => ['m' => ['fr' => 'Fiancé', 'ar' => 'الخطيب', 'en' => 'Fiancé'], 'f' => ['fr' => 'Fiancée', 'ar' => 'الخطيبة', 'en' => 'Fiancée'], 'icon' => '◇'],
        'sibling' => ['m' => ['fr' => 'Frère', 'ar' => 'الأخ', 'en' => 'Brother'], 'f' => ['fr' => 'Sœur', 'ar' => 'الأخت', 'en' => 'Sister'], 'icon' => '∞'],
        'child' => ['m' => ['fr' => 'Fils', 'ar' => 'الولد', 'en' => 'Son'], 'f' => ['fr' => 'Fille', 'ar' => 'البنت', 'en' => 'Daughter'], 'icon' => '☆'],
        'grandparent' => ['m' => ['fr' => 'Grand-père', 'ar' => 'الجد', 'en' => 'Grandfather'], 'f' => ['fr' => 'Grand-mère', 'ar' => 'الجدة', 'en' => 'Grandmother'], 'icon' => '✿'],
        'family' => ['m' => ['fr' => 'Oncle / Cousin', 'ar' => 'العم / ولد العم', 'en' => 'Uncle / Cousin'], 'f' => ['fr' => 'Tante / Cousine', 'ar' => 'العمة / بنت العم', 'en' => 'Aunt / Cousin'], 'icon' => '⌂'],
        'friend' => ['m' => ['fr' => 'Ami', 'ar' => 'صاحبي', 'en' => 'Friend'], 'f' => ['fr' => 'Amie', 'ar' => 'صاحبتي', 'en' => 'Friend'], 'icon' => '✌'],
        'colleague' => ['m' => ['fr' => 'Collègue', 'ar' => 'زميل', 'en' => 'Colleague'], 'f' => ['fr' => 'Collègue', 'ar' => 'زميلة', 'en' => 'Colleague'], 'icon' => '▣'],
        'boss' => ['m' => ['fr' => 'Patron', 'ar' => 'المدير', 'en' => 'Boss'], 'f' => ['fr' => 'Patronne', 'ar' => 'المديرة', 'en' => 'Boss'], 'icon' => '♔'],
        'teacher' => ['m' => ['fr' => 'Professeur', 'ar' => 'الأستاذ', 'en' => 'Teacher'], 'f' => ['fr' => 'Professeure', 'ar' => 'الأستاذة', 'en' => 'Teacher'], 'icon' => '✎'],
    ];
}

function relation_label(string $key, string $gender, ?string $lang = null): string
{
    $r = relations()[$key] ?? null;
    if (!$r) return $key;
    $g = $gender === 'female' ? 'f' : 'm';
    return $r[$g][$lang ?? lang()] ?? $r[$g]['fr'];
}

// Neutral label for the admin panel, e.g. "Père / Mère".
function relation_admin_label(string $key): string
{
    $r = relations()[$key];
    return $r['m']['fr'] === $r['f']['fr'] ? $r['m']['fr'] : $r['m']['fr'] . ' / ' . $r['f']['fr'];
}

function interests(): array
{
    return [
        'football' => ['label' => ['fr' => 'Football', 'ar' => 'الكرة', 'en' => 'Football'],
            'kw' => ['football', 'foot', 'soccer', 'kora', 'lkora', 'l kora', 'koura', 'ballon', 'maillot', 'barca', 'barça', 'real madrid', 'raja', 'wydad', 'wac', 'mondial', 'can 2025', 'botola', 'ronaldo', 'messi', 'hakimi', 'الكورة', 'كورة', 'كرة القدم', 'الرجاء', 'الوداد', 'المنتخب', 'ماتش', 'match']],
        'sport' => ['label' => ['fr' => 'Sport & fitness', 'ar' => 'الرياضة', 'en' => 'Sport & fitness'],
            'kw' => ['sport', 'gym', 'salle', 'fitness', 'musculation', 'running', 'courir', 'jogging', 'yoga', 'riyada', 'riyadia', 'sportif', 'sportive', 'crossfit', 'boxe', 'boxing', 'basket', 'tennis', 'velo', 'vélo', 'natation', 'swim', 'رياضة', 'الرياضة', 'جيم', 'لاصال', 'كيجري']],
        'gaming' => ['label' => ['fr' => 'Jeux vidéo', 'ar' => 'ألعاب الفيديو', 'en' => 'Gaming'],
            'kw' => ['gaming', 'gamer', 'games', 'jeux video', 'jeux vidéo', 'jeu video', 'playstation', 'ps4', 'ps5', 'xbox', 'nintendo', 'switch', 'fifa', 'fc 25', 'fortnite', 'pubg', 'free fire', 'console', 'manette', 'l3ab', 'kaylab', 'kayl3ab', 'كيلعب', 'بلايستيشن', 'العاب', 'ألعاب الفيديو', 'جيمر']],
        'tech' => ['label' => ['fr' => 'High-tech', 'ar' => 'التكنولوجيا', 'en' => 'Tech & gadgets'],
            'kw' => ['tech', 'technologie', 'technology', 'gadget', 'phone', 'telephone', 'téléphone', 'tilifoun', 'smartphone', 'iphone', 'samsung', 'ordinateur', 'computer', 'pc', 'laptop', 'informatique', 'developpeur', 'développeur', 'developer', 'coder', 'programm', 'ecouteurs', 'écouteurs', 'airpods', 'casque', 'headphones', 'تيليفون', 'تلفون', 'بورطابل', 'حاسوب', 'التكنولوجيا', 'برمجة']],
        'coffee' => ['label' => ['fr' => 'Café & thé', 'ar' => 'القهوة و أتاي', 'en' => 'Coffee & tea'],
            'kw' => ['coffee', 'cafe', 'café', 'espresso', 'cappuccino', 'qahwa', 'kahwa', '9ahwa', '9hwa', 'lqahwa', 'thé', 'tea', 'atay', 'latay', 'infusion', 'قهوة', 'القهوة', 'أتاي', 'اتاي', 'الشاي']],
        'cooking' => ['label' => ['fr' => 'Cuisine', 'ar' => 'الطبخ', 'en' => 'Cooking'],
            'kw' => ['cuisine', 'cuisiner', 'cooking', 'cook', 'chef', 'patisserie', 'pâtisserie', 'baking', 'recette', 'tbikh', 'tayb', 'kattayb', 'katyeb', 'makla', 'tajine', 'tagine', 'طبخ', 'الطبخ', 'كطيب', 'كتطيب', 'الماكلة', 'حلويات']],
        'reading' => ['label' => ['fr' => 'Lecture', 'ar' => 'القراءة', 'en' => 'Reading'],
            'kw' => ['lecture', 'lire', 'livre', 'livres', 'roman', 'reading', 'books', 'book', 'novel', 'kindle', 'qraya', '9raya', 'kat9ra', 'kay9ra', 'ktab', 'ktob', 'كتاب', 'كتب', 'القراية', 'القراءة', 'كيقرا', 'روايات']],
        'writing' => ['label' => ['fr' => 'Écriture & papeterie', 'ar' => 'الكتابة', 'en' => 'Writing & stationery'],
            'kw' => ['ecrire', 'écrire', 'writing', 'journal', 'carnet', 'notebook', 'agenda', 'planner', 'stylo', 'pen', 'papeterie', 'stationery', 'calligraphie', 'kteba', 'الكتابة', 'دفتر', 'ستيلو']],
        'music' => ['label' => ['fr' => 'Musique', 'ar' => 'الموسيقى', 'en' => 'Music'],
            'kw' => ['musique', 'music', 'chanson', 'guitare', 'guitar', 'piano', 'rap', 'gnawa', 'chaabi', 'chaâbi', 'mousi9a', 'mosi9a', 'mousiqa', 'spotify', 'vinyl', 'speaker', 'موسيقى', 'الموسيقى', 'غنا', 'كيغني']],
        'travel' => ['label' => ['fr' => 'Voyage', 'ar' => 'السفر', 'en' => 'Travel'],
            'kw' => ['voyage', 'voyager', 'travel', 'traveling', 'trip', 'vacances', 'holiday', 'safar', 'sefer', 'kaysafer', 'katsafer', 'valise', 'passport', 'passeport', 'السفر', 'كيسافر', 'كتسافر', 'سفر', 'العطلة']],
        'fashion' => ['label' => ['fr' => 'Mode', 'ar' => 'الموضة', 'en' => 'Fashion'],
            'kw' => ['mode', 'fashion', 'style', 'stylé', 'vetements', 'vêtements', 'clothes', 'sac', 'bag', 'sneakers', 'baskets', 'lebsa', 'lhwayej', 'kaftan', 'caftan', 'djellaba', 'tkchita', 'الموضة', 'اللبسة', 'الحوايج', 'قفطان', 'جلابة']],
        'beauty' => ['label' => ['fr' => 'Beauté & soins', 'ar' => 'الجمال و العناية', 'en' => 'Beauty & skincare'],
            'kw' => ['beaute', 'beauté', 'beauty', 'maquillage', 'makeup', 'make up', 'skincare', 'soin', 'soins', 'creme', 'crème', 'cosmetique', 'cosmétique', 'mekyaj', 'makyaj', 'argan', 'hammam', 'ghassoul', 'المكياج', 'ماكياج', 'العناية', 'كريم', 'الحمام']],
        'perfume' => ['label' => ['fr' => 'Parfums', 'ar' => 'العطور', 'en' => 'Fragrance'],
            'kw' => ['parfum', 'parfums', 'perfume', 'fragrance', 'cologne', 'oud', 'musc', 'musk', 'ri7a', 'riha', '3tr', 'l3tr', 'bkhour', 'bakhour', 'عطر', 'عطور', 'العطر', 'ريحة', 'بخور', 'مسك']],
        'jewelry' => ['label' => ['fr' => 'Bijoux', 'ar' => 'المجوهرات', 'en' => 'Jewellery'],
            'kw' => ['bijou', 'bijoux', 'jewelry', 'jewellery', 'collier', 'necklace', 'bracelet', 'bague', 'ring', 'boucles', 'earrings', 'gold', 'argent', 'silver', 'dhab', 'dheb', 'nqra', 'khatem', 'مجوهرات', 'الذهب', 'النقرة', 'خاتم', 'سلسلة', 'دبليج']],
        'watches' => ['label' => ['fr' => 'Montres', 'ar' => 'الساعات', 'en' => 'Watches'],
            'kw' => ['montre', 'montres', 'watch', 'watches', 'magana', 'mangana', 'sa3a', 'ساعة', 'مكانة', 'منكانة']],
        'home' => ['label' => ['fr' => 'Déco & maison', 'ar' => 'الديكور و الدار', 'en' => 'Home & decor'],
            'kw' => ['deco', 'déco', 'decoration', 'décoration', 'decor', 'maison', 'home', 'interieur', 'intérieur', 'bougie', 'candle', 'plaid', 'vase', 'cadre', 'ديكور', 'الدار', 'شمعة', 'الزواق']],
        'art' => ['label' => ['fr' => 'Art & DIY', 'ar' => 'الفن و الإبداع', 'en' => 'Art & crafts'],
            'kw' => ['art', 'artiste', 'artist', 'dessin', 'drawing', 'peinture', 'painting', 'diy', 'creatif', 'créatif', 'creative', 'crochet', 'tricot', 'knitting', 'couture', 'sewing', 'rsm', 'rassam', 'kayrsm', 'رسم', 'الرسم', 'كيرسم', 'خياطة', 'الفن']],
        'photo' => ['label' => ['fr' => 'Photographie', 'ar' => 'التصوير', 'en' => 'Photography'],
            'kw' => ['photo', 'photos', 'photographie', 'photography', 'camera', 'caméra', 'appareil photo', 'polaroid', 'instagram', 'tsawer', 'tswira', 'tsawr', 'تصاور', 'التصوير', 'كاميرا']],
        'cars' => ['label' => ['fr' => 'Voitures & moto', 'ar' => 'الطوموبيلات', 'en' => 'Cars & bikes'],
            'kw' => ['voiture', 'voitures', 'car', 'cars', 'auto', 'moto', 'motor', 'motorbike', 'tomobil', 'tonobil', 'lmotor', 'f1', 'formule 1', 'garage', 'طوموبيل', 'طونوبيل', 'الموطور', 'سيارة', 'السيارات']],
        'nature' => ['label' => ['fr' => 'Nature & jardin', 'ar' => 'الطبيعة و الجردة', 'en' => 'Nature & garden'],
            'kw' => ['nature', 'jardin', 'garden', 'gardening', 'jardinage', 'plante', 'plantes', 'plants', 'fleurs', 'flowers', 'randonnee', 'randonnée', 'hiking', 'camping', 'montagne', 'mountain', 'plage', 'beach', 'jerda', 'nwar', 'الجردة', 'النوار', 'الورد', 'الطبيعة', 'التخييم']],
        'wellness' => ['label' => ['fr' => 'Bien-être & détente', 'ar' => 'الراحة', 'en' => 'Wellness & relaxing'],
            'kw' => ['bien-etre', 'bien-être', 'wellness', 'relax', 'detente', 'détente', 'spa', 'massage', 'stress', 'fatigue', 'fatigué', 'tired', 'meditation', 'méditation', 'sommeil', 'sleep', 'ra7a', 'raha', 'المساج', 'الراحة', 'عيان', 'عيانة', 'تعبان']],
        'faith' => ['label' => ['fr' => 'Spiritualité', 'ar' => 'الدين و الروحانيات', 'en' => 'Faith & spirituality'],
            'kw' => ['priere', 'prière', 'pray', 'prayer', 'coran', 'quran', 'koran', 'mosquee', 'mosquée', 'mosque', 'omra', 'umrah', 'hajj', 'haj', 'tasbih', 'sebha', 'sab7a', 'tsbi7', 'sejada', 'sjada', 'pieux', 'pieuse', 'religious', 'msli', 'kaysli', 'katsli', 'mtdyn', 'القرآن', 'الصلاة', 'كيصلي', 'كتصلي', 'سبحة', 'سجادة', 'العمرة', 'الحج', 'متدين']],
        'office' => ['label' => ['fr' => 'Bureau & pro', 'ar' => 'المكتب و الخدمة', 'en' => 'Office & work'],
            'kw' => ['bureau', 'office', 'travail', 'work', 'boulot', 'business', 'manager', 'entrepreneur', 'professionnel', 'reunion', 'réunion', 'khedma', 'lkhedma', 'kaykhdem', 'المكتب', 'الخدمة', 'البيرو']],
        'sweets' => ['label' => ['fr' => 'Gourmandises', 'ar' => 'الحلويات', 'en' => 'Sweet treats'],
            'kw' => ['chocolat', 'chocolate', 'bonbons', 'sweets', 'candy', 'gourmand', 'gourmande', 'sucre', 'sucré', 'dessert', 'gateau', 'gâteau', 'cake', 'dattes', 'dates', 'tmer', 'chocola', 'helwa', '7lwa', 'شكلاط', 'الشكلاط', 'الحلوة', 'التمر']],
        'movies' => ['label' => ['fr' => 'Cinéma & séries', 'ar' => 'الأفلام و المسلسلات', 'en' => 'Movies & series'],
            'kw' => ['film', 'films', 'movie', 'movies', 'cinema', 'cinéma', 'serie', 'série', 'series', 'netflix', 'anime', 'manga', 'aflam', 'mosalsalat', 'feelm', 'أفلام', 'الأفلام', 'مسلسلات', 'نتفليكس', 'انمي']],
        'kids' => ['label' => ['fr' => 'Jouets & enfants', 'ar' => 'ألعاب الأطفال', 'en' => 'Toys & kids'],
            'kw' => ['jouet', 'jouets', 'toy', 'toys', 'lego', 'peluche', 'doudou', 'poupee', 'poupée', 'doll', 'puzzle', 'lou3ba', 'lo3ba', 'drari sghar', 'لعبة', 'لعب', 'دمية', 'الدراري الصغار']],
        'baby' => ['label' => ['fr' => 'Bébé & naissance', 'ar' => 'المواليد', 'en' => 'Baby & newborn'],
            'kw' => ['bebe', 'bébé', 'baby', 'naissance', 'newborn', 'nouveau-ne', 'nouveau-né', 'pregnant', 'tfl sghir', 'tfla', 'wlida', 'sbou3', 'sboue', 'حاملة', 'ولادة', 'السبوع', 'بيبي', 'رضيع']],
    ];
}

function occasions(): array
{
    return [
        'birthday' => ['label' => ['fr' => 'Anniversaire', 'ar' => 'عيد الميلاد', 'en' => 'Birthday'],
            'kw' => ['anniversaire', 'anniv', 'birthday', 'bday', '3id milad', '3id lmilad', 'aid milad', 'milad', 'عيد ميلاد', 'عيد الميلاد', 'ذكرى']],
        'wedding' => ['label' => ['fr' => 'Mariage', 'ar' => 'العرس', 'en' => 'Wedding'],
            'kw' => ['mariage', 'wedding', 'marie', 'mariée', 'marié', '3ers', '3rs', 'l3ers', 'zwaj', 'zawaj', 'khotba', 'fiancailles', 'fiançailles', 'engagement', 'عرس', 'العرس', 'زواج', 'الخطوبة']],
        'graduation' => ['label' => ['fr' => 'Réussite & diplôme', 'ar' => 'النجاح', 'en' => 'Graduation'],
            'kw' => ['diplome', 'diplôme', 'graduation', 'graduated', 'bac', 'baccalaureat', 'licence', 'master', 'reussite', 'réussite', 'examen', 'nja7', 'nj7', 'nje7', 'najah', 'نجاح', 'النجاح', 'الباك', 'ديبلوم']],
        'eid' => ['label' => ['fr' => 'Aïd & Ramadan', 'ar' => 'العيد و رمضان', 'en' => 'Eid & Ramadan'],
            'kw' => ['aid', 'aïd', 'eid', '3id', 'l3id', 'ramadan', 'ramdan', 'remdan', 'عيد', 'العيد', 'رمضان']],
        'newborn' => ['label' => ['fr' => 'Naissance', 'ar' => 'الازدياد', 'en' => 'New baby'],
            'kw' => ['naissance', 'birth', 'new baby', 'baby shower', 'sbou3', 'sboue', 'twelled', 'السبوع', 'تزاد']],
        'housewarming' => ['label' => ['fr' => 'Crémaillère', 'ar' => 'دار جديدة', 'en' => 'Housewarming'],
            'kw' => ['cremaillere', 'crémaillère', 'housewarming', 'new house', 'nouvelle maison', 'nouvel appart', 'demenage', 'déménage', 'dar jdida', 'chri dar', 'دار جديدة', 'شرا دار', 'رحل']],
        'love' => ['label' => ['fr' => 'Saint-Valentin & amour', 'ar' => 'الحب', 'en' => 'Valentine\'s & love'],
            'kw' => ['saint valentin', 'saint-valentin', 'valentine', 'romantique', 'romantic', '7ob', 'kanbghih', 'kanbghiha', 'الحب', 'كنبغيه', 'كنبغيها']],
        'thanks' => ['label' => ['fr' => 'Merci', 'ar' => 'شكراً', 'en' => 'Thank you'],
            'kw' => ['merci', 'remercier', 'thank', 'thanks', 'grateful', 'chokran', 'choukran', 'shukran', 'شكرا', 'شكراً']],
        'farewell' => ['label' => ['fr' => 'Départ & retraite', 'ar' => 'التقاعد و الوداع', 'en' => 'Farewell & retirement'],
            'kw' => ['retraite', 'retirement', 'retire', 'depart', 'départ', 'farewell', 'leaving', 'goodbye', 'mouta9a3id', 'taqa3od', 'التقاعد', 'الوداع', 'غادي يمشي']],
        'getwell' => ['label' => ['fr' => 'Prompt rétablissement', 'ar' => 'الشفاء', 'en' => 'Get well soon'],
            'kw' => ['malade', 'sick', 'hopital', 'hôpital', 'hospital', 'operation', 'opération', 'retablissement', 'rétablissement', 'get well', 'mrid', 'mrida', 'sbitar', 'مريض', 'مريضة', 'السبيطار', 'الشفاء']],
    ];
}

function tag_label(array $dict, string $key): string
{
    return $dict[$key]['label'][lang()] ?? $dict[$key]['label']['fr'] ?? $key;
}

function cities(): array
{
    return ['Casablanca', 'Rabat', 'Salé', 'Témara', 'Marrakech', 'Fès', 'Tanger', 'Agadir', 'Meknès', 'Oujda', 'Kénitra', 'Tétouan', 'El Jadida', 'Mohammedia', 'Safi', 'Béni Mellal', 'Nador', 'Khouribga', 'Settat', 'Berrechid', 'Laâyoune', 'Dakhla', 'Essaouira', 'Ouarzazate', 'Errachidia', 'Taza', 'Al Hoceïma', 'Larache', 'Ksar El Kébir', 'Khémisset', 'Guelmim', 'Ifrane', 'Autre ville'];
}
