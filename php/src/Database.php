<?php
declare(strict_types=1);

namespace KinoVault;

use PDO;
use PDOException;
use RuntimeException;

final class Database
{
    private static ?PDO $pdo = null;

    public static function connection(): PDO
    {
        if (self::$pdo !== null) {
            return self::$pdo;
        }

        $dsn = getenv('DB_DSN') ?: 'mysql:host=127.0.0.1;port=3306;dbname=kinovault;charset=utf8mb4';
        $user = getenv('DB_USER') ?: 'kinovault_app';
        $pass = getenv('DB_PASS') ?: '';

        try {
            self::$pdo = new PDO($dsn, $user, $pass, [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES => false, // Enforce real prepared statements
                PDO::MYSQL_ATTR_FOUND_ROWS => true,
            ]);
        } catch (PDOException $e) {
            error_log('Database connection failure: ' . $e->getMessage());
            throw new RuntimeException('Service temporarily unavailable.');
        }

        return self::$pdo;
    }

    public static function uuidV4(): string
    {
        $bytes = random_bytes(16);
        $bytes[6] = chr((ord($bytes[6]) & 0x0f) | 0x40);
        $bytes[8] = chr((ord($bytes[8]) & 0x3f) | 0x80);
        return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($bytes), 4));
    }
}
