<?php
declare(strict_types=1);

namespace KinoVault;

final class CatalogController
{
    private static function allowedRatings(string $maxRating): array
    {
        return array_keys(array_filter(
            Security::MATURITY_ORDER,
            static fn(int $lvl): bool => $lvl <= (Security::MATURITY_ORDER[$maxRating] ?? 0)
        ));
    }

    public static function searchAndBrowse(
        string $maxRating,
        string $genre = 'All Titles',
        string $mediaType = 'all',
        string $query = '',
        ?string $profileId = null
    ): array {
        $pdo = Database::connection();
        $allowedRatings = self::allowedRatings($maxRating);
        $ratingPlaceholders = implode(',', array_fill(0, count($allowedRatings), '?'));

        $selectParams = [];
        $joinParams = [];
        $whereParams = $allowedRatings;

        $where = [
            'm.is_upcoming = 0',
            "m.maturity_rating IN ({$ratingPlaceholders})",
        ];
        $joins = [];
        $selectScore = 'm.is_featured AS relevance_score';

        $watchlistSelect = '0 AS in_watchlist';
        $favoriteSelect = '0 AS is_favorite';
        if ($profileId !== null && $profileId !== '') {
            $watchlistSelect = 'CASE WHEN w.media_id IS NOT NULL THEN 1 ELSE 0 END AS in_watchlist';
            $favoriteSelect = 'CASE WHEN f.media_id IS NOT NULL THEN 1 ELSE 0 END AS is_favorite';
            $joins[] = 'LEFT JOIN watchlist w ON w.media_id = m.id AND w.profile_id = ?';
            $joinParams[] = $profileId;
            $joins[] = 'LEFT JOIN favorites f ON f.media_id = m.id AND f.profile_id = ?';
            $joinParams[] = $profileId;
        }

        if ($mediaType === 'movie' || $mediaType === 'show') {
            $where[] = 'm.media_type = ?';
            $whereParams[] = $mediaType;
        }

        if ($genre !== '' && $genre !== 'All Titles') {
            $joins[] = 'INNER JOIN media_genres mg ON mg.media_id = m.id INNER JOIN genres g ON g.id = mg.genre_id';
            $where[] = 'g.name = ?';
            $whereParams[] = $genre;
        }

        $cleanQuery = trim($query);
        if ($cleanQuery !== '') {
            // Efficient FULLTEXT boolean/natural relevance search across indexed CMS columns
            $booleanTerms = implode(' ', array_map(
                static fn(string $t): string => '+' . preg_replace('/[^\p{L}\p{N}_-]/u', '', $t) . '*',
                array_filter(preg_split('/\s+/', mb_substr($cleanQuery, 0, 80)) ?: [])
            ));

            if ($booleanTerms !== '') {
                $selectScore = 'MATCH(m.title, m.director, m.cast_list, m.synopsis) AGAINST(? IN BOOLEAN MODE) AS relevance_score';
                $selectParams[] = $booleanTerms;
                $where[] = 'MATCH(m.title, m.director, m.cast_list, m.synopsis) AGAINST(? IN BOOLEAN MODE)';
                $whereParams[] = $booleanTerms;
            }
        }

        $joinSql = implode(' ', $joins);
        $whereSql = implode(' AND ', $where);
        $params = array_merge($selectParams, $joinParams, $whereParams);

        $sql = "SELECT m.id, m.media_type, m.seasons_label, m.title, m.tagline, m.synopsis,
                       m.director, m.cast_list, m.release_year, m.duration_label, m.duration_seconds,
                       m.maturity_rating, m.quality, m.audio_format, m.audio_tracks_json, m.subtitle_tracks_json,
                       m.backdrop_url, m.is_featured, m.trending_rank, m.view_count, m.popularity_score,
                       m.is_upcoming, m.release_date_label,
                       {$watchlistSelect}, {$favoriteSelect}, {$selectScore}
                FROM media_items m
                {$joinSql}
                WHERE {$whereSql}
                ORDER BY relevance_score DESC, m.release_year DESC
                LIMIT 60";

        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        return $stmt->fetchAll();
    }

