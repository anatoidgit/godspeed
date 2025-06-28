-- Albums
CREATE TABLE albums (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  artist_id INTEGER,
  album_artist TEXT,             -- optional override for compilation or credited group
  release_date TEXT,
  genre TEXT,
  cover_path TEXT,               -- full cover (e.g. jpg)
  thumb_path TEXT,               -- .webp thumbnail
  year INTEGER,
  label TEXT,                    -- publisher label, optional
  total_size INTEGER,            -- total album size in bytes
  duration INTEGER,              -- total album duration in seconds
  is_detected_compilation BOOLEAN DEFAULT 0,  -- auto-generated
  is_compilation BOOLEAN DEFAULT 0,  -- editable by the user
  mb_album_id TEXT,              -- optional MusicBrainz album ID
  is_missing_metadata BOOLEAN DEFAULT 0,
  has_embedded_cover BOOLEAN DEFAULT 0,
  needs_thumb_regen BOOLEAN DEFAULT 0,
  FOREIGN KEY (artist_id) REFERENCES artists(id)
);
CREATE INDEX idx_albums_title ON albums (title);
CREATE INDEX idx_albums_artist_id ON albums (artist_id);

-- Artists
CREATE TABLE artists (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  mb_artist_id TEXT              -- optional MusicBrainz artist ID
);
CREATE INDEX idx_artists_name ON artists (name);

-- Album-Artist relation
CREATE TABLE IF NOT EXISTS album_artists (
  album_id INTEGER NOT NULL,
  artist_id INTEGER NOT NULL,
  PRIMARY KEY (album_id, artist_id),
  FOREIGN KEY (album_id) REFERENCES albums(id),
  FOREIGN KEY (artist_id) REFERENCES artists(id)
);
CREATE INDEX idx_album_artists_album_id ON album_artists (album_id);
CREATE INDEX idx_album_artists_artist_id ON album_artists (artist_id);

-- Tracks
CREATE TABLE tracks (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,            -- track title
  album_id INTEGER,               -- FK to album
  artist_id INTEGER,              -- FK to artist
  album_artist TEXT,              -- album artist string (if differs per track)
  composer TEXT,                  -- composer/arranger
  disc_number INTEGER,            -- disc number
  track_number INTEGER,           -- track number
  custom_order INTEGER,           -- optional manual override for sorting
  duration INTEGER,               -- duration in seconds
  duration_ms INTEGER,            -- duration in milliseconds (precise scrobble timing)
  path TEXT NOT NULL,             -- full audio file path
  extension TEXT,                 -- file format (.flac, .mp3, .dsd)
  bitrate INTEGER,                -- kbps
  sample_rate INTEGER,            -- Hz
  channels INTEGER,               -- e.g. 2 for stereo
  codec TEXT,                     -- codec name (e.g., FLAC)
  gain TEXT,                      -- ReplayGain tag
  genre TEXT,                     -- track genre
  year INTEGER,                   -- track year
  lyrics TEXT,                    -- embedded or external
  comment TEXT,                   -- optional comment field
  file_size INTEGER,              -- in bytes
  waveform_path TEXT,             -- path to waveform image
  waveform_data TEXT,             -- JSON-encoded waveform points (stringified peaks[])
  hash TEXT UNIQUE,               -- optional audio fingerprint or file hash
  mb_track_id TEXT,               -- optional MusicBrainz track ID
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  play_count INTEGER DEFAULT 0,   -- Added to track play count
  FOREIGN KEY (album_id) REFERENCES albums(id),
  FOREIGN KEY (artist_id) REFERENCES artists(id)
);
CREATE INDEX idx_tracks_album_id ON tracks (album_id);
CREATE INDEX idx_tracks_artist_id ON tracks (artist_id);
CREATE INDEX idx_tracks_hash ON tracks (hash);

-- Plays (play history)
CREATE TABLE plays (
  id INTEGER PRIMARY KEY,
  track_id INTEGER NOT NULL,
  played_at DATETIME NOT NULL DEFAULT (datetime('now', 'utc')), -- UTC timestamp
  source TEXT DEFAULT 'internal', -- 'internal' or 'lastfm'
  FOREIGN KEY (track_id) REFERENCES tracks(id)
);

-- Favorites
CREATE TABLE favorites (
  id INTEGER PRIMARY KEY,
  track_id INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (track_id) REFERENCES tracks(id)
);

-- Labels
CREATE TABLE labels (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);
CREATE INDEX idx_labels_name ON labels (name);

-- Track-Label relation
CREATE TABLE track_labels (
  track_id INTEGER NOT NULL,
  label_id INTEGER NOT NULL,
  PRIMARY KEY (track_id, label_id),
  FOREIGN KEY (track_id) REFERENCES tracks(id),
  FOREIGN KEY (label_id) REFERENCES labels(id)
);
CREATE INDEX idx_track_labels_track_id ON track_labels (track_id);
CREATE INDEX idx_track_labels_label_id ON track_labels (label_id);

-- Album-Label relation
CREATE TABLE album_labels (
  album_id INTEGER NOT NULL,
  label_id INTEGER NOT NULL,
  PRIMARY KEY (album_id, label_id),
  FOREIGN KEY (album_id) REFERENCES albums(id),
  FOREIGN KEY (label_id) REFERENCES labels(id)
);
CREATE INDEX idx_album_labels_album_id ON album_labels (album_id);
CREATE INDEX idx_album_labels_label_id ON album_labels (label_id);

-- Playlists
CREATE TABLE playlists (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  cover_path TEXT,              -- uploaded image path
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Playlist contents
CREATE TABLE playlist_tracks (
  playlist_id INTEGER NOT NULL,
  track_id INTEGER NOT NULL,
  position INTEGER,
  custom_title TEXT,            -- Custom title for track in this playlist
  PRIMARY KEY (playlist_id, track_id),
  FOREIGN KEY (playlist_id) REFERENCES playlists(id),
  FOREIGN KEY (track_id) REFERENCES tracks(id)
);
CREATE INDEX idx_playlist_tracks_playlist_id ON playlist_tracks (playlist_id);
CREATE INDEX idx_playlist_tracks_track_id ON playlist_tracks (track_id);

-- External scrobbles (e.g. from Last.fm)
CREATE TABLE scrobbles (
  id INTEGER PRIMARY KEY,
  track_id INTEGER,
  scrobbled_at DATETIME,
  FOREIGN KEY (track_id) REFERENCES tracks(id)
);

-- Global user settings (shared with dashboard if needed)
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

-- Playlist-Label relation
CREATE TABLE playlist_labels (
  playlist_id INTEGER NOT NULL,
  label_id INTEGER NOT NULL,
  PRIMARY KEY (playlist_id, label_id),
  FOREIGN KEY (playlist_id) REFERENCES playlists(id),
  FOREIGN KEY (label_id) REFERENCES labels(id)
);
CREATE INDEX idx_playlist_labels_playlist_id ON playlist_labels (playlist_id);
CREATE INDEX idx_playlist_labels_label_id ON playlist_labels (label_id);