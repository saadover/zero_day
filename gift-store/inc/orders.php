<?php
// Cart pricing and order creation. Prices always come from the database,
// never from the browser.

const ORDER_STATUSES = ['new' => 'Nouvelle', 'confirmed' => 'Confirmée', 'shipped' => 'Expédiée', 'delivered' => 'Livrée', 'returned' => 'Retournée', 'cancelled' => 'Annulée'];

// $items: [['id' => int, 'qty' => int], ...] → priced lines, unknown/sold-out items dropped.
function price_cart(array $items): array
{
    $qty = [];
    foreach ($items as $it) {
        $id = (int)($it['id'] ?? 0);
        $n = max(0, min(20, (int)($it['qty'] ?? 0)));
        if ($id > 0 && $n > 0) $qty[$id] = min(20, ($qty[$id] ?? 0) + $n);
    }
    if (!$qty) return ['lines' => [], 'subtotal' => 0];
    $in = implode(',', array_fill(0, count($qty), '?'));
    $rows = hydrate_products(q("SELECT * FROM products WHERE active = 1 AND id IN ($in)", array_keys($qty))->fetchAll());
    $lines = [];
    $subtotal = 0;
    foreach ($rows as $p) {
        if (!in_stock($p)) continue;
        $n = $qty[(int)$p['id']];
        if ($p['stock'] !== null && $p['stock'] !== '') $n = min($n, (int)$p['stock']);
        $lines[] = ['id' => (int)$p['id'], 'name' => $p['name'], 'price' => (int)$p['price'], 'qty' => $n, 'image' => img_url($p['image']), 'url' => $p['url'], 'line' => $n * (int)$p['price']];
        $subtotal += $n * (int)$p['price'];
    }
    return ['lines' => $lines, 'subtotal' => $subtotal];
}

function delivery_fee(int $subtotal): int
{
    $free = (int)setting('free_delivery_from', '499');
    return ($free > 0 && $subtotal >= $free) ? 0 : (int)setting('delivery_fee', '35');
}

// Moroccan number as typed by the customer: exactly 10 digits starting with
// 05, 06 or 07 (spaces, dots and dashes are ignored). Returns null if invalid.
function normalize_phone(string $s): ?string
{
    $d = preg_replace('/[\s.\-]/', '', $s);
    return preg_match('/^0[5-7]\d{8}$/', $d) ? $d : null;
}

// Quick order from the "Acheter" pop-up: one product, name, phone and city.
function create_order(array $in): array
{
    $errors = [];
    $name = trim((string)($in['name'] ?? ''));
    $phone = normalize_phone((string)($in['phone'] ?? ''));
    $city = trim((string)($in['city'] ?? ''));
    if (mb_strlen($name) < 2) $errors['name'] = t('err_name');
    if (!$phone) $errors['phone'] = t('err_phone10');
    if (!in_array($city, cities(), true)) $errors['city'] = t('err_city');
    $cart = price_cart([['id' => (int)($in['id'] ?? 0), 'qty' => max(1, min(10, (int)($in['qty'] ?? 1)))]]);
    if (!$cart['lines']) $errors['product'] = t('err_cart');
    if ($errors) return ['errors' => $errors];

    $delivery = delivery_fee($cart['subtotal']);
    $total = $cart['subtotal'] + $delivery;

    $pdo = db();
    $pdo->beginTransaction();
    try {
        do {
            $ref = 'HD' . strtoupper(substr(bin2hex(random_bytes(4)), 0, 6));
        } while (q('SELECT 1 FROM orders WHERE ref = ?', [$ref])->fetchColumn());
        q('INSERT INTO orders (ref, token, name, phone, city, address, note, gift_wrap, gift_message, subtotal, delivery, wrap_fee, total, status, ip, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [
            $ref, bin2hex(random_bytes(12)), mb_substr($name, 0, 120), $phone, $city, '', '', 0, '',
            $cart['subtotal'], $delivery, 0, $total, 'new', client_ip(), time(),
        ]);
        $orderId = (int)$pdo->lastInsertId();
        foreach ($cart['lines'] as $l) {
            q('INSERT INTO order_items (order_id, product_id, name, price, qty) VALUES (?,?,?,?,?)', [$orderId, $l['id'], $l['name'], $l['price'], $l['qty']]);
            q('UPDATE products SET stock = stock - ? WHERE id = ? AND stock IS NOT NULL', [$l['qty'], $l['id']]);
        }
        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }
    notify_new_order($ref, $name, $phone, $city, $total, $cart['lines']);
    return ['ref' => $ref, 'total' => $total, 'phone' => $phone];
}

function notify_new_order(string $ref, string $name, string $phone, string $city, int $total, array $lines): void
{
    $to = setting('store_email');
    if (!$to || !function_exists('mail')) return;
    $body = "Nouvelle commande $ref\n\n$name — $phone — $city\nTotal : $total DH (paiement à la livraison)\n\n";
    foreach ($lines as $l) $body .= "• {$l['qty']} × {$l['name']} ({$l['price']} DH)\n";
    $host = preg_replace('/[^a-z0-9.\-]/i', '', $_SERVER['HTTP_HOST'] ?? 'localhost');
    @mail($to, '=?UTF-8?B?' . base64_encode('Nouvelle commande ' . $ref) . '?=', $body, "Content-Type: text/plain; charset=UTF-8\r\nFrom: " . store_name() . " <no-reply@$host>");
}