    public static function getPopular(string $maxRating, ?string $profileId = null): array
    {
        $pdo = Database::connection();
        $allowedRatings = self::allowedRatings($maxRating);
        $ratingPlaceholders = implode(',', array_fill(0, count($allowedRatings), '?'));

        $joins = '';
        $params = [];
        $watchlistSelect = '0 AS in_watchlist';
        $favoriteSelect = '0 AS is_favorite';

        if ($profileId !== null && $profileId !== '') {
            $watchlistSelect = 'CASE WHEN w.media_id IS NOT NULL THEN 1 ELSE 0 END AS in_watchlist';
            $favoriteSelect = 'CASE WHEN f.media_id IS NOT NULL THEN 1 ELSE 0 END AS is_favorite';
            $joins = 'LEFT JOIN watchlist w ON w.media_id = m.id AND w.profile_id = ?
                      LEFT JOIN favorites f ON f.media_id = m.id AND f.profile_id = ?';
            $params[] = $profileId;
            $params[] = $profileId;
        }

        $params = array_merge($params, $allowedRatings);

        $sql = "SELECT m.id, m.media_type, m.seasons_label, m.title, m.tagline, m.synopsis,
                       m.director, m.cast_list, m.release_year, m.duration_label, m.duration_seconds,
                       m.maturity_rating, m.quality, m.audio_format, m.audio_tracks_json, m.subtitle_tracks_json,
                       m.backdrop_url, m.is_featured, m.trending_rank, m.view_count, m.popularity_score,
                       m.is_upcoming, m.release_date_label,
                       {$watchlistSelect}, {$favoriteSelect}
                FROM media_items m
                {$joins}
                WHERE m.is_upcoming = 0
                  AND m.maturity_rating IN ({$ratingPlaceholders})
                  AND (m.popularity_score >= 85 OR m.view_count >= 100000)
                ORDER BY m.popularity_score DESC, m.view_count DESC
                LIMIT 20";

        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        return $stmt->fetchAll();
    }

    public static function getTrending(string $maxRating, ?string $profileId = null): array
    {
        $pdo = Database::connection();
        $allowedRatings = self::allowedRatings($maxRating);
        $ratingPlaceholders = implode(',', array_fill(0, count($allowedRatings), '?'));

        $joins = '';
        $params = [];
        $watchlistSelect = '0 AS in_watchlist';
        $favoriteSelect = '0 AS is_favorite';

        if ($profileId !== null && $profileId !== '') {
            $watchlistSelect = 'CASE WHEN w.media_id IS NOT NULL THEN 1 ELSE 0 END AS in_watchlist';
            $favoriteSelect = 'CASE WHEN f.media_id IS NOT NULL THEN 1 ELSE 0 END AS is_favorite';
            $joins = 'LEFT JOIN watchlist w ON w.media_id = m.id AND w.profile_id = ?
                      LEFT JOIN favorites f ON f.media_id = m.id AND f.profile_id = ?';
            $params[] = $profileId;
            $params[] = $profileId;
        }

        $params = array_merge($params, $allowedRatings);

        $sql = "SELECT m.id, m.media_type, m.seasons_label, m.title, m.tagline, m.synopsis,
                       m.director, m.cast_list, m.release_year, m.duration_label, m.duration_seconds,
                       m.maturity_rating, m.quality, m.audio_format, m.audio_tracks_json, m.subtitle_tracks_json,
                       m.backdrop_url, m.is_featured, m.trending_rank, m.view_count, m.popularity_score,
                       m.is_upcoming, m.release_date_label,
                       {$watchlistSelect}, {$favoriteSelect}
                FROM media_items m
                {$joins}
                WHERE m.is_upcoming = 0
                  AND m.trending_rank IS NOT NULL
                  AND m.maturity_rating IN ({$ratingPlaceholders})
                ORDER BY m.trending_rank ASC
                LIMIT 20";

        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        return $stmt->fetchAll();
    }

    public static function getUpcoming(string $maxRating, ?string $profileId = null): array
    {
        $pdo = Database::connection();
        $allowedRatings = self::allowedRatings($maxRating);
        $ratingPlaceholders = implode(',', array_fill(0, count($allowedRatings), '?'));

        $joins = '';
        $params = [];
        $watchlistSelect = '0 AS in_watchlist';
        $favoriteSelect = '0 AS is_favorite';

        if ($profileId !== null && $profileId !== '') {
            $watchlistSelect = 'CASE WHEN w.media_id IS NOT NULL THEN 1 ELSE 0 END AS in_watchlist';
            $favoriteSelect = 'CASE WHEN f.media_id IS NOT NULL THEN 1 ELSE 0 END AS is_favorite';
            $joins = 'LEFT JOIN watchlist w ON w.media_id = m.id AND w.profile_id = ?
                      LEFT JOIN favorites f ON f.media_id = m.id AND f.profile_id = ?';
            $params[] = $profileId;
            $params[] = $profileId;
        }

        $params = array_merge($params, $allowedRatings);

        $sql = "SELECT m.id, m.media_type, m.seasons_label, m.title, m.tagline, m.synopsis,
                       m.director, m.cast_list, m.release_year, m.duration_label, m.duration_seconds,
                       m.maturity_rating, m.quality, m.audio_format, m.audio_tracks_json, m.subtitle_tracks_json,
                       m.backdrop_url, m.is_featured, m.trending_rank, m.view_count, m.popularity_score,
                       m.is_upcoming, m.release_date_label,
                       {$watchlistSelect}, {$favoriteSelect}
                FROM media_items m
                {$joins}
                WHERE m.is_upcoming = 1
                  AND m.maturity_rating IN ({$ratingPlaceholders})
                ORDER BY m.popularity_score DESC, m.release_year DESC
                LIMIT 30";

        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        return $stmt->fetchAll();
    }

