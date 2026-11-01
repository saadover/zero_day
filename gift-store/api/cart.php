<?php
// The cart was replaced by the "Acheter" pop-up (see api/order.php).
http_response_code(410);
header('Content-Type: application/json');
echo '{"error":"gone"}';
