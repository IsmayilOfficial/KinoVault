<?php
declare(strict_types=1);

namespace KinoVault;

use PDO;

final class AuthController
{
    private const DUMMY_HASH = '$argon2id$v=19$m=65536,t=4,p=1$bG9jYWxkdW1teXNhbHQ$8P6V5T5v5iN0kK9v5N5Z5a5b5c5d5e5f5g5h5i5j5k';

    public static function register(string $email, string $displayName, string $password): array
    {
        $email = strtolower(trim($email));
        $displayName = trim(strip_tags($displayName));

        if (!filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($email) > 160) {
            return ['ok' => false, 'status' => 400, 'error' => 'Please enter a valid email address.'];
        }
        if (mb_strlen($displayName) < 2 || mb_strlen($displayName) > 40) {
            return ['ok' => false, 'status' => 400, 'error' => 'Display name must be 2–40 characters.'];
        }
        if ($pwdErr = Security::validatePasswordStrength($password)) {
            return ['ok' => false, 'status' => 400, 'error' => $pwdErr];
        }

        $pdo = Database::connection();
        $stmt = $pdo->prepare('SELECT id FROM users WHERE email = :email LIMIT 1');
        $stmt->execute([':email' => $email]);
        if ($stmt->fetch()) {
            return ['ok' => false, 'status' => 409, 'error' => 'An account with this email already exists.'];
        }

        $userId = Database::uuidV4();
        $profileId = Database::uuidV4();
        $kidsId = Database::uuidV4();
        $hash = Security::hashPassword($password);

        $pdo->beginTransaction();
        try {
            $pdo->prepare(
                'INSERT INTO users (id, email, display_name, password_hash) VALUES (:id, :email, :name, :hash)'
            )->execute([
                ':id' => $userId,
                ':email' => $email,
                ':name' => $displayName,
                ':hash' => $hash,
            ]);

            $firstName = explode(' ', $displayName)[0] ?: 'Owner';
            $pdo->prepare(
                'INSERT INTO user_profiles (id, user_id, name, avatar_key, is_kids, max_rating, is_primary)
                 VALUES (:id, :uid, :name, :avatar, 0, :rating, 1)'
            )->execute([
                ':id' => $profileId,
                ':uid' => $userId,
                ':name' => mb_substr($firstName, 0, 24),
                ':avatar' => 'crimson',
                ':rating' => 'R',
            ]);

            $pdo->prepare(
                'INSERT INTO user_profiles (id, user_id, name, avatar_key, is_kids, max_rating, is_primary)
                 VALUES (:id, :uid, :name, :avatar, 1, :rating, 0)'
            )->execute([
                ':id' => $kidsId,
                ':uid' => $userId,
                ':name' => 'Kids',
                ':avatar' => 'amber',
                ':rating' => 'PG',
            ]);

            self::audit($pdo, $userId, 'ACCOUNT_REGISTERED', "Account created for {$email}");
            $pdo->commit();
        } catch (\Throwable $e) {
            $pdo->rollBack();
            throw $e;
        }

        session_regenerate_id(true);
        $_SESSION['user_id'] = $userId;
        $_SESSION['active_profile_id'] = $profileId;

        return ['ok' => true, 'status' => 201, 'user_id' => $userId];
    }

    public static function login(string $email, string $password): array
    {
        $email = strtolower(trim($email));
        if (!filter_var($email, FILTER_VALIDATE_EMAIL) || $password === '' || strlen($password) > 128) {
            return ['ok' => false, 'status' => 400, 'error' => 'Valid email and password are required.'];
        }

        $pdo = Database::connection();
        $stmt = $pdo->prepare('SELECT id, password_hash FROM users WHERE email = :email LIMIT 1');
        $stmt->execute([':email' => $email]);
        $user = $stmt->fetch();

        // Constant-time timing normalization even if email is unknown
        $hash = $user['password_hash'] ?? self::DUMMY_HASH;
        $valid = Security::verifyPassword($password, $hash);

        if (!$user || !$valid) {
            if ($user) {
                self::audit($pdo, $user['id'], 'LOGIN_FAILED', 'Incorrect password attempt.');
            }
            return ['ok' => false, 'status' => 401, 'error' => 'Invalid email or password.'];
        }

        // Prevent session fixation
        session_regenerate_id(true);
        $_SESSION['user_id'] = $user['id'];
        $_SESSION['active_profile_id'] = null;
        $_SESSION['unlocked_profiles'] = [];

        self::audit($pdo, $user['id'], 'SIGN_IN', 'User authenticated.');
        return ['ok' => true, 'status' => 200];
    }

