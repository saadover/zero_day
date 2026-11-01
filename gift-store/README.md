# Hdiya — gift store for Morocco

An online gift shop with an AI gift advisor at the top of the home page.
Visitors pick **him or her**, drag the **age** slider, choose **how they're
related** (brother, mother, colleague, boss…), drag the **budget** slider and
can describe the person in **English, French or Moroccan Darija** (Latin
letters like `kaybghi lkora` or Arabic script). Jev (TypeSafe) then picks the
**top 3** gifts from your own products, plus more ideas below.

Everything else is a normal store: browse by category, search, filter
for him/for her, product pages, cart, and **cash-on-delivery** checkout. No
AI needed to shop.

- PHP 8.1+ and MySQL, runs on any Hostinger plan (no Node, no build step)
- Mobile first, with a bottom tab bar on phones
- French, Arabic (right-to-left) and English interface
- Admin panel: products and their tags, photos, categories, orders (call or
  WhatsApp the customer, statuses, Excel export), AI search history, settings

## Put it on Hostinger

1. **Create a database.** hPanel → Databases → MySQL Databases. Note the
   database name, user and password.
2. **Upload the files.** hPanel → Files → File Manager → `public_html`.
   Upload the *contents* of this `gift-store` folder (the zip is easiest:
   upload it, then right-click → Extract).
3. **Run the installer.** Open `https://your-domain.ma/install.php`, enter
   the database details, your admin email and password, and keep "Ajouter
   les produits de démonstration" ticked to try the store straight away.
   The installer locks itself once it's done.
4. **Log in** at `https://your-domain.ma/admin/`.
5. **Connect Jev.** Admin → Réglages → paste your TypeSafe API key → Tester
   Jev. The key stays on the server. Without a key, the advisor still works
   with its built-in rules.
6. Turn on **SSL** in hPanel (free) so the site opens with `https://`.

## Adding products

Admin → Produits → Nouveau produit. Besides the name, price and photos, the
**"Pour qui ?"** section is what the advisor uses:

| Field | Used as |
|---|---|
| Genre: Homme / Femme / Mixte | **Strict rule.** A "Femme" product is never suggested for a man. |
| Âge de … à … | **Strict rule.** Outside this range it's never suggested. |
| Lien (père/mère, frère/sœur, collègue…) | **Strict rule.** Leave "Convient à tout le monde" ticked for gifts that suit anyone. |
| Centres d'intérêt | Matched with what the visitor writes (football, café, lecture…). |
| Occasions | Birthday, wedding, Eid, new baby, graduation… |
| Mots-clés libres | Extra words Jev and the search can match. |

Delete the demo products once yours are in (or hide them with the switch).

## How the advisor chooses

1. **Hard filters (never broken):** gender, age, relationship, budget and
   stock. A man never gets a dress, a child never gets perfume, nothing over
   budget.
2. **Reading the description:** `inc/taxonomy.php` holds keywords in French,
   English, Darija (Latin and Arabic script) for every interest and occasion,
   and understands negatives such as *"ma kaybghich l3tr"* or *"n'aime pas la
   musique"* so disliked things are pushed down. The page shows what it
   understood as chips (Football ✓, ~~Parfums~~).
3. **Jev ranks the candidates:** one TypeSafe request
   (`POST https://api.typesafe.ai/v1/systemone`, model `jev-latest`) with a
   **Score** question per product (up to 24), rating how good a gift it is for
   this person given the whole description in any language. The final score
   is 78% Jev and 22% the tag match.
4. Identical searches are cached for 7 days (the cache resets whenever you
   edit the catalogue), and each visitor is limited to 20 searches per 10
   minutes, to keep Jev costs low.

Admin → Recherches AI lists what people asked for, including searches that
found nothing, which shows you which gifts to add.

## Files

```
index.php            home: gift advisor, categories, occasions, favourites
shop.php             catalogue (category, for him/her, occasion, search, sort)
product.php          product page
checkout.php         cash-on-delivery form
order.php            thank-you page
api/recommend.php    gift advisor endpoint
api/cart.php         current cart prices
admin/               admin panel
inc/finder.php       advisor logic and the Jev request
inc/taxonomy.php     relationships, interests, occasions + multilingual keywords, cities
inc/i18n.php         interface text (fr / ar / en)
assets/css/style.css design: colours and fonts are at the top (:root)
```

To change the look, edit the variables at the top of `assets/css/style.css`
(`--accent` is the terracotta colour, `--accent-2` the saffron). The store name
is in Admin → Réglages.

## Try it locally

```bash
php -S localhost:8000 -t gift-store
```

Open http://localhost:8000/install.php and pick "SQLite" as the database.
