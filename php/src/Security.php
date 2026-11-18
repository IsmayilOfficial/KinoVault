<?php
declare(strict_types=1);

namespace KinoVault;

final class Security
{
    public const MATURITY_ORDER = [
        'G' => 0,
        'PG' => 1,
        'PG-13' => 2,
        'R' => 3,
    ];

    public static function startHardenedSession(): void
    {
        if (session_status() === PHP_SESSION_ACTIVE) {
            return;
        }

        $isHttps = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
            || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');

        ini_set('session.use_strict_mode', '1');
        ini_set('session.use_only_cookies', '1');
        ini_set('session.cookie_httponly', '1');

        session_set_cookie_params([
            'lifetime' => 0,
            'path' => '/',
            'domain' => '',
            'secure' => $isHttps,
            'httponly' => true,
            'samesite' => 'Lax',
        ]);

        session_name('kv_sid');
        session_start();

        // Bind session lightly to user-agent family to deter stolen cookie replay
        $uaHash = hash('sha256', $_SERVER['HTTP_USER_AGENT'] ?? '');
        if (!isset($_SESSION['_ua_hash'])) {
            $_SESSION['_ua_hash'] = $uaHash;
        } elseif (!hash_equals($_SESSION['_ua_hash'], $uaHash)) {
            session_unset();
            session_destroy();
            session_start();
            $_SESSION['_ua_hash'] = $uaHash;
        }

        if (empty($_SESSION['_csrf_token'])) {
            $_SESSION['_csrf_token'] = bin2hex(random_bytes(32));
        }
    }

    public static function sendSecurityHeaders(): void
    {
        header('X-Content-Type-Options: nosniff');
        header('X-Frame-Options: SAMEORIGIN');
        header('Referrer-Policy: strict-origin-when-cross-origin');
        header('Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()');
        header(
            "Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; "
            . "img-src 'self' data:; media-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'self';"
        );
    }

    public static function csrfToken(): string
    {
        return $_SESSION['_csrf_token'] ?? '';
    }

    public static function verifyCsrf(?string $submitted): bool
    {
        $expected = $_SESSION['_csrf_token'] ?? '';
        if ($expected === '' || !is_string($submitted) || $submitted === '') {
            return false;
        }
        return hash_equals($expected, $submitted);
    }

    public static function hashPassword(string $plain): string
    {
        $algo = defined('PASSWORD_ARGON2ID') ? PASSWORD_ARGON2ID : PASSWORD_BCRYPT;
        return password_hash($plain, $algo);
    }

    public static function verifyPassword(string $plain, string $hash): bool
    {
        return password_verify($plain, $hash);
    }

    public static function validatePasswordStrength(string $password): ?string
    {
        $len = strlen($password);
        if ($len < 10) {
            return 'Password must be at least 10 characters.';
        }
        if ($len > 128) {
            return 'Password must be 128 characters or fewer.';
        }
        if (!preg_match('/[a-z]/', $password) || !preg_match('/[A-Z]/', $password) || !preg_match('/\d/', $password)) {
            return 'Password must include uppercase, lowercase, and numeric characters.';
        }
        return null;
    }

    public static function streamSecret(): string
    {
        $secret = getenv('STREAM_SIGNING_SECRET');
        if (is_string($secret) && strlen($secret) >= 32) {
            return $secret;
        }
        // Fallback: per-session CSPRNG signing key stored strictly server-side
        if (empty($_SESSION['_stream_hmac_key'])) {
            $_SESSION['_stream_hmac_key'] = bin2hex(random_bytes(32));
        }
        return $_SESSION['_stream_hmac_key'];
    }

    public static function createSignedStreamTicket(string $sessionId, string $profileId, string $mediaId, int $ttlSeconds = 120): string
    {
        $exp = time() + $ttlSeconds;
        $nonce = bin2hex(random_bytes(8));
        $ipFingerprint = self::clientIpHash();
        $payload = implode('.', [$sessionId, $profileId, $mediaId, (string)$exp, $nonce, $ipFingerprint]);
        $sig = hash_hmac('sha256', $payload, self::streamSecret());
        return "{$exp}.{$nonce}.{$sig}";
    }

    public static function verifySignedStreamTicket(string $ticket, string $sessionId, string $profileId, string $mediaId): bool
    {
        $parts = explode('.', $ticket);
        if (count($parts) !== 3) {
            return false;
        }
        [$expStr, $nonce, $sig] = $parts;
        if (!ctype_digit($expStr) || (int)$expStr < time()) {
            return false;
        }
        if (!preg_match('/^[a-f0-9]{16}$/', $nonce) || !preg_match('/^[a-f0-9]{64}$/', $sig)) {
            return false;
        }
        $ipFingerprint = self::clientIpHash();
        $payload = implode('.', [$sessionId, $profileId, $mediaId, $expStr, $nonce, $ipFingerprint]);
        $expectedSig = hash_hmac('sha256', $payload, self::streamSecret());
        return hash_equals($expectedSig, $sig);
    }

    public static function isRatingAllowed(string $itemRating, string $profileMaxRating): bool
    {
        $itemLevel = self::MATURITY_ORDER[$itemRating] ?? 99;
        $maxLevel = self::MATURITY_ORDER[$profileMaxRating] ?? 0;
        return $itemLevel <= $maxLevel;
    }

    public static function displayAgeRating(string $rating, string $mediaType): string
    {
        if ($mediaType === 'show') {
            return match ($rating) {
                'G' => 'TV-G',
                'PG' => 'TV-PG',
                'PG-13' => 'TV-14',
                'R' => 'TV-MA',
                default => $rating,
            };
        }
        return $rating;
    }

    public static function resolveSafeMediaPath(string $mediaRoot, string $filename): ?string
    {
        if ($filename === '' || str_contains($filename, "\0") || str_contains($filename, '/') || str_contains($filename, '\\') || str_contains($filename, '..')) {
            return null;
        }
        $realRoot = realpath($mediaRoot);
        $realFile = realpath($mediaRoot . DIRECTORY_SEPARATOR . basename($filename));
        if ($realRoot === false || $realFile === false) {
            return null;
        }
        if (!str_starts_with($realFile, $realRoot . DIRECTORY_SEPARATOR)) {
            return null;
        }
        return is_file($realFile) ? $realFile : null;
    }

    public static function clientIpHash(): string
    {
        $ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
        return substr(hash('sha256', $ip), 0, 16);
    }

    public static function e(string $value): string
    {
        return htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    }
}
