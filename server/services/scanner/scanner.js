const fs = require('fs');
const fss = require('fs'); // for streams
const path = require('path');
const klaw = require('klaw');
const mm = require('music-metadata');
const sqlite3 = require('sqlite3').verbose();
const crypto = require('crypto');
const sharp = require('sharp');

const { MUSIC_DIR, DB_PATH, SCHEMA_PATH } = require('../../config');
console.log('🛠 Using music dir:', MUSIC_DIR);

const db = initializeDatabaseIfNeeded();

function initializeDatabaseIfNeeded() {
  const dbExists = fs.existsSync(DB_PATH);
  const db = new sqlite3.Database(DB_PATH);

  if (!dbExists) {
    console.log('📁 Creating godspeed.db...');
    const schemaSQL = fs.readFileSync(SCHEMA_PATH, 'utf-8');
    db.exec(schemaSQL, (err) => {
      if (err) {
        console.error('❌ Failed to initialize schema:', err.message);
      } else {
        console.log('✅ Schema initialized, including playlist tables.');
      }
    });
  } else {
    console.log('✅ godspeed.db exists.');
    // Apply migrations for existing database
    db.run(`ALTER TABLE playlist_tracks ADD COLUMN custom_title TEXT`, (err) => {
      if (err && !err.message.includes('duplicate column name')) {
        console.error('❌ Failed to add custom_title to playlist_tracks:', err.message);
      } else {
        console.log('✅ Ensured custom_title column in playlist_tracks.');
      }
    });
    db.run(`CREATE INDEX IF NOT EXISTS idx_playlist_tracks_playlist_id ON playlist_tracks (playlist_id)`, (err) => {
      if (err) console.error('❌ Failed to create index idx_playlist_tracks_playlist_id:', err.message);
      else console.log('✅ Ensured index idx_playlist_tracks_playlist_id.');
    });
    db.run(`CREATE INDEX IF NOT EXISTS idx_playlist_tracks_track_id ON playlist_tracks (track_id)`, (err) => {
      if (err) console.error('❌ Failed to create index idx_playlist_tracks_track_id:', err.message);
      else console.log('✅ Ensured index idx_playlist_tracks_track_id.');
    });
    // Add indexes for other tables
    db.run(`CREATE INDEX IF NOT EXISTS idx_artists_name ON artists (name)`, (err) => {
      if (err) console.error('❌ Failed to create index idx_artists_name:', err.message);
      else console.log('✅ Ensured index idx_artists_name.');
    });
    db.run(`CREATE INDEX IF NOT EXISTS idx_albums_title ON albums (title)`, (err) => {
      if (err) console.error('❌ Failed to create index idx_albums_title:', err.message);
      else console.log('✅ Ensured index idx_albums_title.');
    });
    db.run(`CREATE INDEX IF NOT EXISTS idx_albums_artist_id ON albums (artist_id)`, (err) => {
      if (err) console.error('❌ Failed to create index idx_albums_artist_id:', err.message);
      else console.log('✅ Ensured index idx_albums_artist_id.');
    });
    db.run(`CREATE INDEX IF NOT EXISTS idx_tracks_album_id ON tracks (album_id)`, (err) => {
      if (err) console.error('❌ Failed to create index idx_tracks_album_id:', err.message);
      else console.log('✅ Ensured index idx_tracks_album_id.');
    });
    db.run(`CREATE INDEX IF NOT EXISTS idx_tracks_artist_id ON tracks (artist_id)`, (err) => {
      if (err) console.error('❌ Failed to create index idx_tracks_artist_id:', err.message);
      else console.log('✅ Ensured index idx_tracks_artist_id.');
    });
    db.run(`CREATE INDEX IF NOT EXISTS idx_tracks_hash ON tracks (hash)`, (err) => {
      if (err) console.error('❌ Failed to create index idx_tracks_hash:', err.message);
      else console.log('✅ Ensured index idx_tracks_hash.');
    });
    db.run(`CREATE INDEX IF NOT EXISTS idx_labels_name ON labels (name)`, (err) => {
      if (err) console.error('❌ Failed to create index idx_labels_name:', err.message);
      else console.log('✅ Ensured index idx_labels_name.');
    });
  }

  return db;
}

