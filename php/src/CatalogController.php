<?php
declare(strict_types=1);

namespace KinoVault;

final class CatalogController
{
    public static function searchAndBrowse(
        string $maxRating,
        string $genre = 'All Titles',
        string $mediaType = 'all',
        string $query = ''
    ): array {
        $pdo = Database::connection();
        $allowedRatings = array_keys(array_filter(
            Security::MATURITY_ORDER,
            static fn(int $lvl): bool => $lvl <= (Security::MATURITY_ORDER[$maxRating] ?? 0)
        ));
        $ratingPlaceholders = implode(',', array_fill(0, count($allowedRatings), '?'));

        $params = $allowedRatings;
        $where = ["m.maturity_rating IN ({$ratingPlaceholders})"];
        $joins = [];
        $selectScore = 'm.is_featured AS relevance_score';

        if ($mediaType === 'movie' || $mediaType === 'show') {
            $where[] = 'm.media_type = ?';
            $params[] = $mediaType;
        }

        if ($genre !== '' && $genre !== 'All Titles') {
            $joins[] = 'INNER JOIN media_genres mg ON mg.media_id = m.id INNER JOIN genres g ON g.id = mg.genre_id';
            $where[] = 'g.name = ?';
            $params[] = $genre;
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
                $where[] = 'MATCH(m.title, m.director, m.cast_list, m.synopsis) AGAINST(? IN BOOLEAN MODE)';
                array_unshift($params, $booleanTerms); // For SELECT score
                $params[] = $booleanTerms; // For WHERE clause
            }
        }

        $joinSql = implode(' ', $joins);
        $whereSql = implode(' AND ', $where);

        $sql = "SELECT m.id, m.media_type, m.seasons_label, m.title, m.tagline, m.synopsis,
                       m.director, m.cast_list, m.release_year, m.duration_label, m.duration_seconds,
                       m.maturity_rating, m.quality, m.audio_format, m.backdrop_url, m.is_featured,
                       {$selectScore}
                FROM media_items m
                {$joinSql}
                WHERE {$whereSql}
                ORDER BY relevance_score DESC, m.release_year DESC
                LIMIT 60";

        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        return $stmt->fetchAll();
    }
}
