<?php
declare(strict_types=1);

require_once __DIR__ . '/../src/Database.php';
require_once __DIR__ . '/../src/Security.php';
require_once __DIR__ . '/../src/AuthController.php';
require_once __DIR__ . '/../src/ProfileController.php';
require_once __DIR__ . '/../src/CatalogController.php';
require_once __DIR__ . '/../src/StreamController.php';

use KinoVault\AuthController;
use KinoVault\CatalogController;
use KinoVault\ProfileController;
use KinoVault\Security;
use KinoVault\StreamController;

Security::startHardenedSession();
Security::sendSecurityHeaders();

$mediaRoot = dirname(__DIR__) . '/media';
$action = $_GET['action'] ?? 'home';
$userId = $_SESSION['user_id'] ?? null;
$profileId = $_SESSION['active_profile_id'] ?? null;

// Protected video streaming endpoint
if ($action === 'stream') {
    if (!$userId || !$profileId) {
        http_response_code(401);
        exit('Authentication required');
    }
    StreamController::streamMedia(
        $userId,
        $profileId,
        (string)($_GET['id'] ?? ''),
        (string)($_GET['ticket'] ?? ''),
        $mediaRoot
    );
    exit;
}

// Protected AES-128 HLS key endpoint (basic DRM key delivery pattern)
if ($action === 'drm_key') {
    if (!$userId || !$profileId) {
        http_response_code(401);
        exit('Authentication required');
    }
    StreamController::serveDrmKey(
        $userId,
        $profileId,
        (string)($_GET['id'] ?? ''),
        (string)($_GET['ticket'] ?? '')
    );
    exit;
}

$flashError = '';
$flashSuccess = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if (!Security::verifyCsrf($_POST['csrf_token'] ?? null)) {
        http_response_code(403);
        exit('Invalid CSRF token');
    }

    if ($action === 'login') {
        $res = AuthController::login((string)($_POST['email'] ?? ''), (string)($_POST['password'] ?? ''));
        if ($res['ok']) {
            header('Location: /?action=profiles');
            exit;
        }
        $flashError = $res['error'] ?? 'Login failed';
    } elseif ($action === 'register') {
        $res = AuthController::register(
            (string)($_POST['email'] ?? ''),
            (string)($_POST['display_name'] ?? ''),
            (string)($_POST['password'] ?? '')
        );
        if ($res['ok']) {
            header('Location: /?action=home');
            exit;
        }
        $flashError = $res['error'] ?? 'Registration failed';
    } elseif ($action === 'logout') {
        AuthController::logout();
        header('Location: /?action=login');
        exit;
    } elseif ($action === 'select_profile' && $userId) {
        $res = ProfileController::selectProfile($userId, (string)($_POST['profile_id'] ?? ''), $_POST['pin'] ?? null);
        if ($res['ok']) {
            header('Location: /?action=home');
            exit;
        }
        $flashError = $res['error'] ?? 'Profile lock error';
    } elseif ($action === 'update_profile' && $userId && $profileId) {
        $res = ProfileController::updateBasicInfo(
            $userId,
            $profileId,
            (string)($_POST['name'] ?? ''),
            (string)($_POST['avatar_key'] ?? 'crimson'),
            $_POST['display_name'] ?? null
        );
        $flashSuccess = $res['ok'] ? 'Profile updated.' : '';
        $flashError = $res['error'] ?? '';
    }
}

$activeProfile = ($userId && $profileId) ? ProfileController::getActiveProfile($userId, $profileId) : null;
$genre = (string)($_GET['genre'] ?? 'All Titles');
$mediaType = (string)($_GET['type'] ?? 'all');
$searchQuery = (string)($_GET['q'] ?? '');

$catalog = $activeProfile
    ? CatalogController::searchAndBrowse($activeProfile['max_rating'], $genre, $mediaType, $searchQuery)
    : [];

