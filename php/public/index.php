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
$action = (string)($_GET['action'] ?? 'home');
$userId = $_SESSION['user_id'] ?? null;
$profileId = $_SESSION['active_profile_id'] ?? null;

$wantsJson = static function (): bool {
    $accept = $_SERVER['HTTP_ACCEPT'] ?? '';
    return str_contains($accept, 'application/json');
};

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

// JSON endpoint for upcoming releases filtered by active profile maturity limit
if ($action === 'upcoming' && $_SERVER['REQUEST_METHOD'] === 'GET') {
    header('Content-Type: application/json; charset=utf-8');
    $active = ($userId && $profileId) ? ProfileController::getActiveProfile($userId, $profileId) : null;
    if (!$active) {
        http_response_code(401);
        echo json_encode(['error' => 'Active profile required.']);
        exit;
    }
    $items = CatalogController::getUpcoming($active['max_rating'], $profileId);
    echo json_encode([
        'items' => $items,
        'total_allowed_count' => count($items),
    ]);
    exit;
}

// JSON endpoint for popular titles filtered by active profile maturity limit
if ($action === 'popular' && $_SERVER['REQUEST_METHOD'] === 'GET') {
    header('Content-Type: application/json; charset=utf-8');
    $active = ($userId && $profileId) ? ProfileController::getActiveProfile($userId, $profileId) : null;
    if (!$active) {
        http_response_code(401);
        echo json_encode(['error' => 'Active profile required.']);
        exit;
    }
    $items = CatalogController::getPopular($active['max_rating'], $profileId);
    echo json_encode([
        'items' => $items,
        'total_allowed_count' => count($items),
    ]);
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
    } elseif ($action === 'toggle_favorite' && $userId && $profileId) {
        $active = ProfileController::getActiveProfile($userId, $profileId);
        if (!$active) {
            http_response_code(401);
            exit('Active profile required');
        }
        $res = CatalogController::toggleFavorite($profileId, $active['max_rating'], (string)($_POST['media_id'] ?? ''));
        if ($wantsJson()) {
            header('Content-Type: application/json; charset=utf-8');
            http_response_code((int)$res['status']);
            echo json_encode($res);
            exit;
        }
        if ($res['ok']) {
            header('Location: /?action=home');
            exit;
        }
        $flashError = $res['error'] ?? 'Unable to update favorite.';
    } elseif ($action === 'toggle_watchlist' && $userId && $profileId) {
        $active = ProfileController::getActiveProfile($userId, $profileId);
        if (!$active) {
            http_response_code(401);
            exit('Active profile required');
        }
        $res = CatalogController::toggleWatchlist($profileId, $active['max_rating'], (string)($_POST['media_id'] ?? ''));
        if ($wantsJson()) {
            header('Content-Type: application/json; charset=utf-8');
            http_response_code((int)$res['status']);
            echo json_encode($res);
            exit;
        }
        if ($res['ok']) {
            header('Location: /?action=home');
            exit;
        }
        $flashError = $res['error'] ?? 'Unable to update My List.';
    }
}

$activeProfile = ($userId && $profileId) ? ProfileController::getActiveProfile($userId, $profileId) : null;
$genre = (string)($_GET['genre'] ?? 'All Titles');
$mediaType = (string)($_GET['type'] ?? 'all');
$searchQuery = (string)($_GET['q'] ?? '');
$isFiltering = trim($searchQuery) !== '' || $mediaType !== 'all' || ($genre !== '' && $genre !== 'All Titles');

$catalog = $activeProfile
    ? CatalogController::searchAndBrowse($activeProfile['max_rating'], $genre, $mediaType, $searchQuery, $profileId)
    : [];
$popular = ($activeProfile && !$isFiltering)
    ? CatalogController::getPopular($activeProfile['max_rating'], $profileId)
    : [];
$trending = ($activeProfile && !$isFiltering)
    ? CatalogController::getTrending($activeProfile['max_rating'], $profileId)
    : [];
$upcoming = ($activeProfile && !$isFiltering)
    ? CatalogController::getUpcoming($activeProfile['max_rating'], $profileId)
    : [];

