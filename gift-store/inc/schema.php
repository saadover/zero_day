<?php
// Database tables. Works on MySQL/MariaDB (Hostinger) and SQLite (local tests).

function schema_sql(string $driver): array
{
    $id = $driver === 'sqlite' ? 'INTEGER PRIMARY KEY AUTOINCREMENT' : 'INT UNSIGNED AUTO_INCREMENT PRIMARY KEY';
    $tail = $driver === 'sqlite' ? '' : ' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci';
    $int = $driver === 'sqlite' ? 'INTEGER' : 'INT';
    $ref = $driver === 'sqlite' ? 'INTEGER' : 'INT UNSIGNED';

    return [
        "CREATE TABLE IF NOT EXISTS settings (k VARCHAR(64) PRIMARY KEY, v TEXT)$tail",
        "CREATE TABLE IF NOT EXISTS admins (id $id, email VARCHAR(190) NOT NULL UNIQUE, password_hash VARCHAR(255) NOT NULL, created_at $int NOT NULL)$tail",
        "CREATE TABLE IF NOT EXISTS categories (id $id, name VARCHAR(120) NOT NULL, slug VARCHAR(140) NOT NULL UNIQUE, sort $int NOT NULL DEFAULT 0)$tail",
        "CREATE TABLE IF NOT EXISTS products (
            id $id,
            name VARCHAR(200) NOT NULL,
            slug VARCHAR(220) NOT NULL UNIQUE,
            description TEXT,
            price $int NOT NULL,
            compare_price $int NULL,
            stock $int NULL,
            category_id $ref NULL,
            gender VARCHAR(10) NOT NULL DEFAULT 'unisex',
            age_min $int NOT NULL DEFAULT 0,
            age_max $int NOT NULL DEFAULT 99,
            relations VARCHAR(255) NOT NULL DEFAULT '',
            interests VARCHAR(500) NOT NULL DEFAULT '',
            occasions VARCHAR(255) NOT NULL DEFAULT '',
            tags VARCHAR(500) NOT NULL DEFAULT '',
            featured $int NOT NULL DEFAULT 0,
            active $int NOT NULL DEFAULT 1,
            created_at $int NOT NULL,
            updated_at $int NOT NULL
        )$tail",
        "CREATE INDEX idx_products_finder ON products (active, gender, price)",
        "CREATE TABLE IF NOT EXISTS product_images (id $id, product_id $ref NOT NULL, path VARCHAR(255) NOT NULL, sort $int NOT NULL DEFAULT 0)$tail",
        "CREATE INDEX idx_images_product ON product_images (product_id)",
        "CREATE TABLE IF NOT EXISTS orders (
            id $id,
            ref VARCHAR(20) NOT NULL UNIQUE,
            token VARCHAR(40) NOT NULL,
            name VARCHAR(120) NOT NULL,
            phone VARCHAR(30) NOT NULL,
            city VARCHAR(80) NOT NULL,
            address TEXT NOT NULL,
            note TEXT,
            gift_wrap $int NOT NULL DEFAULT 0,
            gift_message TEXT,
            subtotal $int NOT NULL,
            delivery $int NOT NULL,
            wrap_fee $int NOT NULL DEFAULT 0,
            total $int NOT NULL,
            status VARCHAR(20) NOT NULL DEFAULT 'new',
            admin_note TEXT,
            ip VARCHAR(45),
            created_at $int NOT NULL
        )$tail",
        "CREATE TABLE IF NOT EXISTS order_items (id $id, order_id $ref NOT NULL, product_id $ref NULL, name VARCHAR(200) NOT NULL, price $int NOT NULL, qty $int NOT NULL)$tail",
        "CREATE INDEX idx_items_order ON order_items (order_id)",
        "CREATE TABLE IF NOT EXISTS finder_cache (hash CHAR(40) PRIMARY KEY, response MEDIUMTEXT NOT NULL, created_at $int NOT NULL)$tail",
        "CREATE TABLE IF NOT EXISTS finder_log (
            id $id, ip VARCHAR(45), gender VARCHAR(10), age $int, relation VARCHAR(20),
            budget_min $int, budget_max $int, note TEXT, source VARCHAR(10), results VARCHAR(255), created_at $int NOT NULL
        )$tail",
        "CREATE INDEX idx_finder_log_ip ON finder_log (ip, created_at)",
    ];
}

function install_schema(PDO $pdo, string $driver): void
{
    foreach (schema_sql($driver) as $sql) {
        try {
            $pdo->exec($sql);
        } catch (PDOException $e) {
            // CREATE INDEX has no IF NOT EXISTS on MySQL: ignore "already exists".
            if (!str_starts_with($sql, 'CREATE INDEX')) throw $e;
        }
    }
}

function default_settings(): array
{
    return [
        'store_name' => 'Hdiya',
        'store_phone' => '',
        'whatsapp' => '',
        'store_email' => '',
        'delivery_fee' => '35',
        'free_delivery_from' => '499',
        'wrap_fee' => '25',
        'budget_min' => '50',
        'budget_max' => '5000',
        'catalog_version' => '1',
        'jev_api_key' => '',
        'instagram' => '',
    ];
}
