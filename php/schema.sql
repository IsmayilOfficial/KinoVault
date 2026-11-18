-- KinoVault Home Cinema - MySQL 8.0 / MariaDB Schema
CREATE DATABASE IF NOT EXISTS kinovault CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE kinovault;

CREATE TABLE users (
    id CHAR(36) PRIMARY KEY,
    email VARCHAR(160) NOT NULL UNIQUE,
    display_name VARCHAR(60) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE user_profiles (
    id CHAR(36) PRIMARY KEY,
    user_id CHAR(36) NOT NULL,
    name VARCHAR(32) NOT NULL,
    avatar_key ENUM('crimson','obsidian','cobalt','amber','emerald','silver') NOT NULL DEFAULT 'crimson',
    is_kids TINYINT(1) NOT NULL DEFAULT 0,
    max_rating ENUM('G','PG','PG-13','R') NOT NULL DEFAULT 'R',
    pin_hash VARCHAR(255) NULL,
    failed_pin_attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
    pin_locked_until DATETIME NULL,
    is_primary TINYINT(1) NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_profiles_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_profiles_user (user_id)
) ENGINE=InnoDB;

CREATE TABLE password_resets (
    id CHAR(36) PRIMARY KEY,
    user_id CHAR(36) NOT NULL,
    token_hash CHAR(64) NOT NULL,
    expires_at DATETIME NOT NULL,
    used_at DATETIME NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_resets_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY uk_reset_token_hash (token_hash),
    INDEX idx_resets_user_exp (user_id, expires_at)
) ENGINE=InnoDB;

CREATE TABLE media_items (
    id VARCHAR(64) PRIMARY KEY,
    media_type ENUM('movie','show') NOT NULL DEFAULT 'movie',
    seasons_label VARCHAR(64) NULL,
    title VARCHAR(180) NOT NULL,
    tagline VARCHAR(255) NOT NULL,
    synopsis TEXT NOT NULL,
    director VARCHAR(120) NOT NULL,
    cast_list VARCHAR(512) NOT NULL,
    release_year SMALLINT UNSIGNED NOT NULL,
    duration_label VARCHAR(32) NOT NULL,
    duration_seconds INT UNSIGNED NOT NULL,
    maturity_rating ENUM('G','PG','PG-13','R') NOT NULL DEFAULT 'PG-13',
    quality ENUM('4K HDR','1080p HD') NOT NULL DEFAULT '4K HDR',
    audio_format VARCHAR(32) NOT NULL DEFAULT 'Dolby Atmos',
    audio_tracks_json JSON NULL,
    subtitle_tracks_json JSON NULL,
    backdrop_url VARCHAR(255) NOT NULL,
    media_filename VARCHAR(180) NULL,
    drm_key_id CHAR(32) NULL,
    is_featured TINYINT(1) NOT NULL DEFAULT 0,
    trending_rank TINYINT UNSIGNED NULL,
    view_count INT UNSIGNED NOT NULL DEFAULT 0,
    popularity_score TINYINT UNSIGNED NOT NULL DEFAULT 0,
    is_upcoming TINYINT(1) NOT NULL DEFAULT 0,
    release_date_label VARCHAR(32) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_media_type_rating (media_type, maturity_rating),
    INDEX idx_media_popular (is_upcoming, popularity_score DESC, view_count DESC),
    INDEX idx_media_trending (is_upcoming, trending_rank),
    FULLTEXT INDEX ft_media_search (title, director, cast_list, synopsis)
) ENGINE=InnoDB;

CREATE TABLE genres (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(48) NOT NULL UNIQUE
) ENGINE=InnoDB;

CREATE TABLE media_genres (
    media_id VARCHAR(64) NOT NULL,
    genre_id INT UNSIGNED NOT NULL,
    PRIMARY KEY (media_id, genre_id),
    CONSTRAINT fk_mg_media FOREIGN KEY (media_id) REFERENCES media_items(id) ON DELETE CASCADE,
    CONSTRAINT fk_mg_genre FOREIGN KEY (genre_id) REFERENCES genres(id) ON DELETE CASCADE,
    INDEX idx_mg_genre (genre_id, media_id)
) ENGINE=InnoDB;

CREATE TABLE watch_history (
    profile_id CHAR(36) NOT NULL,
    media_id VARCHAR(64) NOT NULL,
    last_position_seconds INT UNSIGNED NOT NULL DEFAULT 0,
    duration_seconds INT UNSIGNED NOT NULL DEFAULT 0,
    completed TINYINT(1) NOT NULL DEFAULT 0,
    watched_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (profile_id, media_id),
    CONSTRAINT fk_wh_profile FOREIGN KEY (profile_id) REFERENCES user_profiles(id) ON DELETE CASCADE,
    CONSTRAINT fk_wh_media FOREIGN KEY (media_id) REFERENCES media_items(id) ON DELETE CASCADE,
    INDEX idx_wh_recent (profile_id, watched_at DESC)
) ENGINE=InnoDB;

CREATE TABLE watchlist (
    profile_id CHAR(36) NOT NULL,
    media_id VARCHAR(64) NOT NULL,
    added_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (profile_id, media_id),
    CONSTRAINT fk_wl_profile FOREIGN KEY (profile_id) REFERENCES user_profiles(id) ON DELETE CASCADE,
    CONSTRAINT fk_wl_media FOREIGN KEY (media_id) REFERENCES media_items(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE favorites (
    profile_id CHAR(36) NOT NULL,
    media_id VARCHAR(64) NOT NULL,
    favorited_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (profile_id, media_id),
    CONSTRAINT fk_fav_profile FOREIGN KEY (profile_id) REFERENCES user_profiles(id) ON DELETE CASCADE,
    CONSTRAINT fk_fav_media FOREIGN KEY (media_id) REFERENCES media_items(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE security_audit_log (
    id CHAR(36) PRIMARY KEY,
    user_id CHAR(36) NOT NULL,
    event_name VARCHAR(64) NOT NULL,
    detail VARCHAR(255) NOT NULL,
    ip_hash CHAR(16) NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_audit_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_audit_user_time (user_id, created_at DESC)
) ENGINE=InnoDB;
