<?php
declare(strict_types=1);

namespace KinoVault;

final class ProfileController
{
    private const ALLOWED_AVATARS = ['crimson', 'obsidian', 'cobalt', 'amber', 'emerald', 'silver'];

    public static function getActiveProfile(string $userId, string $profileId): ?array
    {
        $pdo = Database::connection();
        $stmt = $pdo->prepare(
            'SELECT id, user_id, name, avatar_key, is_kids, max_rating, (pin_hash IS NOT NULL) AS has_pin, is_primary
             FROM user_profiles
             WHERE id = :pid AND user_id = :uid
             LIMIT 1'
        );
        $stmt->execute([':pid' => $profileId, ':uid' => $userId]);
        $row = $stmt->fetch();
        return $row ?: null;
    }

    public static function selectProfile(string $userId, string $profileId, ?string $pin = null): array
    {
        $pdo = Database::connection();
        $stmt = $pdo->prepare(
            'SELECT id, name, pin_hash, failed_pin_attempts, pin_locked_until
             FROM user_profiles
             WHERE id = :pid AND user_id = :uid
             LIMIT 1'
        );
        $stmt->execute([':pid' => $profileId, ':uid' => $userId]);
        $profile = $stmt->fetch();

        if (!$profile) {
            return ['ok' => false, 'status' => 404, 'error' => 'Profile not found.'];
        }

        $unlocked = $_SESSION['unlocked_profiles'] ?? [];
        if ($profile['pin_hash'] !== null && !in_array($profileId, $unlocked, true)) {
            if ($profile['pin_locked_until'] !== null && strtotime($profile['pin_locked_until']) > time()) {
                return ['ok' => false, 'status' => 429, 'error' => 'PIN locked due to failed attempts. Try again later.'];
            }
            if (!is_string($pin) || !preg_match('/^\d{4,6}$/', $pin)) {
                return ['ok' => false, 'status' => 403, 'error' => '4–6 digit profile PIN required.', 'pin_required' => true];
            }
            if (!Security::verifyPassword($pin, $profile['pin_hash'])) {
                $attempts = (int)$profile['failed_pin_attempts'] + 1;
                if ($attempts >= 5) {
                    $pdo->prepare(
                        'UPDATE user_profiles SET failed_pin_attempts = 0, pin_locked_until = DATE_ADD(UTC_TIMESTAMP(), INTERVAL 5 MINUTE) WHERE id = :pid'
                    )->execute([':pid' => $profileId]);
                    return ['ok' => false, 'status' => 429, 'error' => 'Too many failed PIN attempts. Locked for 5 minutes.'];
                }
                $pdo->prepare('UPDATE user_profiles SET failed_pin_attempts = :a WHERE id = :pid')
                    ->execute([':a' => $attempts, ':pid' => $profileId]);
                return ['ok' => false, 'status' => 403, 'error' => 'Incorrect PIN.', 'pin_required' => true];
            }

            $pdo->prepare('UPDATE user_profiles SET failed_pin_attempts = 0, pin_locked_until = NULL WHERE id = :pid')
                ->execute([':pid' => $profileId]);
            $_SESSION['unlocked_profiles'][] = $profileId;
        }

        $_SESSION['active_profile_id'] = $profileId;
        return ['ok' => true, 'status' => 200];
    }

    public static function updateBasicInfo(string $userId, string $profileId, string $name, string $avatarKey, ?string $displayName = null): array
    {
        $cleanName = trim(strip_tags($name));
        if (mb_strlen($cleanName) < 1 || mb_strlen($cleanName) > 24) {
            return ['ok' => false, 'status' => 400, 'error' => 'Profile name must be 1–24 characters.'];
        }
        if (!in_array($avatarKey, self::ALLOWED_AVATARS, true)) {
            $avatarKey = 'silver';
        }

        $pdo = Database::connection();
        $profile = self::getActiveProfile($userId, $profileId);
        if (!$profile) {
            return ['ok' => false, 'status' => 404, 'error' => 'Profile not found.'];
        }

        $pdo->prepare(
            'UPDATE user_profiles SET name = :name, avatar_key = :avatar WHERE id = :pid AND user_id = :uid'
        )->execute([
            ':name' => $cleanName,
            ':avatar' => $avatarKey,
            ':pid' => $profileId,
            ':uid' => $userId,
        ]);

        if ($displayName !== null && (int)$profile['is_primary'] === 1) {
            $cleanHousehold = trim(strip_tags($displayName));
            if (mb_strlen($cleanHousehold) >= 2 && mb_strlen($cleanHousehold) <= 40) {
                $pdo->prepare('UPDATE users SET display_name = :dn WHERE id = :uid')
                    ->execute([':dn' => $cleanHousehold, ':uid' => $userId]);
            }
        }

        return ['ok' => true, 'status' => 200];
    }

    public static function getWatchHistory(string $profileId, string $maxRating): array
    {
        $pdo = Database::connection();
        $allowedRatings = array_keys(array_filter(
            Security::MATURITY_ORDER,
            static fn(int $lvl): bool => $lvl <= (Security::MATURITY_ORDER[$maxRating] ?? 0)
        ));
        $placeholders = implode(',', array_fill(0, count($allowedRatings), '?'));

        $sql = "SELECT m.id, m.title, m.media_type, m.release_year, m.maturity_rating, m.backdrop_url,
                       h.last_position_seconds, h.duration_seconds, h.completed, h.watched_at
                FROM watch_history h
                INNER JOIN media_items m ON m.id = h.media_id
                WHERE h.profile_id = ? AND m.maturity_rating IN ({$placeholders})
                ORDER BY h.watched_at DESC
                LIMIT 50";

        $stmt = $pdo->prepare($sql);
        $stmt->execute(array_merge([$profileId], $allowedRatings));
        return $stmt->fetchAll();
    }

    public static function clearWatchHistory(string $profileId, ?string $mediaId = null): void
    {
        $pdo = Database::connection();
        if ($mediaId !== null) {
            $pdo->prepare('DELETE FROM watch_history WHERE profile_id = :pid AND media_id = :mid')
                ->execute([':pid' => $profileId, ':mid' => $mediaId]);
            return;
        }
        $pdo->prepare('DELETE FROM watch_history WHERE profile_id = :pid')
            ->execute([':pid' => $profileId]);
    }
}