    public static function logout(): void
    {
        if (!empty($_SESSION['user_id'])) {
            self::audit(Database::connection(), $_SESSION['user_id'], 'SIGN_OUT', 'Session destroyed.');
        }
        $_SESSION = [];
        if (ini_get('session.use_cookies')) {
            $params = session_get_cookie_params();
            setcookie(
                session_name(),
                '',
                time() - 42000,
                $params['path'],
                $params['domain'],
                (bool)$params['secure'],
                (bool)$params['httponly']
            );
        }
        session_destroy();
    }

    public static function requestPasswordReset(string $email, callable $mailerCallback): array
    {
        $email = strtolower(trim($email));
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            return ['ok' => false, 'status' => 400, 'error' => 'Valid email required.'];
        }

        $pdo = Database::connection();
        $stmt = $pdo->prepare('SELECT id, email FROM users WHERE email = :email LIMIT 1');
        $stmt->execute([':email' => $email]);
        $user = $stmt->fetch();

        if ($user) {
            $rawToken = bin2hex(random_bytes(24));
            $tokenHash = hash('sha256', $rawToken);
            $expiresAt = gmdate('Y-m-d H:i:s', time() + 900); // 15 minutes

            $pdo->prepare('DELETE FROM password_resets WHERE user_id = :uid AND used_at IS NULL')
                ->execute([':uid' => $user['id']]);

            $pdo->prepare(
                'INSERT INTO password_resets (id, user_id, token_hash, expires_at)
                 VALUES (:id, :uid, :thash, :exp)'
            )->execute([
                ':id' => Database::uuidV4(),
                ':uid' => $user['id'],
                ':thash' => $tokenHash,
                ':exp' => $expiresAt,
            ]);

            self::audit($pdo, $user['id'], 'PASSWORD_RESET_REQUESTED', 'Reset token issued (15m TTL).');
            // Dispatch out-of-band via SMTP mailer; never return raw token in HTTP response
            $mailerCallback($user['email'], $rawToken);
        }

        return [
            'ok' => true,
            'status' => 200,
            'message' => 'If an account matches that email, a reset link has been sent.',
        ];
    }

    public static function completePasswordReset(string $rawToken, string $newPassword): array
    {
        if (!preg_match('/^[a-f0-9]{48}$/i', $rawToken)) {
            return ['ok' => false, 'status' => 400, 'error' => 'Invalid reset token format.'];
        }
        if ($pwdErr = Security::validatePasswordStrength($newPassword)) {
            return ['ok' => false, 'status' => 400, 'error' => $pwdErr];
        }

        $pdo = Database::connection();
        $tokenHash = hash('sha256', $rawToken);
        $stmt = $pdo->prepare(
            'SELECT id, user_id FROM password_resets
             WHERE token_hash = :thash AND used_at IS NULL AND expires_at > UTC_TIMESTAMP()
             LIMIT 1'
        );
        $stmt->execute([':thash' => $tokenHash]);
        $reset = $stmt->fetch();

        if (!$reset) {
            return ['ok' => false, 'status' => 400, 'error' => 'Reset token is invalid or expired.'];
        }

        $newHash = Security::hashPassword($newPassword);
        $pdo->beginTransaction();
        try {
            $pdo->prepare('UPDATE users SET password_hash = :hash WHERE id = :uid')
                ->execute([':hash' => $newHash, ':uid' => $reset['user_id']]);
            $pdo->prepare('UPDATE password_resets SET used_at = UTC_TIMESTAMP() WHERE id = :id')
                ->execute([':id' => $reset['id']]);
            self::audit($pdo, $reset['user_id'], 'PASSWORD_RESET_COMPLETED', 'Password changed via reset token.');
            $pdo->commit();
        } catch (\Throwable $e) {
            $pdo->rollBack();
            throw $e;
        }

        return ['ok' => true, 'status' => 200];
    }

    private static function audit(PDO $pdo, string $userId, string $event, string $detail): void
    {
        $pdo->prepare(
            'INSERT INTO security_audit_log (id, user_id, event_name, detail, ip_hash)
             VALUES (:id, :uid, :ev, :dt, :ip)'
        )->execute([
            ':id' => Database::uuidV4(),
            ':uid' => $userId,
            ':ev' => $event,
            ':dt' => mb_substr($detail, 0, 255),
            ':ip' => Security::clientIpHash(),
        ]);
    }
}