$watchItem = null;
$streamTicket = null;
$watchTracks = ['audio_tracks' => [], 'subtitle_tracks' => []];
$selectedAudio = (string)($_GET['audio'] ?? '');
$selectedSubtitle = (string)($_GET['sub'] ?? 'off');
if ($activeProfile && $action === 'watch' && !empty($_GET['id'])) {
    $ticketRes = StreamController::issueTicket($userId, $profileId, (string)$_GET['id']);
    if ($ticketRes['ok']) {
        $streamTicket = $ticketRes;
        $watchItem = CatalogController::findById((string)$_GET['id'], $profileId);
        if ($watchItem) {
            $watchTracks = CatalogController::resolveMediaTracks($watchItem);
            $validAudioCodes = array_column($watchTracks['audio_tracks'], 'code');
            if ($selectedAudio === '' || !in_array($selectedAudio, $validAudioCodes, true)) {
                $selectedAudio = (string)($validAudioCodes[0] ?? 'en');
            }
            $validSubCodes = array_column($watchTracks['subtitle_tracks'], 'code');
            if ($selectedSubtitle !== 'off' && !in_array($selectedSubtitle, $validSubCodes, true)) {
                $selectedSubtitle = 'off';
            }
        }
    } else {
        $flashError = $ticketRes['error'] ?? 'Unable to play title.';
    }
}

$csrf = Security::e(Security::csrfToken());

