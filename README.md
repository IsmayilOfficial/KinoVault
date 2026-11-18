# KinoVault — Private Home Cinema Streaming Platform

**KinoVault** is a Netflix-inspired home cinema streaming web application built with a defense-in-depth security architecture, multi-profile parental controls, signed short-lived media streaming licenses, and fast category/search browsing.

The repository includes two complete, aligned implementations:
1. **Live Web Application (React + TypeScript + Express + Vite)** — Runs out of the box on port `3000` with generated 720p H.264 cinema streams and atomic JSON persistence.
2. **PHP 8.2+ & MySQL 8 Reference Backend (`/php`)** — Production-structured PHP controllers, PDO prepared statements, MySQL `FULLTEXT` search schema, Argon2id hashing, and HLS AES-128 key delivery.

---

## Table of Contents

- [Core Features](#core-features)
- [Repository Structure](#repository-structure)
- [Security & Basic DRM Architecture](#security--basic-drm-architecture)
- [Quick Start (Node.js + React Live App)](#quick-start-nodejs--react-live-app)
- [Deploying the PHP 8.2+ / MySQL 8 Backend](#deploying-the-php-82--mysql-8-backend)
- [API Reference](#api-reference)
- [Pushing This Repository to GitHub](#pushing-this-repository-to-github)

---

## Core Features

### 1. Streaming Interface & Custom Video Player
- **Featured Hero Showcase** with multi-stop contrast scrims, unboxed cinema metadata, and one-click resume/play.
- **Curated Horizontal Rows**: *Continue Watching* (with progress bars), *Popular* (high popularity/view count), *Trending in Your Household*, *My List*, *Feature Films*, *Series & Limited Shows*, *Documentary & Family Cinema*, and *Coming Soon* (upcoming releases with non-playable *Remind Me* reminders).
- **Card Metadata & Quick Actions**: Visual age rating badges (`G`/`PG`/`PG-13`/`R` for films, `TV-G`/`TV-PG`/`TV-14`/`TV-MA` for shows) respecting the active profile maturity cap, plus a distinct **Heart** favorite toggle alongside **My List**.
- **Custom HTML5 Player**: Play/pause, `-5s` / `+5s` seek, scrubbable timeline, volume & mute, playback speed (`0.75x`, `1x`, `1.25x`, `1.5x`), fullscreen, keyboard shortcuts (`Space`/`K`, `M`, `F`, `ArrowLeft`/`ArrowRight`, `Escape`), and automatic playback progress sync.

### 2. Category Browsing & Relevance Search
- **Type & Genre Filtering**: Filter across `All`, `Movies`, and `Shows`, combined with genre tabs (`Sci-Fi`, `Thriller & Noir`, `Drama`, `Documentary`, `Family`).
- **Indexed CMS Search**:
  - **Express (`server/catalog.ts`)**: Multi-token scored relevance ranking prioritizing exact/prefix title matches over director, cast, genre, and synopsis matches.
  - **PHP / MySQL (`php/schema.sql`, `php/src/CatalogController.php`)**: `FULLTEXT INDEX` across `(title, director, cast_list, synopsis)` queried using `MATCH(...) AGAINST(... IN BOOLEAN MODE)` with `media_genres` joins.

### 3. Authentication, Profiles & Watch History
- **Account Authentication**: Registration, Sign In, Sign Out, and single-use **Forgot Password / Reset Password** flow.
- **Demo Household**: One-click sandboxed demo household (`Alex`, `Guest`, `Kids`, and PIN-locked `Private Vault` with PIN `1984`) without hardcoding admin passwords in client code.
- **Multi-Profile Viewer Gate ("Who's Watching?")**: Up to 6 household profiles with avatar tones, Kids Mode (`PG` ceiling), custom maturity limits (`G`, `PG`, `PG-13`, `R`), and 4–6 digit PIN locks.
- **Profile & Watch History View**: Update viewer name, avatar, and household display name; browse, resume, remove, or clear chronological watch history.
- **Security Center**: Inspect and revoke active browser sessions, rotate account passwords (auto-revoking all other sessions), and review the household security audit log.

---

## Repository Structure

```text
.
├── server.ts                       # Express + Vite server, API routes, session/CSRF/stream middleware
├── server/
│   ├── catalog.ts                  # Media catalog, maturity rating enforcement, scored CMS search
│   ├── security.ts                 # scrypt KDF, timing-safe checks, HMAC stream tickets, CSP, rate limiter
│   ├── store.ts                    # Atomic file-backed persistence & demo household provisioning
│   └── media/                      # Self-contained H.264 MP4 preview streams (served via HTTP 206)
├── src/
│   ├── App.tsx                     # Root application state & routing (Home, Browse, My List, History, Security)
│   ├── types.ts                    # Shared TypeScript interfaces
│   ├── lib/api.ts                  # Credentials-included fetch client with in-memory CSRF token
│   ├── assets/images/              # Generated 16:9 cinema backdrop artwork
│   └── components/
│       ├── AuthGate.tsx            # Sign In, Create Account, Forgot/Reset Password & Demo entry
│       ├── ProfileGate.tsx         # "Who's Watching?" profile selector, PIN modal & profile editor
│       ├── Navbar.tsx              # 3-zone top bar with search and profile dropdown
│       ├── HeroBanner.tsx          # Featured cinema hero showcase
│       ├── CinemaRow.tsx           # Horizontal scrollable carousel row
│       ├── CinemaCard.tsx          # 16:9 title card with hover quick actions & progress indicator
│       ├── TitleDetailModal.tsx    # Film/series synopsis, credits & watchlist modal
│       ├── VideoPlayerModal.tsx    # Ticket-authenticated HTML5 player with forensic watermark
│       ├── ProfileHistoryView.tsx  # Profile info editor & chronological watch history manager
│       └── SecurityCenterView.tsx  # Session revocation, password update & security audit log
└── php/
    ├── README.md                   # PHP deployment notes
    ├── schema.sql                  # MySQL 8 / MariaDB relational schema + FULLTEXT index + favorites table
    ├── public/index.php            # Front controller, Popular/Trending/Coming Soon grids, favorites & streaming UI
    └── src/
        ├── Database.php            # Hardened PDO connection (native prepares, utf8mb4)
        ├── Security.php            # Argon2id, CSRF, HMAC stream tickets, age-rating formatter, realpath guard
        ├── AuthController.php      # Register, login, logout & hashed password reset tokens
        ├── ProfileController.php   # Profile CRUD, PIN lockout & watch history queries
        ├── CatalogController.php   # FULLTEXT CMS search, Popular/Trending/Upcoming rows, favorites & watchlist toggles
        └── StreamController.php    # HTTP 206 byte-range streaming, upcoming-release block & AES-128 DRM key endpoint
```

---

## Security & Basic DRM Architecture

| Control Area | Implementation Details |
| :--- | :--- |
| **Password & PIN KDF** | **Express:** `crypto.scryptSync` (`N=16384, r=8, p=1`, 64-byte key, 16-byte random salt). **PHP:** `PASSWORD_ARGON2ID`. Both verify with constant-time comparison (`crypto.timingSafeEqual` / `hash_equals`) and normalize timing for unknown emails. |
| **Session Management** | 256-bit CSPRNG opaque tokens stored **SHA-256 hashed** on the server; transmitted exclusively via `HttpOnly` cookies (`SameSite=None; Secure` over HTTPS, `SameSite=Lax` over local HTTP). PHP regenerates session IDs on login (`session_regenerate_id(true)`). |
| **CSRF Defense** | Synchronizer Token Pattern: per-session CSPRNG CSRF token kept in memory (never `localStorage`) and verified in constant time via `X-CSRF-Token` on every `POST`, `PUT`, `PATCH`, and `DELETE` route. Auth entrypoints also check `Origin` / `Host` alignment. |
| **Password Reset** | 256-bit random token stored SHA-256 hashed with a **15-minute TTL** and single-use enforcement (`usedAt`). Completing a reset invalidates all active sessions for the account. |
| **Brute-Force Protection** | Sliding-window rate limiters on auth and API endpoints, plus a **5-attempt / 5-minute lockout** on profile PIN verification. |
| **Server-Side Maturity Gate** | Kids mode (`PG` max) and profile rating caps (`G`, `PG`, `PG-13`, `R`) are enforced server-side across catalog queries, watchlists, progress tracking, security routes, and video streams (preventing IDOR or direct URL bypass). |
| **Signed Stream Licenses (Basic DRM)** | Playing a title first requests a **120-second HMAC-SHA256 signed ticket** bound to `(sessionId, profileId, mediaId, exp)` (plus client IP fingerprint in PHP). Shared or expired stream URLs return `403 Forbidden`. |
| **Download Deterrence & Path Safety** | Streams use `Content-Disposition: inline`, `Cache-Control: private, no-store, no-transform`, `X-Content-Type-Options: nosniff`, `controlsList="nodownload"`, `disablePictureInPicture`, blocked context menus, canonical `path.resolve` / `realpath` path traversal guards, and a translucent forensic session watermark (`PROFILE-SESSIONID`). |
| **Security Headers** | Strict `Content-Security-Policy` (`object-src 'none'`, `base-uri 'self'`), `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, and `Permissions-Policy`. |

---

## Quick Start (Node.js + React Live App)

**Prerequisites:** Node.js `20+` and `npm`

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure environment (optional for local dev):**
   ```bash
   cp .env.example .env
   ```
   Set `STREAM_SIGNING_SECRET` to a random 64-character hex string in production (`openssl rand -hex 32`).

3. **Run in development mode (Express + Vite on port 3000):**
   ```bash
   npm run dev
   ```
   Open `http://localhost:3000` in your browser.

4. **Build and run for production:**
   ```bash
   npm run build
   npm start
   ```

5. **Type-check:**
   ```bash
   npm run lint
   ```

---

## Deploying the PHP 8.2+ / MySQL 8 Backend

**Prerequisites:** PHP `8.2+` (with `pdo_mysql`, `mbstring`, `openssl`), MySQL `8.0+` or MariaDB `10.6+`.

1. **Create the database and tables:**
   ```bash
   mysql -u root -p < php/schema.sql
   ```

2. **Place MP4 media files in `php/media/`** (matching `media_filename` rows in `media_items`).

3. **Set environment variables and start PHP:**
   ```bash
   export DB_DSN="mysql:host=127.0.0.1;port=3306;dbname=kinovault;charset=utf8mb4"
   export DB_USER="kinovault_app"
   export DB_PASS="your-strong-database-password"
   export STREAM_SIGNING_SECRET="$(openssl rand -hex 32)"
   export DRM_KEY_MASTER_SECRET="$(openssl rand -hex 32)"

   php -S 127.0.0.1:8080 -t php/public
   ```

---

## API Reference

| Method | Endpoint | Auth / Guard | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/auth/me` | Cookie | Returns current authenticated account, profiles, active profile & CSRF token |
| `POST` | `/api/auth/register` | Rate limit + Origin | Registers household account and primary/kids profiles |
| `POST` | `/api/auth/login` | Rate limit + Origin | Authenticates user with `scrypt` + timing-safe check |
| `POST` | `/api/auth/demo` | Rate limit + Origin | Starts isolated Demo Household session |
| `POST` | `/api/auth/forgot-password` | Rate limit + Origin | Generates 15-minute SHA-256 hashed password reset token |
| `POST` | `/api/auth/reset-password` | Rate limit + Origin | Consumes single-use reset token and revokes all sessions |
| `POST` | `/api/auth/logout` | Auth + CSRF | Destroys current session and clears `HttpOnly` cookie |
| `POST` | `/api/profiles/:id/select` | Auth + CSRF | Activates profile; validates PIN & lockout policy if PIN-locked |
| `POST` | `/api/profiles` | Auth + CSRF | Creates viewer profile (blocked for Kids profiles) |
| `PATCH` | `/api/account/profile` | Active Profile + CSRF | Updates current profile name, avatar tone, and household display name |
| `GET` | `/api/catalog` | Active Profile | Filters by `type`, `genre`, and scored query `q`, enforcing maturity limit |
| `GET` | `/api/catalog/upcoming` | Active Profile | Returns upcoming releases filtered by profile maturity limit (`/?action=upcoming` in PHP) |
| `POST` | `/api/watchlist/:mediaId` | Active Profile + CSRF | Toggles My List / Remind Me entry for active profile (`/?action=toggle_watchlist` in PHP) |
| `POST` | `/api/favorites/:mediaId` | Active Profile + CSRF | Toggles Heart favorite status distinct from My List (`/?action=toggle_favorite` in PHP) |
| `POST` | `/api/stream/:id/ticket` | Active Profile + CSRF | Issues 120-second HMAC-SHA256 signed stream license ticket |
| `GET` | `/api/stream/:id?ticket=...` | Active Profile + Ticket | Streams MP4 via HTTP `206 Partial Content` after signature verification |
| `GET` | `/api/history` | Active Profile | Returns chronological watch history for the active profile |
| `DELETE` | `/api/history/:mediaId` | Active Profile + CSRF | Removes an entry from watch history and resume progress |
| `GET` | `/api/security/overview` | Auth (Non-Kids) | Lists active sessions, enforced controls, and security audit log |
| `DELETE` | `/api/security/sessions/:id` | Auth + CSRF | Revokes another active session belonging to the account |

---

## Pushing This Repository to GitHub

This workspace is initialized as a Git repository on the `main` branch. To publish it to your GitHub account:

1. Create a new empty repository on GitHub (e.g., `kinovault-home-cinema`) **without** initializing a README or `.gitignore`.
2. Add your GitHub remote and push:
   ```bash
   git remote add origin https://github.com/<your-username>/kinovault-home-cinema.git
   git push -u origin main
   ```
3. After future edits, verify TypeScript/Vite build (and `php -l` when PHP is installed), stage, commit, and push in one command:
   ```bash
   npm run verify:push -- "feat: describe your change"
   ```
