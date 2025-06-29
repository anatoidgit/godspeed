const fs = require('fs');
const path = require('path');
const mm = require('music-metadata');
const { getDb, findOrInsert } = require('./dbUtils');
const { hashFile } = require('./fileUtils');
const { handleAlbumCover } = require('./coverUtils');

async function processAudioFile(filePath) {
  const db = getDb();
  const metadata = await mm.parseFile(filePath);
  const hash = await hashFile(filePath);
  const stats = fs.statSync(filePath);
  const ext = path.extname(filePath).toLowerCase();

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
        return JSON.stringify(raw);
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
    waveform_path: null,
    waveform_data: null,
    hash,
    mb_track_id: metadata.common.musicbrainz_recordingid || null
  };

  console.log(`🎵 Parsed: ${trackData.title} by ${trackData.artist}`);

  // Insert or retrieve artist and album artist IDs
  const artistId = await findOrInsert('artists', 'name', trackData.artist);
  const albumArtistName = trackData.album_artist || trackData.artist;
  const albumArtistId = await findOrInsert('artists', 'name', albumArtistName);

  // Find or create album
  const albumId = await new Promise((resolve, reject) => {
    db.get(
      `SELECT id FROM albums WHERE title = ? AND artist_id = ?`,
      [trackData.album, albumArtistId],
      (err, row) => {
        if (err) {
          console.error(`❌ Failed to query album ${trackData.album}:`, err.message);
          return reject(err);
        }
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
            null,
            trackData.genre,
            null,
            null,
            trackData.year,
            null,
            null,
            null,
            0,
            0,
            trackData.mb_track_id,
            0,
            0,
            1
          ],
          function (err) {
            if (err) {
              console.error(`❌ Failed to insert album ${trackData.album}:`, err.message);
              return reject(err);
            }
            console.log(`✅ Inserted album ${trackData.album}, ID: ${this.lastID}`);
            resolve(this.lastID);
          }
        );
      }
    );
  });

  // Insert track
  await new Promise((resolve, reject) => {
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
        null,
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
        trackData.mb_track_id
      ],
      function (err) {
        if (err) {
          console.error(`❌ Failed to insert track ${trackData.title}:`, err.message);
          return reject(err);
        }
        console.log(`✅ Inserted track ID ${this.lastID}: ${trackData.title}`);
        resolve();
      }
    );
  });

  // Link artist to album
  await new Promise((resolve, reject) => {
    db.run(
      `INSERT OR IGNORE INTO album_artists (album_id, artist_id) VALUES (?, ?)`,
      [albumId, artistId],
      (err) => {
        if (err) {
          console.error(`❌ Failed to insert into album_artists for album ${albumId}:`, err.message);
          return reject(err);
        }
        resolve();
      }
    );
  });

  // Mark album for thumbnail regeneration
  await new Promise((resolve, reject) => {
    db.run(
      `UPDATE albums SET needs_thumb_regen = 1 WHERE id = ?`,
      [albumId],
      (err) => {
        if (err) {
          console.error(`❌ Failed to mark album ${albumId} for thumb regen:`, err.message);
          return reject(err);
        }
        resolve();
      }
    );
  });

  // Detect compilation status
  await new Promise((resolve, reject) => {
    db.get(
      `SELECT COUNT(DISTINCT artist_id) AS artist_count FROM tracks WHERE album_id = ?`,
      [albumId],
      (err, row) => {
        if (err) {
          console.error(`❌ Failed to detect compilation status for album ${albumId}:`, err.message);
          return reject(err);
        }

        const detected = row.artist_count > 1 ? 1 : 0;
        db.run(
          `UPDATE albums SET is_detected_compilation = ? WHERE id = ?`,
          [detected, albumId],
          (err) => {
            if (err) {
              console.error(`❌ Failed to update compilation status for album ${albumId}:`, err.message);
              return reject(err);
            }
            console.log(`🔍 Detected compilation = ${!!detected} for album ${albumId}`);
            resolve();
          }
        );
      }
    );
  });

  // Update album aggregates
  await new Promise((resolve, reject) => {
    db.get(
      `SELECT SUM(duration) AS total_duration, SUM(file_size) AS total_size FROM tracks WHERE album_id = ?`,
      [albumId],
      (err, row) => {
        if (err) {
          console.error(`❌ Failed to update album aggregates for album ${albumId}:`, err.message);
          return reject(err);
        }
        db.run(
          `UPDATE albums SET duration = ?, total_size = ? WHERE id = ?`,
          [row.total_duration || 0, row.total_size || 0, albumId],
          (err) => {
            if (err) {
              console.error(`❌ Failed to update album stats for album ${albumId}:`, err.message);
              return reject(err);
            }
            resolve();
          }
        );
      }
    );
  });

  // Check for missing metadata
  const missingMeta = !trackData.title || !trackData.album || !trackData.artist ||
                      !trackData.composer || !trackData.genre || !trackData.year;

  await new Promise((resolve, reject) => {
    db.run(
      `UPDATE albums SET is_missing_metadata = ? WHERE id = ?`,
      [missingMeta ? 1 : 0, albumId],
      (err) => {
        if (err) {
          console.error(`❌ Failed to update missing metadata for album ${albumId}:`, err.message);
          return reject(err);
        }
        resolve();
      }
    );
  });

  // Check compilation flag
  await new Promise((resolve, reject) => {
    db.get(
      `SELECT COUNT(DISTINCT artist_id) AS artist_count FROM tracks WHERE album_id = ?`,
      [albumId],
      (err, row) => {
        if (err) {
          console.error(`❌ Failed to check compilation flag for album ${albumId}:`, err.message);
          return reject(err);
        }
        if (row?.artist_count > 1) {
          db.run(
            `UPDATE albums SET is_compilation = 1 WHERE id = ?`,
            [albumId],
            (err) => {
              if (err) {
                console.error(`❌ Failed to set compilation flag for album ${albumId}:`, err.message);
                return reject(err);
              }
              resolve();
            }
          );
        } else {
          resolve();
        }
      }
    );
  });

  // Process album cover
  await handleAlbumCover(path.dirname(filePath), albumId);
}

module.exports = { processAudioFile };