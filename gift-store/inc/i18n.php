<?php
// Interface text in French (default), Arabic and English.
// Product names and descriptions are shown as written in the admin panel.

const LANGS = ['fr' => 'FR', 'ar' => 'ع', 'en' => 'EN'];

function lang(): string
{
    static $lang = null;
    if ($lang !== null) return $lang;
    $want = $_GET['lang'] ?? $_COOKIE['lang'] ?? '';
    if (isset(LANGS[$want])) {
        if (($_COOKIE['lang'] ?? '') !== $want && !headers_sent()) {
            setcookie('lang', $want, ['expires' => time() + 31536000, 'path' => '/', 'samesite' => 'Lax']);
        }
        return $lang = $want;
    }
    return $lang = 'fr';
}

function is_rtl(): bool
{
    return lang() === 'ar';
}

function t(string $key, array $vars = []): string
{
    static $dict = null;
    if ($dict === null) $dict = translations();
    $s = $dict[$key][lang()] ?? $dict[$key]['fr'] ?? $key;
    foreach ($vars as $k => $v) $s = str_replace('{' . $k . '}', (string)$v, $s);
    return $s;
}

function translations(): array
{
    return [
        'currency' => ['fr' => 'DH', 'ar' => 'درهم', 'en' => 'MAD'],
        'nav_home' => ['fr' => 'Accueil', 'ar' => 'الرئيسية', 'en' => 'Home'],
        'nav_shop' => ['fr' => 'Boutique', 'ar' => 'المتجر', 'en' => 'Shop'],
        'nav_finder' => ['fr' => 'Trouver', 'ar' => 'اقترح لي', 'en' => 'Find'],
        'nav_cart' => ['fr' => 'Panier', 'ar' => 'السلة', 'en' => 'Cart'],
        'search_ph' => ['fr' => 'Rechercher un cadeau…', 'ar' => 'ابحث عن هدية…', 'en' => 'Search for a gift…'],

        'hero_kicker' => ['fr' => 'Conseiller cadeau intelligent', 'ar' => 'مستشار الهدايا الذكي', 'en' => 'Smart gift advisor'],
        'hero_title' => ['fr' => 'Le cadeau <em>parfait</em>,<br>sans hésiter.', 'ar' => 'الهدية <em>المثالية</em>،<br>بلا حيرة.', 'en' => 'The <em>perfect</em> gift,<br>no second-guessing.'],
        'hero_sub' => ['fr' => 'Dites-nous pour qui : nous choisissons parmi nos cadeaux ceux qui lui iront vraiment.', 'ar' => 'قل لنا لمن الهدية، و نختارو ليك من هدايانا اللي كتناسبو فعلاً.', 'en' => 'Tell us who it\'s for and we\'ll pick the gifts from our collection that truly suit them.'],

        'step_1' => ['fr' => 'Dites-nous pour qui, en quelques secondes', 'ar' => 'قل لنا لمن الهدية فثواني', 'en' => 'Tell us who it\'s for, in seconds'],
        'step_2' => ['fr' => 'Nous comparons chaque cadeau de la boutique', 'ar' => 'كنقارنو كل هدية فالمتجر', 'en' => 'We compare every gift in the store'],
        'step_3' => ['fr' => 'Commandez, payez à la livraison', 'ar' => 'اطلب و خلص عند الاستلام', 'en' => 'Order and pay on delivery'],
        'f_gender' => ['fr' => 'C\'est pour', 'ar' => 'الهدية لـ', 'en' => 'It\'s for'],
        'f_him' => ['fr' => 'Lui', 'ar' => 'هو', 'en' => 'Him'],
        'f_her' => ['fr' => 'Elle', 'ar' => 'هي', 'en' => 'Her'],
        'f_age' => ['fr' => 'Son âge', 'ar' => 'العمر', 'en' => 'Their age'],
        'f_years' => ['fr' => 'ans', 'ar' => 'سنة', 'en' => 'yrs'],
        'f_relation' => ['fr' => 'C\'est votre…', 'ar' => 'شنو كيكون ليك؟', 'en' => 'They are your…'],
        'f_budget' => ['fr' => 'Votre budget', 'ar' => 'الميزانية ديالك', 'en' => 'Your budget'],
        'f_notes' => ['fr' => 'Parlez-nous de cette personne', 'ar' => 'حدثنا على هاد الشخص', 'en' => 'Tell us about them'],
        'f_notes_hint' => ['fr' => 'Français, English ou darija — comme vous voulez.', 'ar' => 'بالدارجة، بالفرنسية ولا بالإنجليزية — كيف بغيتي.', 'en' => 'English, French or Darija — however you like.'],
        'f_optional' => ['fr' => 'facultatif', 'ar' => 'اختياري', 'en' => 'optional'],
        'f_submit' => ['fr' => 'Trouver le cadeau parfait', 'ar' => 'لقا ليا الهدية المثالية', 'en' => 'Find the perfect gift'],
        'f_pick_gender' => ['fr' => 'Choisissez Lui ou Elle', 'ar' => 'اختر هو أو هي', 'en' => 'Choose Him or Her'],
        'f_pick_relation' => ['fr' => 'Choisissez votre lien', 'ar' => 'اختر العلاقة', 'en' => 'Choose how you\'re related'],

        'age_baby' => ['fr' => 'Bébé', 'ar' => 'رضيع', 'en' => 'Baby'],
        'age_kid' => ['fr' => 'Enfant', 'ar' => 'طفل', 'en' => 'Child'],
        'age_teen' => ['fr' => 'Ado', 'ar' => 'مراهق', 'en' => 'Teen'],
        'age_young' => ['fr' => 'Jeune adulte', 'ar' => 'شاب', 'en' => 'Young adult'],
        'age_adult' => ['fr' => 'Adulte', 'ar' => 'راشد', 'en' => 'Adult'],
        'age_senior' => ['fr' => 'Senior', 'ar' => 'كبير السن', 'en' => 'Senior'],

        'thinking_1' => ['fr' => 'Lecture de votre description…', 'ar' => 'كنقراو الوصف ديالك…', 'en' => 'Reading your description…'],
        'thinking_2' => ['fr' => 'Comparaison de chaque cadeau…', 'ar' => 'كنقارنو كل هدية…', 'en' => 'Comparing every gift…'],
        'thinking_3' => ['fr' => 'Sélection des meilleurs…', 'ar' => 'كنختارو الأحسن…', 'en' => 'Picking the very best…'],
        'res_title' => ['fr' => 'Nos 3 meilleures idées', 'ar' => 'أحسن 3 اقتراحات', 'en' => 'Our top 3 ideas'],
        'res_more' => ['fr' => 'Autres idées qui lui plairont', 'ar' => 'أفكار أخرى غادي تعجبو', 'en' => 'More ideas they\'ll love'],
        'res_understood' => ['fr' => 'Nous avons compris', 'ar' => 'فهمنا', 'en' => 'We understood'],
        'res_none' => ['fr' => 'Aucun cadeau ne correspond exactement. Essayez d\'élargir le budget ou l\'âge.', 'ar' => 'ما لقينا حتى هدية مناسبة بالضبط. جرب توسع الميزانية.', 'en' => 'No gift matches exactly. Try widening the budget.'],
        'res_retry' => ['fr' => 'Modifier ma recherche', 'ar' => 'بدّل البحث', 'en' => 'Edit my search'],
        'res_match' => ['fr' => 'compatible', 'ar' => 'توافق', 'en' => 'match'],
        'res_best' => ['fr' => 'Le meilleur choix', 'ar' => 'الاختيار الأفضل', 'en' => 'Best pick'],
        'res_error' => ['fr' => 'Oups, réessayez dans un instant.', 'ar' => 'وقع مشكل، عاود من بعد شوية.', 'en' => 'Oops, try again in a moment.'],
        'res_local' => ['fr' => 'Suggestions basées sur vos critères', 'ar' => 'اقتراحات حسب المعايير ديالك', 'en' => 'Suggestions based on your criteria'],

        'why_relation' => ['fr' => 'Idéal pour : {r}', 'ar' => 'هدية مناسبة: {r}', 'en' => 'Ideal for: {r}'],
        'why_budget' => ['fr' => 'Dans votre budget', 'ar' => 'فالميزانية ديالك', 'en' => 'Within budget'],
        'why_age' => ['fr' => 'Idéal à {a} ans', 'ar' => 'مناسب لعمر {a}', 'en' => 'Great at {a}'],
        'why_likes' => ['fr' => 'Aime : {x}', 'ar' => 'كيحب: {x}', 'en' => 'Into {x}'],
        'why_likes_f' => ['fr' => 'Aime : {x}', 'ar' => 'كتحب: {x}', 'en' => 'Into {x}'],
        'why_occasion' => ['fr' => 'Parfait pour : {x}', 'ar' => 'مثالي لـ: {x}', 'en' => 'Perfect for {x}'],

        'buy' => ['fr' => 'Acheter', 'ar' => 'اشري', 'en' => 'Buy'],
        'buy_now' => ['fr' => 'Acheter maintenant', 'ar' => 'اشري دابا', 'en' => 'Buy now'],
        'qb_submit' => ['fr' => 'Confirmer la commande', 'ar' => 'أكّد الطلب', 'en' => 'Confirm order'],
        'qb_ok_sub' => ['fr' => 'Nous vous appelons très vite au {p} pour confirmer. Vous payez {t} à la livraison.', 'ar' => 'غادي نتصلو بيك قريباً ف {p} باش نأكدو. غادي تخلص {t} عند الاستلام.', 'en' => 'We\'ll call you soon on {p} to confirm. You\'ll pay {t} on delivery.'],
        'err_phone10' => ['fr' => 'Entrez un numéro marocain de 10 chiffres (ex. 0612345678).', 'ar' => 'دخل رقم مغربي فيه 10 أرقام (مثلا 0612345678).', 'en' => 'Enter a 10-digit Moroccan number (e.g. 0612345678).'],
        'err_too_many' => ['fr' => 'Trop de commandes en peu de temps. Contactez-nous sur WhatsApp.', 'ar' => 'بزاف ديال الطلبات ف وقت قصير. تواصل معانا ف واتساب.', 'en' => 'Too many orders in a short time. Contact us on WhatsApp.'],
        'nav_help' => ['fr' => 'Aide', 'ar' => 'مساعدة', 'en' => 'Help'],
        'res_close' => ['fr' => 'Proches de vos critères', 'ar' => 'قريبين من اللي بغيتي', 'en' => 'Close to what you asked'],
        'res_close_none' => ['fr' => 'Rien ne correspond exactement à tous vos critères. Voici les cadeaux les plus proches.', 'ar' => 'ما كاين حتى هدية فيها كلشي بالضبط. ها أقرب الهدايا.', 'en' => 'Nothing matches every criterion exactly. Here are the closest gifts.'],
        'gap_over' => ['fr' => '+{x} au-dessus du budget', 'ar' => '+{x} على الميزانية', 'en' => '{x} over budget'],
        'gap_under' => ['fr' => 'Sous votre budget', 'ar' => 'أقل من الميزانية', 'en' => 'Below your budget'],
        'gap_age' => ['fr' => 'Prévu pour {a}–{b} ans', 'ar' => 'مناسب لعمر {a}–{b}', 'en' => 'Made for ages {a}–{b}'],
        'gap_relation' => ['fr' => 'Pas pensé pour : {r}', 'ar' => 'ماشي مخصص لـ: {r}', 'en' => 'Not aimed at: {r}'],
        'shop_close' => ['fr' => 'Rien d\'exact pour cette recherche — voici les cadeaux les plus proches.', 'ar' => 'ما لقينا والو بالضبط — ها أقرب الهدايا.', 'en' => 'Nothing exact for this search — here are the closest gifts.'],
        'add_to_cart' => ['fr' => 'Ajouter au panier', 'ar' => 'زيد للسلة', 'en' => 'Add to cart'],
        'added' => ['fr' => 'Ajouté ✓', 'ar' => 'تزاد ✓', 'en' => 'Added ✓'],
        'out_of_stock' => ['fr' => 'Épuisé', 'ar' => 'نفد', 'en' => 'Sold out'],
        'view' => ['fr' => 'Voir', 'ar' => 'شوف', 'en' => 'View'],
        'qty' => ['fr' => 'Quantité', 'ar' => 'الكمية', 'en' => 'Quantity'],

        'sec_categories' => ['fr' => 'Explorer par univers', 'ar' => 'تصفح حسب الصنف', 'en' => 'Browse by world'],
        'sec_featured' => ['fr' => 'Coups de cœur', 'ar' => 'اختياراتنا', 'en' => 'Our favourites'],
        'sec_featured_sub' => ['fr' => 'Les cadeaux que l\'on offrirait nous-mêmes.', 'ar' => 'هدايا نقدموها حتى حنا.', 'en' => 'Gifts we\'d give ourselves.'],
        'sec_new' => ['fr' => 'Nouveautés', 'ar' => 'جديدنا', 'en' => 'New in'],
        'see_all' => ['fr' => 'Tout voir', 'ar' => 'شوف الكل', 'en' => 'See all'],

        'trust_cod' => ['fr' => 'Paiement à la livraison', 'ar' => 'الدفع عند الاستلام', 'en' => 'Cash on delivery'],
        'trust_cod_sub' => ['fr' => 'Vous payez en recevant', 'ar' => 'كتخلص ملي توصلك', 'en' => 'Pay when it arrives'],
        'trust_ship' => ['fr' => 'Livraison partout au Maroc', 'ar' => 'التوصيل لكل المغرب', 'en' => 'Delivery across Morocco'],
        'trust_ship_sub' => ['fr' => '24 à 72h', 'ar' => 'من 24 حتى 72 ساعة', 'en' => '24 to 72h'],
        'trust_wrap' => ['fr' => 'Commande en 30 secondes', 'ar' => 'الطلب ف 30 ثانية', 'en' => 'Order in 30 seconds'],
        'trust_wrap_sub' => ['fr' => 'Nom, téléphone, ville. C\'est tout.', 'ar' => 'الاسم، الهاتف، المدينة. صافي.', 'en' => 'Name, phone, city. That\'s it.'],

        'shop_title' => ['fr' => 'Tous les cadeaux', 'ar' => 'كل الهدايا', 'en' => 'All gifts'],
        'all' => ['fr' => 'Tout', 'ar' => 'الكل', 'en' => 'All'],
        'sort' => ['fr' => 'Trier', 'ar' => 'ترتيب', 'en' => 'Sort'],
        'sort_new' => ['fr' => 'Nouveautés', 'ar' => 'الأحدث', 'en' => 'Newest'],
        'sort_low' => ['fr' => 'Prix croissant', 'ar' => 'الثمن: من الأرخص', 'en' => 'Price: low to high'],
        'sort_high' => ['fr' => 'Prix décroissant', 'ar' => 'الثمن: من الأغلى', 'en' => 'Price: high to low'],
        'for_him' => ['fr' => 'Pour lui', 'ar' => 'ليه', 'en' => 'For him'],
        'for_her' => ['fr' => 'Pour elle', 'ar' => 'ليها', 'en' => 'For her'],
        'n_products' => ['fr' => '{n} cadeaux', 'ar' => '{n} هدية', 'en' => '{n} gifts'],
        'no_products' => ['fr' => 'Aucun cadeau trouvé.', 'ar' => 'ما لقينا حتى هدية.', 'en' => 'No gifts found.'],
        'results_for' => ['fr' => 'Résultats pour « {q} »', 'ar' => 'نتائج « {q} »', 'en' => 'Results for “{q}”'],

        'ideal_for' => ['fr' => 'Idéal pour', 'ar' => 'مناسب لهادو', 'en' => 'Ideal for'],
        'details' => ['fr' => 'Détails', 'ar' => 'التفاصيل', 'en' => 'Details'],
        'related' => ['fr' => 'Vous aimerez aussi', 'ar' => 'غادي يعجبك حتى', 'en' => 'You may also like'],
        'cod_note' => ['fr' => 'Payez en espèces à la réception. Aucune carte nécessaire.', 'ar' => 'خلص كاش ملي توصلك الهدية. ما محتاجش بطاقة.', 'en' => 'Pay cash when it arrives. No card needed.'],
        'order_whatsapp' => ['fr' => 'Commander sur WhatsApp', 'ar' => 'اطلب عبر واتساب', 'en' => 'Order on WhatsApp'],

        'cart_title' => ['fr' => 'Votre panier', 'ar' => 'السلة ديالك', 'en' => 'Your cart'],
        'cart_empty' => ['fr' => 'Votre panier est vide.', 'ar' => 'السلة خاوية.', 'en' => 'Your cart is empty.'],
        'cart_empty_cta' => ['fr' => 'Trouver une idée', 'ar' => 'لقا فكرة', 'en' => 'Find an idea'],
        'subtotal' => ['fr' => 'Sous-total', 'ar' => 'المجموع الفرعي', 'en' => 'Subtotal'],
        'delivery' => ['fr' => 'Livraison', 'ar' => 'التوصيل', 'en' => 'Delivery'],
        'free' => ['fr' => 'Offerte', 'ar' => 'مجاني', 'en' => 'Free'],
        'total' => ['fr' => 'Total', 'ar' => 'المجموع', 'en' => 'Total'],
        'checkout' => ['fr' => 'Commander', 'ar' => 'كمّل الطلب', 'en' => 'Checkout'],
        'free_from' => ['fr' => 'Livraison offerte dès {x}', 'ar' => 'التوصيل مجاني ابتداءً من {x}', 'en' => 'Free delivery from {x}'],
        'free_left' => ['fr' => 'Plus que {x} pour la livraison offerte', 'ar' => 'باقي {x} وتولي التوصيل مجانية', 'en' => '{x} more for free delivery'],
        'free_ok' => ['fr' => 'Livraison offerte 🎉', 'ar' => 'التوصيل مجاني 🎉', 'en' => 'Free delivery 🎉'],
        'remove' => ['fr' => 'Retirer', 'ar' => 'حيد', 'en' => 'Remove'],

        'co_title' => ['fr' => 'Finaliser la commande', 'ar' => 'إتمام الطلب', 'en' => 'Complete your order'],
        'co_sub' => ['fr' => 'Paiement en espèces à la livraison. Nous vous appelons pour confirmer.', 'ar' => 'الدفع كاش عند الاستلام. غادي نتصلو بيك باش نأكدو.', 'en' => 'Cash on delivery. We\'ll call you to confirm.'],
        'co_name' => ['fr' => 'Nom complet', 'ar' => 'الاسم الكامل', 'en' => 'Full name'],
        'co_phone' => ['fr' => 'Téléphone', 'ar' => 'رقم الهاتف', 'en' => 'Phone'],
        'co_city' => ['fr' => 'Ville', 'ar' => 'المدينة', 'en' => 'City'],
        'co_city_pick' => ['fr' => 'Choisissez votre ville', 'ar' => 'اختر المدينة', 'en' => 'Choose your city'],
        'co_address' => ['fr' => 'Adresse de livraison', 'ar' => 'عنوان التوصيل', 'en' => 'Delivery address'],
        'co_address_ph' => ['fr' => 'Quartier, rue, n°, repère…', 'ar' => 'الحي، الزنقة، الرقم، علامة…', 'en' => 'Area, street, number, landmark…'],
        'co_note' => ['fr' => 'Note pour la livraison', 'ar' => 'ملاحظة للتوصيل', 'en' => 'Delivery note'],
        'co_wrap' => ['fr' => 'Emballage cadeau', 'ar' => 'تغليف الهدية', 'en' => 'Gift wrapping'],
        'co_wrap_sub' => ['fr' => 'Papier, ruban et carte', 'ar' => 'ورق، شريطة وبطاقة', 'en' => 'Paper, ribbon and a card'],
        'co_message' => ['fr' => 'Message sur la carte', 'ar' => 'الرسالة فالبطاقة', 'en' => 'Card message'],
        'co_message_ph' => ['fr' => 'Joyeux anniversaire mon frère !', 'ar' => 'عيد ميلاد سعيد خويا!', 'en' => 'Happy birthday, brother!'],
        'co_submit' => ['fr' => 'Confirmer la commande', 'ar' => 'أكّد الطلب', 'en' => 'Place order'],
        'co_pay' => ['fr' => 'Paiement', 'ar' => 'الدفع', 'en' => 'Payment'],
        'co_summary' => ['fr' => 'Récapitulatif', 'ar' => 'ملخص الطلب', 'en' => 'Summary'],
        'co_wrap_fee' => ['fr' => 'Emballage', 'ar' => 'التغليف', 'en' => 'Wrapping'],
        'err_name' => ['fr' => 'Entrez votre nom.', 'ar' => 'دخل الاسم ديالك.', 'en' => 'Enter your name.'],
        'err_phone' => ['fr' => 'Numéro marocain invalide (ex. 06 12 34 56 78).', 'ar' => 'رقم مغربي غير صحيح (مثلا 06 12 34 56 78).', 'en' => 'Invalid Moroccan number (e.g. 06 12 34 56 78).'],
        'err_city' => ['fr' => 'Choisissez une ville.', 'ar' => 'اختر المدينة.', 'en' => 'Choose a city.'],
        'err_address' => ['fr' => 'Entrez une adresse complète.', 'ar' => 'دخل العنوان كامل.', 'en' => 'Enter a full address.'],
        'err_cart' => ['fr' => 'Votre panier est vide ou un article n\'est plus disponible.', 'ar' => 'السلة خاوية ولا شي منتوج ما بقاش.', 'en' => 'Your cart is empty or an item is no longer available.'],

        'ok_title' => ['fr' => 'Merci, c\'est commandé !', 'ar' => 'شكراً، الطلب تسجل!', 'en' => 'Thank you, it\'s ordered!'],
        'ok_sub' => ['fr' => 'Nous vous appelons très vite au {p} pour confirmer. Vous payez {t} à la livraison.', 'ar' => 'غادي نتصلو بيك قريباً فـ {p} باش نأكدو. غادي تخلص {t} عند الاستلام.', 'en' => 'We\'ll call you soon on {p} to confirm. You\'ll pay {t} on delivery.'],
        'ok_ref' => ['fr' => 'Commande n°', 'ar' => 'رقم الطلب', 'en' => 'Order no.'],
        'ok_back' => ['fr' => 'Continuer mes achats', 'ar' => 'كمّل التسوق', 'en' => 'Keep shopping'],

        'footer_tag' => ['fr' => 'Des cadeaux choisis avec soin, livrés partout au Maroc.', 'ar' => 'هدايا مختارة بعناية، كتوصل لكل المغرب.', 'en' => 'Thoughtful gifts, delivered all over Morocco.'],
        'footer_help' => ['fr' => 'Besoin d\'aide ?', 'ar' => 'محتاج مساعدة؟', 'en' => 'Need help?'],
    ];
}