$renderCard = static function (array $item, array $profile, string $csrfToken): void {
    if (!Security::isRatingAllowed((string)$item['maturity_rating'], (string)$profile['max_rating'])) {
        return;
    }
    $displayRating = Security::displayAgeRating((string)$item['maturity_rating'], (string)$item['media_type']);
    $ratingClass = match ((string)$item['maturity_rating']) {
        'G' => 'rating-g',
        'PG' => 'rating-pg',
        'PG-13' => 'rating-pg13',
        default => 'rating-r',
    };
    $isUpcoming = !empty($item['is_upcoming']);
    $isFavorite = !empty($item['is_favorite']);
    $inWatchlist = !empty($item['in_watchlist']);
    $releaseLabel = !empty($item['release_date_label']) ? (string)$item['release_date_label'] : 'Soon';
    ?>
    <article class="card">
      <div class="card-media">
        <?php if (!empty($item['backdrop_url'])): ?>
          <img src="<?= Security::e((string)$item['backdrop_url']) ?>" alt="<?= Security::e((string)$item['title']) ?>" loading="lazy" />
        <?php endif; ?>
        <div class="card-overlay-top">
          <div style="display:flex;gap:6px;align-items:center;">
            <?php if ($isUpcoming): ?>
              <span class="badge-upcoming">Coming <?= Security::e($releaseLabel) ?></span>
            <?php elseif (!empty($item['trending_rank'])): ?>
              <span class="badge-rank">#<?= (int)$item['trending_rank'] ?></span>
            <?php endif; ?>
          </div>
          <div style="display:flex;gap:6px;align-items:center;">
            <span class="badge-rating <?= $ratingClass ?>"><?= Security::e($displayRating) ?></span>
            <form method="post" action="/?action=toggle_favorite" style="margin:0;">
              <input type="hidden" name="csrf_token" value="<?= $csrfToken ?>" />
              <input type="hidden" name="media_id" value="<?= Security::e((string)$item['id']) ?>" />
              <button
                type="submit"
                class="fav-btn <?= $isFavorite ? 'is-fav' : '' ?>"
                aria-label="<?= $isFavorite ? 'Remove from Favorites' : 'Add to Favorites' ?>"
                title="<?= $isFavorite ? 'Remove from Favorites' : 'Favorite' ?>"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="<?= $isFavorite ? 'currentColor' : 'none' ?>" stroke="currentColor" stroke-width="2" aria-hidden="true">
                  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                </svg>
              </button>
            </form>
          </div>
        </div>
      </div>
      <div class="card-body">
        <h3><?= Security::e((string)$item['title']) ?></h3>
        <p class="card-meta">
          <?= Security::e((string)$item['release_year']) ?>
          &middot; <?= Security::e($item['media_type'] === 'show' ? 'Series' : 'Film') ?>
          &middot; <?= Security::e((string)$item['duration_label']) ?>
        </p>
        <p class="card-tagline"><?= Security::e((string)$item['tagline']) ?></p>
        <div class="card-actions">
          <?php if ($isUpcoming): ?>
            <span class="btn btn-muted" aria-disabled="true">Coming <?= Security::e($releaseLabel) ?></span>
          <?php else: ?>
            <a class="btn" href="/?action=watch&amp;id=<?= urlencode((string)$item['id']) ?>">Watch Now</a>
          <?php endif; ?>
          <form method="post" action="/?action=toggle_watchlist" style="margin:0;">
            <input type="hidden" name="csrf_token" value="<?= $csrfToken ?>" />
            <input type="hidden" name="media_id" value="<?= Security::e((string)$item['id']) ?>" />
            <button type="submit" class="btn btn-secondary">
              <?php if ($isUpcoming): ?>
                <?= $inWatchlist ? 'Reminder Set' : 'Remind Me' ?>
              <?php else: ?>
                <?= $inWatchlist ? 'In My List' : '+ My List' ?>
              <?php endif; ?>
            </button>
          </form>
        </div>
      </div>
    </article>
    <?php
};
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
    .nav { display: flex; align-items: center; justify-content: space-between; gap: 16px; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 16px; margin-bottom: 24px; }
    .section-title { font-size: 18px; font-weight: 700; margin: 28px 0 14px; display: flex; align-items: center; gap: 10px; }
    .section-pill { font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; padding: 2px 8px; border-radius: 999px; border: 1px solid rgba(255,255,255,0.16); color: #9CA3AF; }
    .btn { background: #E50914; color: #fff; border: 0; padding: 8px 14px; border-radius: 8px; cursor: pointer; font-weight: 600; font-size: 13px; text-decoration: none; display: inline-flex; align-items: center; gap: 6px; }
    .btn-secondary { background: #1D2029; color: #F5F5F7; border: 1px solid rgba(255,255,255,0.14); }
    .btn-muted { background: #161820; color: #D8B4FE; border: 1px solid rgba(168,85,247,0.35); cursor: default; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 20px; }
    .card { background: #12141A; border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; overflow: hidden; display: flex; flex-direction: column; }
    .card-media { position: relative; aspect-ratio: 16 / 9; background: #1A1D24; overflow: hidden; }
    .card-media img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .card-overlay-top { position: absolute; inset: 10px 10px auto 10px; display: flex; justify-content: space-between; align-items: center; pointer-events: none; }
    .card-overlay-top > * { pointer-events: auto; }
    .card-body { padding: 14px; display: flex; flex-direction: column; flex: 1; }
    .card-body h3 { margin: 0 0 6px; font-size: 16px; }
    .card-meta { margin: 0 0 8px; font-size: 12px; color: #9CA3AF; }
    .card-tagline { margin: 0 0 14px; font-size: 13px; color: #D1D5DB; flex: 1; }
    .card-actions { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
    .badge-rating { font-size: 10px; font-weight: 700; letter-spacing: 0.04em; padding: 3px 7px; border-radius: 4px; background: rgba(0,0,0,0.8); border: 1px solid rgba(255,255,255,0.2); }
    .rating-g { color: #6EE7B7; border-color: rgba(52,211,153,0.45); }
    .rating-pg { color: #BAE6FD; border-color: rgba(56,189,248,0.45); }
    .rating-pg13 { color: #FDE68A; border-color: rgba(251,191,36,0.45); }
    .rating-r { color: #FCA5A5; border-color: rgba(229,9,20,0.6); }
    .badge-upcoming { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; padding: 3px 8px; border-radius: 4px; background: rgba(88,28,135,0.85); color: #F3E8FF; border: 1px solid rgba(192,132,252,0.4); }
    .badge-rank { font-size: 11px; font-weight: 800; padding: 2px 7px; border-radius: 4px; background: rgba(0,0,0,0.82); border: 1px solid rgba(255,255,255,0.22); }
    .fav-btn { width: 28px; height: 28px; border-radius: 999px; border: 1px solid rgba(255,255,255,0.25); background: rgba(0,0,0,0.72); color: #E5E7EB; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; padding: 0; }
    .fav-btn.is-fav { background: rgba(229,9,20,0.9); border-color: #E50914; color: #FFFFFF; }
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
      <div style="display:flex;gap:12px;align-items:center;">
        <?php if ($activeProfile): ?>
          <span style="font-size:12px;color:#9CA3AF;">
            <?= Security::e((string)$activeProfile['name']) ?> &middot; Max <?= Security::e((string)$activeProfile['max_rating']) ?>
          </span>
        <?php endif; ?>
        <form method="post" action="/?action=logout" style="margin:0;">
          <input type="hidden" name="csrf_token" value="<?= $csrf ?>" />
          <button type="submit" class="btn btn-secondary">Sign Out</button>
        </form>
      </div>
    <?php endif; ?>
  </header>

  <?php if ($flashError !== ''): ?>
    <p style="color:#FCA5A5;"><?= Security::e($flashError) ?></p>
  <?php endif; ?>
  <?php if ($flashSuccess !== ''): ?>
    <p style="color:#6EE7B7;"><?= Security::e($flashSuccess) ?></p>
  <?php endif; ?>

  <?php if ($watchItem && $streamTicket): ?>
    <div class="player-wrap">
      <video
        controls
        autoplay
        playsinline
        disablepictureinpicture
        controlslist="nodownload"
        src="/?action=stream&amp;id=<?= urlencode((string)$watchItem['id']) ?>&amp;ticket=<?= urlencode((string)$streamTicket['ticket']) ?>"
        style="width:100%;max-height:75vh;display:block;"
      ></video>
      <div class="watermark"><?= Security::e((string)$streamTicket['watermark']) ?></div>
      <div style="display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px;padding:12px 16px;background:#12141A;border-top:1px solid rgba(255,255,255,0.1);">
        <div style="font-size:13px;color:#D1D5DB;">
          <strong><?= Security::e((string)$watchItem['title']) ?></strong>
          &middot; <?= Security::e((string)$watchItem['quality']) ?>
        </div>
        <form method="get" action="/" style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:0;">
          <input type="hidden" name="action" value="watch" />
          <input type="hidden" name="id" value="<?= Security::e((string)$watchItem['id']) ?>" />
          <label style="font-size:12px;color:#9CA3AF;">
            Audio
            <select name="audio" style="margin-left:4px;">
              <?php foreach ($watchTracks['audio_tracks'] as $track): ?>
                <option value="<?= Security::e((string)$track['code']) ?>" <?= $selectedAudio === (string)$track['code'] ? 'selected' : '' ?>>
                  <?= Security::e((string)$track['label']) ?><?= !empty($track['channel_format']) ? ' (' . Security::e((string)$track['channel_format']) . ')' : '' ?>
                </option>
              <?php endforeach; ?>
            </select>
          </label>
          <label style="font-size:12px;color:#9CA3AF;">
            Subtitles
            <select name="sub" style="margin-left:4px;">
              <option value="off" <?= $selectedSubtitle === 'off' ? 'selected' : '' ?>>Off</option>
              <?php foreach ($watchTracks['subtitle_tracks'] as $track): ?>
                <option value="<?= Security::e((string)$track['code']) ?>" <?= $selectedSubtitle === (string)$track['code'] ? 'selected' : '' ?>>
                  <?= Security::e((string)$track['label']) ?>
                </option>
              <?php endforeach; ?>
            </select>
          </label>
          <button type="submit" class="btn btn-secondary">Apply Tracks</button>
        </form>
      </div>
    </div>
  <?php endif; ?>

  <?php if ($activeProfile): ?>
    <?php if ($isFiltering): ?>
      <h2 class="section-title">Search &amp; Browse Results</h2>
      <div class="grid">
        <?php foreach ($catalog as $item): ?>
          <?php $renderCard($item, $activeProfile, $csrf); ?>
        <?php endforeach; ?>
      </div>
    <?php else: ?>
      <?php if (!empty($popular)): ?>
        <h2 class="section-title">Popular</h2>
        <div class="grid">
          <?php foreach ($popular as $item): ?>
            <?php $renderCard($item, $activeProfile, $csrf); ?>
          <?php endforeach; ?>
        </div>
      <?php endif; ?>

      <?php if (!empty($trending)): ?>
        <h2 class="section-title">Trending in Your Household</h2>
        <div class="grid">
          <?php foreach ($trending as $item): ?>
            <?php $renderCard($item, $activeProfile, $csrf); ?>
          <?php endforeach; ?>
        </div>
      <?php endif; ?>

      <h2 class="section-title">Full Library</h2>
      <div class="grid">
        <?php foreach ($catalog as $item): ?>
          <?php $renderCard($item, $activeProfile, $csrf); ?>
        <?php endforeach; ?>
      </div>

      <?php if (!empty($upcoming)): ?>
        <h2 class="section-title">
          Coming Soon
          <span class="section-pill">Upcoming</span>
        </h2>
        <div class="grid">
          <?php foreach ($upcoming as $item): ?>
            <?php $renderCard($item, $activeProfile, $csrf); ?>
          <?php endforeach; ?>
        </div>
      <?php endif; ?>
    <?php endif; ?>
  <?php endif; ?>
</div>
</body>
</html>
