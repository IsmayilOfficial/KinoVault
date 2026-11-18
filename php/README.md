# KinoVault — PHP 8.2+ Home Cinema Reference Implementation

This directory contains a complete, production-structured **PHP 8.2+ / MySQL 8** implementation of the KinoVault home cinema platform.

## Architecture
- `schema.sql` — MySQL 8 / MariaDB relational schema with `FULLTEXT` search index (`ft_media_search`), `users`, `user_profiles`, `password_resets`, `watch_history`, `watchlist`, and `security_audit_log`.
- `src/Database.php` — Hardened PDO connection (`ATTR_EMULATE_PREPARES => false`, `utf8mb4`).
- `src/Security.php` — Argon2id password hashing, hardened `HttpOnly`/`Secure`/`SameSite` sessions, CSRF synchronizer tokens, HMAC-SHA256 signed 120s stream tickets bound to IP & session, and `realpath()` canonical path traversal checks.
- `src/AuthController.php` — User registration, login with `session_regenerate_id(true)` and timing-normalized checks, logout, and hashed token password reset.
- `src/ProfileController.php` — Profile switching with 5-attempt PIN lockout, profile updates, and chronological watch history management.
- `src/CatalogController.php` — Indexed `FULLTEXT` boolean relevance search across titles, directors, cast, and synopses, with genre & movie/show filtering and server-side maturity rating gating.
- `src/StreamController.php` — Authenticated HTTP `206 Partial Content` range streaming (`session_write_close()` before streaming) and an AES-128 HLS key delivery endpoint illustrating basic DRM key protection.
- `public/index.php` — Front controller and streaming player template (`controlslist="nodownload"`, `disablepictureinpicture`, forensic session watermark).

## Running on a PHP 8.2+ Server
```bash
mysql -u root -p < php/schema.sql
export DB_DSN="mysql:host=127.0.0.1;port=3306;dbname=kinovault;charset=utf8mb4"
export DB_USER="kinovault_app"
export DB_PASS="your-strong-password"
export STREAM_SIGNING_SECRET="$(openssl rand -hex 32)"
php -S 127.0.0.1:8080 -t php/public
```
