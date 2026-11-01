<?php
// POST /api/cart.php — current prices for the cart in the browser. Body: JSON [{id, qty}].
require dirname(__DIR__) . '/inc/bootstrap.php';
require ROOT . '/inc/orders.php';

$items = json_decode((string)file_get_contents('php://input'), true);
$cart = price_cart(is_array($items) ? array_slice($items, 0, 50) : []);
$delivery = $cart['lines'] ? delivery_fee($cart['subtotal']) : 0;
json_out($cart + ['delivery' => $delivery, 'total' => $cart['subtotal'] + $delivery]);
