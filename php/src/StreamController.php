<?php
declare(strict_types=1);

namespace KinoVault;

final class StreamController
{
    public static function issueTicket(string $userId, string $profileId, string $mediaId): array
    {
        $profile = ProfileController::getActiveProfile($userId, $profileId);
        if (!$profile) {
            return ['ok' => false, 'status' => 403, 'error' => 'Active profile required.'];
        }

        $media = self::findMedia($mediaId);
        if (!$media || !empty($media['is_upcoming']) || empty($media['media_filename'])) {
            return ['ok' => false, 'status' => 404, 'error' => 'Title not found or not yet released.'];
        }

        if (!Security::isRatingAllowed($media['maturity_rating'], $profile['max_rating'])) {
            return ['ok' => false, 'status' => 403, 'error' => 'Title exceeds profile maturity limit.'];
        }

        $ticket = Security::createSignedStreamTicket(session_id(), $profileId, $mediaId, 120);
        return [
            'ok' => true,
            'status' => 200,
            'ticket' => $ticket,
            'stream_url' => '/?action=stream&id=' . urlencode($mediaId) . '&ticket=' . urlencode($ticket),
            'watermark' => strtoupper(substr($profile['name'], 0, 8)) . '-' . strtoupper(substr(hash('sha256', session_id()), 0, 8)),
        ];
    }

    public static function streamMedia(string $userId, string $profileId, string $mediaId, string $ticket, string $mediaRoot): void
    {
        $profile = ProfileController::getActiveProfile($userId, $profileId);
        $media = self::findMedia($mediaId);
        if (!$profile || !$media || !empty($media['is_upcoming']) || empty($media['media_filename'])) {
            http_response_code(404);
            exit('Not found');
        }

        if (!Security::isRatingAllowed($media['maturity_rating'], $profile['max_rating'])) {
            http_response_code(403);
            exit('Maturity restriction');
        }

        if (!Security::verifySignedStreamTicket($ticket, session_id(), $profileId, $mediaId)) {
            http_response_code(403);
            exit('Expired or invalid stream license ticket');
        }

        $filePath = Security::resolveSafeMediaPath($mediaRoot, (string)$media['media_filename']);
        if ($filePath === null) {
            http_response_code(404);
            exit('Media unavailable');
        }

        $fileSize = filesize($filePath);
        if ($fileSize === false || $fileSize === 0) {
            http_response_code(404);
            exit('Empty stream');
        }

        // Release PHP session lock immediately so concurrent range requests do not block
        session_write_close();

        header('Content-Type: video/mp4');
        header('Accept-Ranges: bytes');
        header('Content-Disposition: inline');
        header('Cache-Control: private, no-store, no-transform');
        header('X-Content-Type-Options: nosniff');

        $rangeHeader = $_SERVER['HTTP_RANGE'] ?? '';
        $start = 0;
        $end = $fileSize - 1;

        if ($rangeHeader !== '') {
            if (!preg_match('/^bytes=(\d*)-(\d*)$/', trim($rangeHeader), $matches)) {
                header("Content-Range: bytes */{$fileSize}");
                http_response_code(416);
                exit;
            }
            $start = $matches[1] !== '' ? (int)$matches[1] : 0;
            $end = $matches[2] !== '' ? min((int)$matches[2], $fileSize - 1) : min($start + 1048575, $fileSize - 1);

            if ($start < 0 || $start >= $fileSize || $end < $start) {
                header("Content-Range: bytes */{$fileSize}");
                http_response_code(416);
                exit;
            }

            http_response_code(206);
            header("Content-Range: bytes {$start}-{$end}/{$fileSize}");
        } else {
            http_response_code(200);
        }

        $length = $end - $start + 1;
        header("Content-Length: {$length}");

        $fp = fopen($filePath, 'rb');
        if ($fp === false) {
            http_response_code(500);
            exit;
        }
        fseek($fp, $start);

        $remaining = $length;
        $chunkSize = 65536;
        while ($remaining > 0 && !feof($fp) && connection_status() === CONNECTION_NORMAL) {
            $read = fread($fp, min($chunkSize, $remaining));
            if ($read === false) {
                break;
            }
            echo $read;
            flush();
            $remaining -= strlen($read);
        }
        fclose($fp);
    }

    /**
     * Basic DRM Key Delivery Concept (HLS AES-128 Key Rotation):
     * Serves raw 16-byte decryption key only over authenticated, ticket-verified HTTPS requests.
     * Production CENC (Widevine / FairPlay / PlayReady) replaces this with a License Proxy Server.
     */
    public static function serveDrmKey(string $userId, string $profileId, string $mediaId, string $ticket): void
    {
        if (!Security::verifySignedStreamTicket($ticket, session_id(), $profileId, $mediaId)) {
            http_response_code(403);
            exit('Unauthorized key request');
        }
        $profile = ProfileController::getActiveProfile($userId, $profileId);
        $media = self::findMedia($mediaId);
        if (!$profile || !$media || !empty($media['is_upcoming']) || !Security::isRatingAllowed($media['maturity_rating'], $profile['max_rating'])) {
            http_response_code(403);
            exit('Forbidden');
        }

        $masterKeyHex = getenv('DRM_KEY_MASTER_SECRET') ?: hash('sha256', Security::streamSecret());
        $perTitleKey = hash_hmac('sha256', $media['drm_key_id'] ?: $mediaId, $masterKeyHex, true);
        $aes128Key = substr($perTitleKey, 0, 16);

        header('Content-Type: application/octet-stream');
        header('Cache-Control: private, no-store');
        header('Content-Length: 16');
        echo $aes128Key;
    }

    private static function findMedia(string $mediaId): ?array
    {
        $pdo = Database::connection();
        $stmt = $pdo->prepare('SELECT * FROM media_items WHERE id = :id LIMIT 1');
        $stmt->execute([':id' => $mediaId]);
        $row = $stmt->fetch();
        return $row ?: null;
    }
}