$watchItem = null;
$streamTicket = null;
if ($activeProfile && $action === 'watch' && !empty($_GET['id'])) {
    $ticketRes = StreamController::issueTicket($userId, $profileId, (string)$_GET['id']);
    if ($ticketRes['ok']) {
        $streamTicket = $ticketRes;
        foreach ($catalog as $item) {
            if ($item['id'] === $_GET['id']) {
                $watchItem = $item;
                break;
            }
        }
    } else {
        $flashError = $ticketRes['error'] ?? 'Unable to play title.';
    }
}

$csrf = Security::e(Security::csrfToken());
?>
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>KinoVault — PHP Home Cinema</title>
  <style>
    body { margin: 0; font-family: system-ui, -apple-system, sans-serif; background: #08090B; color: #F5F5F7; }
    .container { max-width: 1280px; margin: 0 auto; padding: 24px; }
    .nav { display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 16px; margin-bottom: 24px; }
    .btn { background: #E50914; color: #fff; border: 0; padding: 10px 16px; border-radius: 8px; cursor: pointer; font-weight: 600; text-decoration: none; display: inline-block; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 20px; }
    .card { background: #12141A; border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; overflow: hidden; padding: 14px; }
    .player-wrap { position: relative; background: #000; border-radius: 12px; overflow: hidden; margin-bottom: 24px; }
    .watermark { position: absolute; top: 14px; right: 18px; color: rgba(255,255,255,0.22); font-family: monospace; font-size: 12px; pointer-events: none; }
    input, select { background: #12141A; color: #fff; border: 1px solid rgba(255,255,255,0.15); border-radius: 8px; padding: 8px 12px; }
  </style>
</head>
<body>
<div class="container">
  <header class="nav">
    <strong>KinoVault</strong>
    <?php if ($userId): ?>
      <form method="get" action="/" style="display:flex;gap:8px;align-items:center;">
        <input type="hidden" name="action" value="home" />
        <input type="text" name="q" value="<?= Security::e($searchQuery) ?>" placeholder="Search movies &amp; shows..." />
        <select name="type">
          <option value="all" <?= $mediaType === 'all' ? 'selected' : '' ?>>All</option>
          <option value="movie" <?= $mediaType === 'movie' ? 'selected' : '' ?>>Movies</option>
          <option value="show" <?= $mediaType === 'show' ? 'selected' : '' ?>>Shows</option>
        </select>
        <button class="btn" type="submit">Search</button>
      </form>
      <form method="post" action="/?action=logout">
        <input type="hidden" name="csrf_token" value="<?= $csrf ?>" />
        <button type="submit" class="btn" style="background:#1D2029;">Sign Out</button>
      </form>
    <?php endif; ?>
  </header>

  <?php if ($flashError !== ''): ?>
    <p style="color:#FCA5A5;"><?= Security::e($flashError) ?></p>
  <?php endif; ?>

  <?php if ($watchItem && $streamTicket): ?>
    <div class="player-wrap" oncontextmenu="return false;">
      <video
        controls
        autoplay
        playsinline
        disablepictureinpicture
        controlslist="nodownload"
        src="/?action=stream&amp;id=<?= urlencode($watchItem['id']) ?>&amp;ticket=<?= urlencode($streamTicket['ticket']) ?>"
        style="width:100%;max-height:75vh;display:block;"
      ></video>
      <div class="watermark"><?= Security::e($streamTicket['watermark']) ?></div>
    </div>
  <?php endif; ?>

  <?php if ($activeProfile): ?>
    <div class="grid">
      <?php foreach ($catalog as $item): ?>
        <article class="card">
          <h3><?= Security::e($item['title']) ?></h3>
          <p style="font-size:13px;color:#9CA3AF;">
            <?= Security::e((string)$item['release_year']) ?> · <?= Security::e($item['media_type']) ?> · <?= Security::e($item['maturity_rating']) ?>
          </p>
          <p style="font-size:13px;color:#D1D5DB;"><?= Security::e($item['tagline']) ?></p>
          <a class="btn" href="/?action=watch&amp;id=<?= urlencode($item['id']) ?>">Watch Now</a>
        </article>
      <?php endforeach; ?>
    </div>
  <?php endif; ?>
</div>
</body>
</html>