// Supported audio formats
const SUPPORTED_EXTS = ['.flac', '.mp3', '.ogg', '.m4a', '.wav'];

function updateAlbumStats() {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT id FROM albums`,
      [],
      (err, albums) => {
        if (err) return reject(err);

        let remaining = albums.length;
        if (remaining === 0) return resolve();

        albums.forEach(album => {
          db.get(
            `SELECT 
               SUM(duration) AS total_duration,
               SUM(file_size) AS total_size
             FROM tracks
             WHERE album_id = ?`,
            [album.id],
            (err, row) => {
              if (err) return reject(err);

              db.run(
                `UPDATE albums SET duration = ?, total_size = ? WHERE id = ?`,
                [row.total_duration || 0, row.total_size || 0, album.id],
                err => {
                  if (err) return reject(err);
                  remaining--;
                  if (remaining === 0) resolve();
                }
              );
            }
          );
        });
      }
    );
  });
}

// Entry point
async function startScan() {
  const audioFiles = await getAudioFiles(MUSIC_DIR);
  console.log(`🎧 Found ${audioFiles.length} audio files.`);

  for (const file of audioFiles) {
    try {
      await processAudioFile(file);
    } catch (err) {
      console.error(`❌ Failed to process ${file}:`, err.message);
    }
  }

  await updateAlbumStats();
  console.log(`📊 Updated album durations and sizes.`);
  console.log(`✅ Done scanning.`);
}

// Recursively walk music directory
async function getAudioFiles(root) {
  const files = [];

  for await (const item of klaw(root)) {
    const ext = path.extname(item.path).toLowerCase();
    if (!item.stats.isDirectory() && SUPPORTED_EXTS.includes(ext)) {
      files.push(item.path);
    }
  }

  return files;
}

// Hash audio file for duplicate detection
function hashFile(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('md5');
    const stream = fss.createReadStream(filePath);

    stream.on('data', chunk => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

// looks for a cover file and generates a webp thumbnail
const fsPromises = fs.promises;

async function handleAlbumCover(albumDir, albumId) {
  const candidates = ['cover.jpg', 'cover.jpeg', 'folder.jpg', 'folder.jpeg', 'cover.png', 'folder.png'];
  let coverPath = null;

  // 🧠 Check if we need to regenerate the thumbnail
  const regen = await new Promise((resolve) => {
    db.get(
      `SELECT needs_thumb_regen FROM albums WHERE id = ?`,
      [albumId],
      (err, row) => {
        if (err || !row) return resolve(true); // default to regenerating on error
        resolve(row.needs_thumb_regen === 1);
      }
    );
  });

  // 🔍 Try to locate a valid cover image using async fs access
  for (const name of candidates) {
    const fullPath = path.join(albumDir, name);
    try {
      await fsPromises.access(fullPath);
      coverPath = fullPath;
      break;
    } catch {
      // File doesn't exist — continue
    }
  }

  if (!coverPath) return; // No cover image found

  // 📁 Ensure a central thumbs dir exists inside MUSIC_DIR
  const thumbsDir = path.join(MUSIC_DIR, 'thumbs');
  await fsPromises.mkdir(thumbsDir, { recursive: true });

  // 📸 Use unique filename per album ID
  const thumbPath = path.join(thumbsDir, `thumb-${albumId}.webp`);

  try {
    await sharp(coverPath)
      .resize(300, 300, { fit: 'inside' })
      .webp()
      .toFile(thumbPath);

    db.run(
      `UPDATE albums SET cover_path = ?, thumb_path = ?, needs_thumb_regen = 0 WHERE id = ?`,
      [coverPath, thumbPath, albumId],
      err => {
        if (err) console.error(`❌ Failed to update album cover for album ${albumId}`, err.message);
        else console.log(`🖼️ Cover set for album ${albumId}`);
      }
    );
  } catch (err) {
    console.error(`❌ Failed to process cover image for album ${albumId}:`, err.message);
  }
}

// 📂 Placeholder for processing a single audio file
async function processAudioFile(filePath) {
  const metadata = await mm.parseFile(filePath);
  const hash = await hashFile(filePath);
  const stats = fs.statSync(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const duration = Math.floor(metadata.format.duration || 0);

  const trackData = {
    title: metadata.common.title || path.basename(filePath),
    album: metadata.common.album || 'Unknown Album',
    artist: metadata.common.artist || 'Unknown Artist',
    album_artist: metadata.common.albumartist || null,
    composer: metadata.common.composer || null,
    disc_number: metadata.common.disk?.no || null,
    track_number: metadata.common.track?.no || null,
    duration: Math.floor(metadata.format.duration || 0),
    duration_ms: Math.floor((metadata.format.duration || 0) * 1000),
    path: filePath,
    extension: ext,
    bitrate: metadata.format.bitrate || null,
    sample_rate: metadata.format.sampleRate || null,
    channels: metadata.format.numberOfChannels || null,
    codec: metadata.format.codec || null,
    gain: metadata.common.replaygain_track_gain || null,
    genre: metadata.common.genre?.[0] || null,
    year: metadata.common.year || parseInt(metadata.common.date) || null,
    lyrics: (() => {
      const raw = metadata.common.lyrics;
      if (!raw) return null;
      if (Array.isArray(raw)) {
        return raw.map(item => (typeof item === 'string' ? item : item.text || '')).join('\n');
      }
      if (typeof raw === 'object') {
        return JSON.stringify(raw); // catch structured objects
      }
      return raw;
    })(),
    comment: (() => {
      const raw = metadata.common.comment;
      if (!raw) return null;
      if (Array.isArray(raw)) {
        return raw.map(item => (typeof item === 'string' ? item : JSON.stringify(item))).join('\n');
      }
      if (typeof raw === 'object') {
        return JSON.stringify(raw);
      }
      return raw;
    })(),
    file_size: stats.size,
    waveform_path: null, // to be generated later
    waveform_data: null, // to be generated later
    hash: hash,
    mb_track_id: metadata.common.musicbrainz_recordingid || null,
  };

  console.log(`🎵 Parsed: ${trackData.title} by ${trackData.artist}`);

  // 🔎 Insert or retrieve artist and album artist IDs
  const artistId = await findOrInsert('artists', 'name', trackData.artist);
  const albumArtistName = trackData.album_artist || trackData.artist;
  const albumArtistId = await findOrInsert('artists', 'name', albumArtistName);

  // 📀 Find or create album
  const albumId = await new Promise((resolve, reject) => {
    db.get(
      `SELECT id FROM albums WHERE title = ? AND artist_id = ?`,
      [trackData.album, albumArtistId],
      (err, row) => {
        if (err) return reject(err);

        if (row) return resolve(row.id);

        db.run(
          `INSERT INTO albums (
            title, artist_id, album_artist, release_date, genre,
            cover_path, thumb_path, year, label, total_size, duration,
            is_compilation, is_detected_compilation, mb_album_id,
            is_missing_metadata, has_embedded_cover, needs_thumb_regen
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            trackData.album,
            albumArtistId,
            trackData.album_artist,
            null, // release_date (not extracted yet)
            trackData.genre,
            null, // cover_path (to be set later)
            null, // thumb_path (to be set later)
            trackData.year,
            null, // label (not extracted yet)
            null, // total_size
            null, // duration
            0,    // is_compilation (user-editable override, default false)
            0,    // is_detected_compilation (auto logic sets later)
            trackData.mb_track_id, // placeholder
            0,    // is_missing_metadata
            0,    // has_embedded_cover
            1     // needs_thumb_regen (default true)
          ],
          function (err) {
            if (err) return reject(err);
            resolve(this.lastID);
          }
        );
      }
    );
  });

  // 💾 Insert track into DB
  db.run(
    `INSERT INTO tracks (
      title, album_id, artist_id, album_artist, composer,
      disc_number, track_number, custom_order, duration, duration_ms,
      path, extension, bitrate, sample_rate, channels,
      codec, gain, genre, year, lyrics, comment,
      file_size, waveform_path, waveform_data, hash, mb_track_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      trackData.title,
      albumId,
      artistId,
      trackData.album_artist,
      trackData.composer,
      trackData.disc_number,
      trackData.track_number,
      null, // custom_order
      trackData.duration,
      trackData.duration_ms,
      trackData.path,
      trackData.extension,
      trackData.bitrate,
      trackData.sample_rate,
      trackData.channels,
      trackData.codec,
      trackData.gain,
      trackData.genre,
      trackData.year,
      trackData.lyrics,
      trackData.comment,
      trackData.file_size,
      null,
      null,
      trackData.hash,
      trackData.mb_track_id,
    ],
    function (err) {
      if (err)
        console.error(`❌ DB insert error: ${trackData.title}`, err.message);
      else
        console.log(`✅ Inserted track ID ${this.lastID}: ${trackData.title}`);

      // ➕ Link artist to album (new junction table)
      db.run(
        `INSERT OR IGNORE INTO album_artists (album_id, artist_id) VALUES (?, ?)`,
        [albumId, artistId],
        err => {
          if (err) console.error(`⚠️ Failed to insert into album_artists`, err.message);
        }
      );

      // ✅ Mark album for thumbnail regeneration
      db.run(
        `UPDATE albums SET needs_thumb_regen = 1 WHERE id = ?`,
        [albumId],
        err => {
          if (err)
            console.error(`⚠️ Failed to mark album ${albumId} for thumb regen:`, err.message);
        }
      );

      // 🔍 Detect compilation flag
      db.get(
        `SELECT COUNT(DISTINCT artist_id) AS artist_count FROM tracks WHERE album_id = ?`,
        [albumId],
        (err, row) => {
          if (err) {
            console.error(`⚠️ Failed to detect compilation status for album ${albumId}:`, err.message);
            return;
          }

          const detected = row.artist_count > 1 ? 1 : 0;

          db.run(
            `UPDATE albums SET is_detected_compilation = ? WHERE id = ?`,
            [detected, albumId],
            err => {
              if (err) console.error(`⚠️ Failed to update detected compilation status`, err.message);
              else console.log(`🔍 Detected compilation = ${!!detected} for album ${albumId}`);
            }
          );
        }
      );

      // 📊 Update total duration and size for the album
      db.get(
        `SELECT SUM(duration) AS total_duration, SUM(file_size) AS total_size FROM tracks WHERE album_id = ?`,
        [albumId],
        (err, row) => {
          if (err) return console.error(`⚠️ Failed to update album aggregates`, err.message);
          db.run(
            `UPDATE albums SET duration = ?, total_size = ? WHERE id = ?`,
            [row.total_duration || 0, row.total_size || 0, albumId]
          );
        }
      );
    }
  );

  // 🧠 Check if the album is missing important metadata
  const missingMeta =
    !trackData.title ||
    !trackData.album ||
    !trackData.artist ||
    !trackData.composer ||
    !trackData.genre ||
    !trackData.year;

  db.run(
    `UPDATE albums SET is_missing_metadata = ? WHERE id = ?`,
    [missingMeta ? 1 : 0, albumId]
  );

  // 👥 Check if album contains multiple distinct track artists (compilation)
  db.get(
    `SELECT COUNT(DISTINCT artist_id) AS artist_count FROM tracks WHERE album_id = ?`,
    [albumId],
    (err, row) => {
      if (!err && row?.artist_count > 1) {
        db.run(
          `UPDATE albums SET is_compilation = 1 WHERE id = ?`,
          [albumId]
        );
      }
    }
  );

  // 🖼️ Try to locate and assign album cover + thumbnail
  await handleAlbumCover(path.dirname(filePath), albumId);
}

function findOrInsert(table, column, value) {
  return new Promise((resolve, reject) => {
    db.get(`SELECT id FROM ${table} WHERE ${column} = ?`, [value], (err, row) => {
      if (err) return reject(err);
      if (row) return resolve(row.id);

      // Insert if not found
      db.run(`INSERT INTO ${table} (${column}) VALUES (?)`, [value], function (err) {
        if (err) return reject(err);
        resolve(this.lastID);
      });
    });
  });
}

startScan();