    public static function findById(string $mediaId, ?string $profileId = null): ?array
    {
        $pdo = Database::connection();
        if ($profileId !== null && $profileId !== '') {
            $stmt = $pdo->prepare(
                'SELECT m.*,
                        CASE WHEN w.media_id IS NOT NULL THEN 1 ELSE 0 END AS in_watchlist,
                        CASE WHEN f.media_id IS NOT NULL THEN 1 ELSE 0 END AS is_favorite
                 FROM media_items m
                 LEFT JOIN watchlist w ON w.media_id = m.id AND w.profile_id = ?
                 LEFT JOIN favorites f ON f.media_id = m.id AND f.profile_id = ?
                 WHERE m.id = ?
                 LIMIT 1'
            );
            $stmt->execute([$profileId, $profileId, $mediaId]);
        } else {
            $stmt = $pdo->prepare('SELECT *, 0 AS in_watchlist, 0 AS is_favorite FROM media_items WHERE id = ? LIMIT 1');
            $stmt->execute([$mediaId]);
        }
        $row = $stmt->fetch();
        return $row ?: null;
    }

    public static function toggleFavorite(string $profileId, string $maxRating, string $mediaId): array
    {
        $media = self::findById($mediaId);
        if (!$media) {
            return ['ok' => false, 'status' => 404, 'error' => 'Title not found.'];
        }
        if (!Security::isRatingAllowed($media['maturity_rating'], $maxRating)) {
            return ['ok' => false, 'status' => 403, 'error' => 'Title restricted for this profile.'];
        }

        $pdo = Database::connection();
        $exists = $pdo->prepare('SELECT 1 FROM favorites WHERE profile_id = :pid AND media_id = :mid LIMIT 1');
        $exists->execute([':pid' => $profileId, ':mid' => $mediaId]);

        if ($exists->fetchColumn()) {
            $pdo->prepare('DELETE FROM favorites WHERE profile_id = :pid AND media_id = :mid')
                ->execute([':pid' => $profileId, ':mid' => $mediaId]);
            return ['ok' => true, 'status' => 200, 'media_id' => $mediaId, 'is_favorite' => false];
        }

        $pdo->prepare('INSERT INTO favorites (profile_id, media_id) VALUES (:pid, :mid)')
            ->execute([':pid' => $profileId, ':mid' => $mediaId]);
        return ['ok' => true, 'status' => 200, 'media_id' => $mediaId, 'is_favorite' => true];
    }

    public static function toggleWatchlist(string $profileId, string $maxRating, string $mediaId): array
    {
        $media = self::findById($mediaId);
        if (!$media) {
            return ['ok' => false, 'status' => 404, 'error' => 'Title not found.'];
        }
        if (!Security::isRatingAllowed($media['maturity_rating'], $maxRating)) {
            return ['ok' => false, 'status' => 403, 'error' => 'Title restricted for this profile.'];
        }

        $pdo = Database::connection();
        $exists = $pdo->prepare('SELECT 1 FROM watchlist WHERE profile_id = :pid AND media_id = :mid LIMIT 1');
        $exists->execute([':pid' => $profileId, ':mid' => $mediaId]);

        if ($exists->fetchColumn()) {
            $pdo->prepare('DELETE FROM watchlist WHERE profile_id = :pid AND media_id = :mid')
                ->execute([':pid' => $profileId, ':mid' => $mediaId]);
            return ['ok' => true, 'status' => 200, 'media_id' => $mediaId, 'in_watchlist' => false];
        }

        $pdo->prepare('INSERT INTO watchlist (profile_id, media_id) VALUES (:pid, :mid)')
            ->execute([':pid' => $profileId, ':mid' => $mediaId]);
        return ['ok' => true, 'status' => 200, 'media_id' => $mediaId, 'in_watchlist' => true];
    }

    public static function resolveMediaTracks(array $media): array
    {
        $defaultAudioFormat = (string)($media['audio_format'] ?? 'Dolby Atmos');
        $audioTracks = [];
        if (!empty($media['audio_tracks_json']) && is_string($media['audio_tracks_json'])) {
            $decoded = json_decode($media['audio_tracks_json'], true);
            if (is_array($decoded)) {
                $audioTracks = $decoded;
            }
        }
        if ($audioTracks === []) {
            $audioTracks = [
                ['code' => 'en', 'label' => 'English [Original]', 'channel_format' => $defaultAudioFormat],
                ['code' => 'es', 'label' => 'Español', 'channel_format' => '5.1 Surround'],
                ['code' => 'fr', 'label' => 'Français', 'channel_format' => '5.1 Surround'],
            ];
        }

        $subtitleTracks = [];
        if (!empty($media['subtitle_tracks_json']) && is_string($media['subtitle_tracks_json'])) {
            $decoded = json_decode($media['subtitle_tracks_json'], true);
            if (is_array($decoded)) {
                $subtitleTracks = $decoded;
            }
        }
        if ($subtitleTracks === []) {
            $subtitleTracks = [
                ['code' => 'en-cc', 'label' => 'English [CC]'],
                ['code' => 'es', 'label' => 'Español'],
                ['code' => 'fr', 'label' => 'Français'],
            ];
        }

        return [
            'audio_tracks' => $audioTracks,
            'subtitle_tracks' => $subtitleTracks,
        ];
    }
}
