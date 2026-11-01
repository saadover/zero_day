-- Hdiya gift store: empty tables for MySQL / MariaDB.
-- Optional: install.php creates these tables by itself.

CREATE TABLE IF NOT EXISTS settings (k VARCHAR(64) PRIMARY KEY, v TEXT) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS admins (id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, email VARCHAR(190) NOT NULL UNIQUE, password_hash VARCHAR(255) NOT NULL, created_at INT NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS categories (id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, name VARCHAR(120) NOT NULL, slug VARCHAR(140) NOT NULL UNIQUE, sort INT NOT NULL DEFAULT 0) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS products (
            id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(200) NOT NULL,
            slug VARCHAR(220) NOT NULL UNIQUE,
            description TEXT,
            price INT NOT NULL,
            compare_price INT NULL,
            stock INT NULL,
            category_id INT UNSIGNED NULL,
            gender VARCHAR(10) NOT NULL DEFAULT 'unisex',
            age_min INT NOT NULL DEFAULT 0,
            age_max INT NOT NULL DEFAULT 99,
            relations VARCHAR(255) NOT NULL DEFAULT '',
            interests VARCHAR(500) NOT NULL DEFAULT '',
            occasions VARCHAR(255) NOT NULL DEFAULT '',
            tags VARCHAR(500) NOT NULL DEFAULT '',
            featured INT NOT NULL DEFAULT 0,
            active INT NOT NULL DEFAULT 1,
            created_at INT NOT NULL,
            updated_at INT NOT NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_products_finder ON products (active, gender, price);

CREATE TABLE IF NOT EXISTS product_images (id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, product_id INT UNSIGNED NOT NULL, path VARCHAR(255) NOT NULL, sort INT NOT NULL DEFAULT 0) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_images_product ON product_images (product_id);

CREATE TABLE IF NOT EXISTS orders (
            id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            ref VARCHAR(20) NOT NULL UNIQUE,
            token VARCHAR(40) NOT NULL,
            name VARCHAR(120) NOT NULL,
            phone VARCHAR(30) NOT NULL,
            city VARCHAR(80) NOT NULL,
            address TEXT NOT NULL,
            note TEXT,
            gift_wrap INT NOT NULL DEFAULT 0,
            gift_message TEXT,
            subtotal INT NOT NULL,
            delivery INT NOT NULL,
            wrap_fee INT NOT NULL DEFAULT 0,
            total INT NOT NULL,
            status VARCHAR(20) NOT NULL DEFAULT 'new',
            admin_note TEXT,
            ip VARCHAR(45),
            created_at INT NOT NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS order_items (id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, order_id INT UNSIGNED NOT NULL, product_id INT UNSIGNED NULL, name VARCHAR(200) NOT NULL, price INT NOT NULL, qty INT NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_items_order ON order_items (order_id);

CREATE TABLE IF NOT EXISTS finder_cache (hash CHAR(40) PRIMARY KEY, response MEDIUMTEXT NOT NULL, created_at INT NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS finder_log (
            id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, ip VARCHAR(45), gender VARCHAR(10), age INT, relation VARCHAR(20),
            budget_min INT, budget_max INT, note TEXT, source VARCHAR(10), results VARCHAR(255), created_at INT NOT NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_finder_log_ip ON finder_log (ip, created_at);

