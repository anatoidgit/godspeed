const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const mime = require('mime-types');
const { MUSIC_DIR, DB_PATH } = require('../config');
const router = express.Router();

console.log('📦 Using database at:', DB_PATH);

const db = new sqlite3.Database(DB_PATH);

const DEFAULT_COVER = path.join(__dirname, '../static/default-cover.jpg');
const DEFAULT_THUMB = path.join(__dirname, '../static/default-thumb.webp');

// Helper function to promisify db operations
const dbAll = (sql, params) => new Promise((resolve, reject) => {
  db.all(sql, params, (err, rows) => {
    if (err) reject(err);
    else resolve(rows);
  });
});

const dbGet = (sql, params) => new Promise((resolve, reject) => {
  db.get(sql, params, (err, row) => {
    if (err) reject(err);
    else resolve(row);
  });
});

const dbRun = (sql, params) => new Promise((resolve, reject) => {
  db.run(sql, params, function (err) {
    if (err) reject(err);
    else resolve(this);
  });
});

// Route: Get all albums
router.get('/albums', async (req, res) => {
  try {
    const rows = await dbAll(`SELECT * FROM albums ORDER BY id DESC`, []);
    res.json(rows);
  } catch (err) {
    console.error('❌ Failed to fetch albums:', err);
    res.status(500).json({ error: err.message });
  }
});

// Route: Log a play when a track hits 30%
router.post('/log_play', async (req, res) => {
  const { track_id } = req.body;

  if (!track_id) {
    return res.status(400).json({ error: 'Missing track_id' });
  }

  try {
    const result = await dbRun(
      `INSERT INTO plays (track_id, played_at, source) VALUES (?, datetime('now', 'utc'), 'internal')`,
      [track_id]
    );

    // Update play_count in tracks table
    await dbRun(
      `UPDATE tracks SET play_count = COALESCE(play_count, 0) + 1 WHERE id = ?`,
      [track_id]
    );

    res.json({ success: true, play_id: result.lastID });
  } catch (err) {
    console.error('❌ Failed to log play:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Route: Get play history
router.get('/history', async (req, res) => {
  try {
    const rows = await dbAll(
      `
      SELECT 
        p.id,
        p.track_id,
        strftime('%Y-%m-%dT%H:%M:%SZ', p.played_at) AS timestamp,
        p.source,
        t.title,
        t.artist_id,
        t.album_id,
        t.duration,
        t.year,
        COALESCE(t.album_artist, a.album_artist, art.name, 'Unknown Artist') AS artist,
        a.title AS album,
        t.path AS audioSrc
      FROM plays p
      JOIN tracks t ON p.track_id = t.id
      LEFT JOIN albums a ON t.album_id = a.id
      LEFT JOIN artists art ON t.artist_id = art.id
      ORDER BY p.played_at DESC
      `,
      []
    );
    res.json(rows);
  } catch (err) {
    console.error('❌ Failed to fetch history:', err);
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

// Route: Get tracks by album_id, track_id, or search query
router.get('/tracks', async (req, res) => {
  const { album_id, track_id, search } = req.query;

  if (search) {
    // Validate search query
    if (!search.trim()) {
      return res.status(400).json({ error: 'Search query cannot be empty' });
    }
    try {
      const rows = await dbAll(
        `
        SELECT 
          t.id,
          t.title,
          t.album_id,
          t.artist_id,
          t.album_artist,
          t.duration,
          t.codec,
          t.bitrate,
          t.file_size,
          t.waveform_path,
          t.year,
          t.play_count,
          a.title AS album,
          COALESCE(t.album_artist, a.album_artist, art.name, 'Unknown Artist') AS artist,
          (SELECT GROUP_CONCAT(l.name) FROM track_labels tl JOIN labels l ON tl.label_id = l.id WHERE tl.track_id = t.id) AS labels
        FROM tracks t
        LEFT JOIN albums a ON t.album_id = a.id
        LEFT JOIN artists art ON t.artist_id = art.id
        WHERE t.title LIKE ? OR t.album_artist LIKE ? OR a.title LIKE ?
        ORDER BY t.title
        `,
        [`%${search.trim()}%`, `%${search.trim()}%`, `%${search.trim()}%`]
      );
      res.json(rows.map(row => ({ ...row, labels: row.labels ? row.labels.split(',') : [] })));
    } catch (err) {
      console.error('❌ Failed to search tracks:', err);
      res.status(500).json({ error: err.message });
    }
  } else if (track_id) {
    try {
      const row = await dbGet(
        `
        SELECT 
          t.id,
          t.title,
          t.album_id,
          t.artist_id,
          t.album_artist,
          t.duration,
          t.codec,
          t.bitrate,
          t.file_size,
          t.waveform_path,
          t.year,
          t.play_count,
          a.title AS album,
          COALESCE(t.album_artist, a.album_artist, art.name, 'Unknown Artist') AS artist,
          (SELECT GROUP_CONCAT(l.name) FROM track_labels tl JOIN labels l ON tl.label_id = l.id WHERE tl.track_id = t.id) AS labels
        FROM tracks t
        LEFT JOIN albums a ON t.album_id = a.id
        LEFT JOIN artists art ON t.artist_id = art.id
        WHERE t.id = ?
        `,
        [track_id]
      );
      if (!row) {
        console.warn(`⚠️ Track ${track_id} not found`);
        return res.status(404).json({ error: 'Track not found' });
      }
      res.json({ ...row, labels: row.labels ? row.labels.split(',') : [] });
    } catch (err) {
      console.error(`❌ Failed to fetch track ${track_id}:`, err);
      res.status(500).json({ error: err.message });
    }
  } else if (album_id) {
    try {
      const rows = await dbAll(
        `
        SELECT 
          t.*,
          a.title AS album,
          COALESCE(t.album_artist, a.album_artist, art.name, 'Unknown Artist') AS artist,
          (SELECT GROUP_CONCAT(l.name) FROM track_labels tl JOIN labels l ON tl.label_id = l.id WHERE tl.track_id = t.id) AS labels
        FROM tracks t
        LEFT JOIN albums a ON t.album_id = a.id
        LEFT JOIN artists art ON t.artist_id = art.id
        WHERE t.album_id = ?
        ORDER BY t.track_number
        `,
        [album_id]
      );
      res.json(rows.map(row => ({ ...row, labels: row.labels ? row.labels.split(',') : [] })));
    } catch (err) {
      console.error(`❌ Failed to fetch tracks for album ${album_id}:`, err);
      res.status(500).json({ error: err.message });
    }
  } else {
    res.status(400).json({ error: 'Missing album_id, track_id, or search query' });
  }
});

// Route: Get all artists
router.get('/artists', async (req, res) => {
  try {
    const rows = await dbAll(`SELECT * FROM artists ORDER BY name`, []);
    res.json(rows);
  } catch (err) {
    console.error('❌ Failed to fetch artists:', err);
    res.status(500).json({ error: err.message });
  }
});

// Serve album cover
router.get('/album/:id/cover', async (req, res) => {
  const albumId = req.params.id;

  try {
    const row = await dbGet(`SELECT cover_path FROM albums WHERE id = ?`, [albumId]);
    if (!row || !row.cover_path) {
      console.warn(`⚠️ No cover path found for album ${albumId}`);
      return res.sendFile(DEFAULT_COVER);
    }

    const coverPath = row.cover_path;
    console.log(`📀 Album ${albumId} cover path:`, coverPath);

    const fullPath = path.isAbsolute(coverPath)
      ? coverPath
      : path.join(__dirname, '../', coverPath);

    await new Promise((resolve, reject) => {
      fs.access(fullPath, fs.constants.F_OK, (fsErr) => {
        if (fsErr) {
          console.warn(`⚠️ Cover not found at path: ${fullPath}`);
          reject(fsErr);
        } else {
          resolve();
        }
      });
    });
    res.sendFile(fullPath);
  } catch (err) {
    console.error(`❌ Error serving cover for album ${albumId}:`, err);
    res.sendFile(DEFAULT_COVER);
  }
});

// Serve thumbnail
router.get('/album/:id/thumb', async (req, res) => {
  const albumId = req.params.id;

  try {
    const row = await dbGet(`SELECT thumb_path FROM albums WHERE id = ?`, [albumId]);
    if (!row || !row.thumb_path) {
      console.warn(`⚠️ No thumbnail path found for album ${albumId}`);
      return res.sendFile(DEFAULT_THUMB);
    }

    const thumbPath = row.thumb_path;
    console.log(`🖼️ Album ${albumId} thumb path:`, thumbPath);

    const fullPath = path.isAbsolute(thumbPath)
      ? thumbPath
      : path.join(__dirname, '../', thumbPath);

    await new Promise((resolve, reject) => {
      fs.access(fullPath, fs.constants.F_OK, (fsErr) => {
        if (fsErr) {
          console.warn(`⚠️ Thumbnail not found at path: ${fullPath}`);
          reject(fsErr);
        } else {
          resolve();
        }
      });
    });
    res.sendFile(fullPath);
  } catch (err) {
    console.error(`❌ Error serving thumbnail for album ${albumId}:`, err);
    res.sendFile(DEFAULT_THUMB);
  }
});

// Stream audio
router.get('/track/:id/play', async (req, res) => {
  const trackId = req.params.id;
  try {
    const row = await dbGet(`SELECT path FROM tracks WHERE id = ?`, [trackId]);
    if (!row?.path) {
      console.error(`❌ Track ${trackId} not found`);
      return res.status(404).json({ error: 'Track not found' });
    }

    const filePath = row.path;
    console.log(`🎵 Serving track ${trackId} from:`, filePath);

    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    const range = req.headers.range;
    const mimeType = mime.lookup(filePath) || 'application/octet-stream';

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = end - start + 1;
      const file = fs.createReadStream(filePath, { start, end });

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': mimeType,
      });

      file.pipe(res);
    } else {
      res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type': mimeType,
      });
      fs.createReadStream(filePath).pipe(res);
    }
  } catch (err) {
    console.error(`❌ Error streaming track ${trackId}:`, err);
    res.status(404).json({ error: 'Track not found' });
  }
});

// Route: Create or get label
router.post('/labels', async (req, res) => {
  const { name } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'Missing name' });
  }
  try {
    const rows = await dbAll(
      `INSERT INTO labels (name) VALUES (LOWER(?)) ON CONFLICT(name) DO UPDATE SET name = LOWER(?) RETURNING id, name`,
      [name, name]
    );
    res.json(rows[0]);
  } catch (error) {
    console.error('❌ Failed to create label:', error);
    res.status(500).json({ error: 'Failed to create label' });
  }
});

// Route: Associate label with album
router.post('/album_labels', async (req, res) => {
  const { album_id, label_id } = req.body;
  if (!album_id || !label_id) {
    return res.status(400).json({ error: 'Missing album_id or label_id' });
  }
  try {
    await dbRun(
      `INSERT INTO album_labels (album_id, label_id) VALUES (?, ?) ON CONFLICT DO NOTHING`,
      [album_id, label_id]
    );
    res.json({ success: true });
  } catch (error) {
    console.error('❌ Failed to associate label with album:', error);
    res.status(500).json({ error: 'Failed to associate label' });
  }
});

// Route: Associate label with track
router.post('/track_labels', async (req, res) => {
  const { track_id, label_id } = req.body;
  if (!track_id || !label_id) {
    return res.status(400).json({ error: 'Missing track_id or label_id' });
  }
  try {
    await dbRun(
      `INSERT INTO track_labels (track_id, label_id) VALUES (?, ?) ON CONFLICT DO NOTHING`,
      [track_id, label_id]
    );
    res.json({ success: true });
  } catch (error) {
    console.error('❌ Failed to associate label with track:', error);
    res.status(500).json({ error: 'Failed to associate label' });
  }
});

// Route: Remove label from album
router.delete('/album_labels', async (req, res) => {
  const { album_id, label_id } = req.body;
  if (!album_id || !label_id) {
    return res.status(400).json({ error: 'Missing album_id or label_id' });
  }
  try {
    await dbRun(
      `DELETE FROM album_labels WHERE album_id = ? AND label_id = ?`,
      [album_id, label_id]
    );
    // Clean up unused labels
    await dbRun(
      `DELETE FROM labels WHERE id NOT IN (
        SELECT label_id FROM album_labels
        UNION
        SELECT label_id FROM track_labels
        UNION
        SELECT label_id FROM playlist_labels
      )`,
      []
    );
    res.json({ success: true });
  } catch (error) {
    console.error('❌ Failed to remove label from album:', error);
    res.status(500).json({ error: 'Failed to remove label' });
  }
});

// Route: Remove label from track
router.delete('/track_labels', async (req, res) => {
  const { track_id, label_id } = req.body;
  if (!track_id || !label_id) {
    return res.status(400).json({ error: 'Missing track_id or label_id' });
  }
  try {
    await dbRun(
      `DELETE FROM track_labels WHERE track_id = ? AND label_id = ?`,
      [track_id, label_id]
    );
    // Clean up unused labels
    await dbRun(
      `DELETE FROM labels WHERE id NOT IN (
        SELECT label_id FROM album_labels
        UNION
        SELECT label_id FROM track_labels
        UNION
        SELECT label_id FROM playlist_labels
      )`,
      []
    );
    res.json({ success: true });
  } catch (error) {
    console.error('❌ Failed to remove label from track:', error);
    res.status(500).json({ error: 'Failed to remove label' });
  }
});

// Route: Clean up unused labels
router.delete('/cleanup_labels', async (req, res) => {
  try {
    await dbRun(
      `DELETE FROM labels WHERE id NOT IN (
        SELECT label_id FROM album_labels
        UNION
        SELECT label_id FROM track_labels
        UNION
        SELECT label_id FROM playlist_labels
      )`,
      []
    );
    res.json({ success: true });
  } catch (error) {
    console.error('❌ Failed to clean up unused labels:', error);
    res.status(500).json({ error: 'Failed to clean up labels' });
  }
});

// Route: Get active labels (with associated albums, tracks, or playlists)
router.get('/labels', async (req, res) => {
  try {
    const labels = await dbAll(
      `SELECT DISTINCT l.id, l.name 
       FROM labels l
       WHERE l.id IN (
         SELECT label_id FROM album_labels
         UNION
         SELECT label_id FROM track_labels
         UNION
         SELECT label_id FROM playlist_labels
       )
       ORDER BY l.name`,
      []
    );
    res.json({ labels });
  } catch (error) {
    console.error('❌ Failed to fetch labels:', error);
    res.status(500).json({ error: 'Failed to fetch labels' });
  }
});

// Route: Get albums by labels
router.get('/albums_by_labels', async (req, res) => {
  const { labels, combine } = req.query;
  if (!labels) {
    return res.status(400).json({ error: 'Missing labels parameter' });
  }

  const labelArray = labels.split(',').map(l => l.trim().toLowerCase());
  const combineMode = combine === 'or' ? 'or' : 'and';

  try {
    let query;
    let params;

    if (combineMode === 'and') {
      // Albums must have all specified labels
      query = `
        SELECT DISTINCT a.*
        FROM albums a
        JOIN album_labels al ON a.id = al.album_id
        JOIN labels l ON al.label_id = l.id
        WHERE l.name IN (${labelArray.map(() => '?').join(',')})
        GROUP BY a.id
        HAVING COUNT(DISTINCT l.name) = ?
        ORDER BY a.title
      `;
      params = [...labelArray, labelArray.length];
    } else {
      // Albums with any of the specified labels
      query = `
        SELECT DISTINCT a.*
        FROM albums a
        JOIN album_labels al ON a.id = al.album_id
        JOIN labels l ON al.label_id = l.id
        WHERE l.name IN (${labelArray.map(() => '?').join(',')})
        ORDER BY a.title
      `;
      params = labelArray;
    }

    const albums = await dbAll(query, params);
    res.json(albums);
  } catch (error) {
    console.error('❌ Failed to fetch albums by labels:', error);
    res.status(500).json({ error: 'Failed to fetch albums' });
  }
});

// Route: Get tracks by labels
router.get('/tracks_by_labels', async (req, res) => {
  const { labels, include_album_labels, combine } = req.query;
  if (!labels) {
    return res.status(400).json({ error: 'Missing labels parameter' });
  }

  const labelArray = labels.split(',').map(l => l.trim().toLowerCase());
  const includeAlbumLabels = include_album_labels === 'true';
  const combineMode = combine === 'or' ? 'or' : 'and';

  try {
    let query;
    let params;

    if (includeAlbumLabels) {
      // Tracks from labeled albums OR labeled tracks
      if (combineMode === 'and') {
        query = `
          SELECT DISTINCT t.*, a.title AS album, COALESCE(t.album_artist, a.album_artist, art.name, 'Unknown Artist') AS artist,
          (SELECT GROUP_CONCAT(l.name) FROM track_labels tl JOIN labels l ON tl.label_id = l.id WHERE tl.track_id = t.id) AS labels
          FROM tracks t
          LEFT JOIN albums a ON t.album_id = a.id
          LEFT JOIN album_labels al ON a.id = al.album_id
          LEFT JOIN track_labels tl ON t.id = tl.track_id
          LEFT JOIN labels l1 ON al.label_id = l1.id
          LEFT JOIN labels l2 ON tl.label_id = l2.id
          LEFT JOIN artists art ON t.artist_id = art.id
          WHERE (
            l1.name IN (${labelArray.map(() => '?').join(',')})
            OR l2.name IN (${labelArray.map(() => '?').join(',')})
          )
          GROUP BY t.id
          HAVING COUNT(DISTINCT CASE 
            WHEN l1.name IN (${labelArray.map(() => '?').join(',')}) 
            OR l2.name IN (${labelArray.map(() => '?').join(',')}) 
            THEN l1.name ELSE l2.name END) = ?
          ORDER BY t.title
        `;
        params = [...labelArray, ...labelArray, ...labelArray, ...labelArray, labelArray.length];
      } else {
        query = `
          SELECT DISTINCT t.*, a.title AS album, COALESCE(t.album_artist, a.album_artist, art.name, 'Unknown Artist') AS artist,
          (SELECT GROUP_CONCAT(l.name) FROM track_labels tl JOIN labels l ON tl.label_id = l.id WHERE tl.track_id = t.id) AS labels
          FROM tracks t
          LEFT JOIN albums a ON t.album_id = a.id
          LEFT JOIN album_labels al ON a.id = al.album_id
          LEFT JOIN track_labels tl ON t.id = tl.track_id
          LEFT JOIN labels l1 ON al.label_id = l1.id
          LEFT JOIN labels l2 ON tl.label_id = l2.id
          LEFT JOIN artists art ON t.artist_id = art.id
          WHERE l1.name IN (${labelArray.map(() => '?').join(',')})
            OR l2.name IN (${labelArray.map(() => '?').join(',')})
          ORDER BY t.title
        `;
        params = [...labelArray, ...labelArray];
      }
    } else {
      // Only tracks with specified labels
      if (combineMode === 'and') {
        query = `
          SELECT DISTINCT t.*, a.title AS album, COALESCE(t.album_artist, a.album_artist, art.name, 'Unknown Artist') AS artist,
          (SELECT GROUP_CONCAT(l.name) FROM track_labels tl JOIN labels l ON tl.label_id = l.id WHERE tl.track_id = t.id) AS labels
          FROM tracks t
          LEFT JOIN albums a ON t.album_id = a.id
          JOIN track_labels tl ON t.id = tl.track_id
          JOIN labels l ON tl.label_id = l.id
          LEFT JOIN artists art ON t.artist_id = art.id
          WHERE l.name IN (${labelArray.map(() => '?').join(',')})
          GROUP BY t.id
          HAVING COUNT(DISTINCT l.name) = ?
          ORDER BY t.title
        `;
        params = [...labelArray, labelArray.length];
      } else {
        query = `
          SELECT DISTINCT t.*, a.title AS album, COALESCE(t.album_artist, a.album_artist, art.name, 'Unknown Artist') AS artist,
          (SELECT GROUP_CONCAT(l.name) FROM track_labels tl JOIN labels l ON tl.label_id = l.id WHERE tl.track_id = t.id) AS labels
          FROM tracks t
          LEFT JOIN albums a ON t.album_id = a.id
          JOIN track_labels tl ON t.id = tl.track_id
          JOIN labels l ON tl.label_id = l.id
          LEFT JOIN artists art ON t.artist_id = art.id
          WHERE l.name IN (${labelArray.map(() => '?').join(',')})
          ORDER BY t.title
        `;
        params = labelArray;
      }
    }

    const tracks = await dbAll(query, params);
    res.json(tracks.map(row => ({ ...row, labels: row.labels ? row.labels.split(',') : [] })));
  } catch (error) {
    console.error('❌ Failed to fetch tracks by labels:', error);
    res.status(500).json({ error: 'Failed to fetch tracks' });
  }
});

// Route: Get album labels
router.get('/album_labels/:album_id', async (req, res) => {
  const { album_id } = req.params;
  try {
    const labels = await dbAll(
      `SELECT l.id, l.name FROM labels l JOIN album_labels al ON l.id = al.label_id WHERE al.album_id = ?`,
      [album_id]
    );
    res.json({ labels });
  } catch (error) {
    console.error('❌ Failed to fetch album labels:', error);
    res.status(500).json({ error: 'Failed to fetch album labels' });
  }
});

// Route: Get track labels
router.get('/track_labels/:track_id', async (req, res) => {
  const { track_id } = req.params;
  try {
    const labels = await dbAll(
      `SELECT l.id, l.name FROM labels l JOIN track_labels tl ON l.id = tl.label_id WHERE tl.track_id = ?`,
      [track_id]
    );
    res.json({ labels });
  } catch (error) {
    console.error('❌ Failed to fetch track labels:', error);
    res.status(500).json({ error: 'Failed to fetch track labels' });
  }
});

// Route: Get all playlists
router.get('/playlists', async (req, res) => {
  try {
    const playlists = await dbAll(
      `SELECT p.*, COALESCE(COUNT(pt.track_id), 0) as track_count
       FROM playlists p
       LEFT JOIN playlist_tracks pt ON p.id = pt.playlist_id
       GROUP BY p.id
       ORDER BY p.created_at DESC`,
      []
    );
    res.json(playlists);
  } catch (error) {
    console.error('❌ Failed to fetch playlists:', error);
    res.status(500).json({ error: 'Failed to fetch playlists' });
  }
});

// Route: Get playlist details and tracks
router.get('/playlists/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const playlist = await dbGet(
      `SELECT p.*, COALESCE(COUNT(pt.track_id), 0) as track_count
       FROM playlists p
       LEFT JOIN playlist_tracks pt ON p.id = pt.playlist_id
       WHERE p.id = ?
       GROUP BY p.id`,
      [id]
    );

    if (!playlist) {
      return res.status(404).json({ error: 'Playlist not found' });
    }

    const labels = await dbAll(
      `SELECT l.id, l.name 
       FROM labels l
       JOIN playlist_labels pl ON l.id = pl.label_id 
       WHERE pl.playlist_id = ?`,
      [id]
    );

    const tracks = await dbAll(
      `SELECT pt.position, pt.custom_title, t.*, 
              a.title AS album, 
              COALESCE(t.album_artist, a.album_artist, art.name, 'Unknown Artist') AS artist,
              a.id AS album_id,
              (SELECT GROUP_CONCAT(l.name) FROM track_labels tl JOIN labels l ON tl.label_id = l.id WHERE tl.track_id = t.id) AS labels
       FROM playlist_tracks pt
       JOIN tracks t ON pt.track_id = t.id
       LEFT JOIN albums a ON t.album_id = a.id
       LEFT JOIN artists art ON t.artist_id = art.id
       WHERE pt.playlist_id = ?
       ORDER BY pt.position`,
      [id]
    );

    res.json({
      ...playlist,
      labels: labels.map(l => l.name),
      tracks: tracks.map(row => ({ ...row, labels: row.labels ? row.labels.split(',') : [] }))
    });
  } catch (error) {
    console.error('❌ Failed to fetch playlist:', error);
    res.status(500).json({ error: 'Failed to fetch playlist' });
  }
});

// Route: Create a playlist
router.post('/playlists', async (req, res) => {
  const { name, description } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'Missing name' });
  }
  try {
    const result = await dbRun(
      `INSERT INTO playlists (name, description) VALUES (?, ?)`,
      [name, description || '']
    );
    res.json({ id: result.lastID, name, description });
  } catch (error) {
    console.error('❌ Failed to create playlist:', error);
    res.status(500).json({ error: 'Failed to create playlist' });
  }
});

// Route: Update playlist
router.put('/playlists/:id', async (req, res) => {
  const { id } = req.params;
  const { name, description } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'Missing name' });
  }
  try {
    await dbRun(
      `UPDATE playlists SET name = ?, description = ? WHERE id = ?`,
      [name, description || '', id]
    );
    res.json({ success: true });
  } catch (error) {
    console.error('❌ Failed to update playlist:', error);
    res.status(500).json({ error: 'Failed to update playlist' });
  }
});

// Route: Delete playlist
router.delete('/playlists/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await dbRun(`DELETE FROM playlists WHERE id = ?`, [id]);
    await dbRun(`DELETE FROM playlist_tracks WHERE playlist_id = ?`, [id]);
    await dbRun(`DELETE FROM playlist_labels WHERE playlist_id = ?`, [id]);
    // Clean up unused labels
    await dbRun(
      `DELETE FROM labels WHERE id NOT IN (
        SELECT label_id FROM album_labels
        UNION
        SELECT label_id FROM track_labels
        UNION
        SELECT label_id FROM playlist_labels
      )`,
      []
    );
    res.json({ success: true });
  } catch (error) {
    console.error('❌ Failed to delete playlist:', error);
    res.status(500).json({ error: 'Failed to delete playlist' });
  }
});

// Route: Add track to playlist
router.post('/playlist_tracks', async (req, res) => {
  const { playlist_id, track_id, position, custom_title } = req.body;
  if (!playlist_id || !track_id) {
    return res.status(400).json({ error: 'Missing playlist_id or track_id' });
  }
  try {
    // Get current track count to validate position
    const trackCount = await dbGet(
      `SELECT COALESCE(COUNT(*), 0) as count FROM playlist_tracks WHERE playlist_id = ?`,
      [playlist_id]
    ).then(row => row.count);

    // Validate position
    const finalPosition = position !== undefined && Number.isInteger(Number(position)) && position > 0 && position <= trackCount + 1
      ? Number(position)
      : trackCount + 1;

    // Shift existing tracks if position is not at the end
    if (finalPosition <= trackCount) {
      await dbRun(
        `UPDATE playlist_tracks SET position = position + 1 WHERE playlist_id = ? AND position >= ?`,
        [playlist_id, finalPosition]
      );
    }

    // Insert track into playlist
    await dbRun(
      `INSERT INTO playlist_tracks (playlist_id, track_id, position, custom_title) VALUES (?, ?, ?, ?)`,
      [playlist_id, track_id, finalPosition, custom_title || null]
    );

    res.json({ success: true, position: finalPosition });
  } catch (error) {
    console.error('❌ Failed to add track to playlist:', error);
    res.status(500).json({ error: 'Failed to add track to playlist' });
  }
});

// Route: Update track custom title
router.put('/playlist_tracks/:playlist_id/:track_id', async (req, res) => {
  const { playlist_id, track_id } = req.params;
  const { custom_title } = req.body;
  try {
    await dbRun(
      `UPDATE playlist_tracks SET custom_title = ? WHERE playlist_id = ? AND track_id = ?`,
      [custom_title || null, playlist_id, track_id]
    );
    res.json({ success: true });
  } catch (error) {
    console.error('❌ Failed to update track custom title:', error);
    res.status(500).json({ error: 'Failed to update track custom title' });
  }
});

// Route: Remove track from playlist
router.delete('/playlist_tracks', async (req, res) => {
  const { playlist_id, track_id } = req.body;
  if (!playlist_id || !track_id) {
    return res.status(400).json({ error: 'Missing playlist_id or track_id' });
  }
  try {
    await db.serialize(async () => {
      await dbRun(`BEGIN TRANSACTION`, []);

      // Get the position of the track being deleted
      const track = await dbGet(
        `SELECT position FROM playlist_tracks WHERE playlist_id = ? AND track_id = ?`,
        [playlist_id, track_id]
      );
      if (!track) {
        throw new Error('Track not found in playlist');
      }
      const position = track.position;

      // Delete track from playlist
      await dbRun(
        `DELETE FROM playlist_tracks WHERE playlist_id = ? AND track_id = ?`,
        [playlist_id, track_id]
      );

      // Reorder positions
      await dbRun(
        `UPDATE playlist_tracks SET position = position - 1 WHERE playlist_id = ? AND position > ?`,
        [playlist_id, position]
      );

      await dbRun(`COMMIT`, []);
    });

    res.json({ success: true });
  } catch (error) {
    await dbRun(`ROLLBACK`, []);
    console.error('❌ Failed to remove track from playlist:', error);
    res.status(500).json({ error: 'Failed to remove track from playlist' });
  }
});

// Route: Upload playlist cover
router.post('/playlists/:id/cover', async (req, res) => {
  const { id } = req.params;
  if (!req.files || !req.files.cover) {
    return res.status(400).json({ error: 'No cover image provided' });
  }

  const cover = req.files.cover;
  const uploadDir = path.join(MUSIC_DIR, 'playlists');
  const fileName = `playlist_${id}_${Date.now()}.${cover.name.split('.').pop()}`;
  const filePath = path.join(uploadDir, fileName);

  try {
    fs.mkdirSync(uploadDir, { recursive: true });

    await new Promise((resolve, reject) => {
      cover.mv(filePath, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    await dbRun(
      `UPDATE playlists SET cover_path = ? WHERE id = ?`,
      [filePath, id]
    );
    res.json({ success: true, cover_path: filePath });
  } catch (error) {
    console.error('❌ Failed to upload cover:', error);
    res.status(500).json({ error: 'Failed to upload cover' });
  }
});

// Route: Serve playlist cover
router.get('/playlists/:id/cover', async (req, res) => {
  const { id } = req.params;
  try {
    const row = await dbGet(`SELECT cover_path FROM playlists WHERE id = ?`, [id]);
    if (!row?.cover_path) {
      console.warn(`⚠️ No cover path found for playlist ${id}`);
      return res.sendFile(DEFAULT_COVER);
    }

    const coverPath = row.cover_path;
    const fullPath = path.isAbsolute(coverPath)
      ? coverPath
      : path.join(__dirname, '../', coverPath);

    await new Promise((resolve, reject) => {
      fs.access(fullPath, fs.constants.F_OK, (fsErr) => {
        if (fsErr) {
          console.warn(`⚠️ Cover not found at path: ${fullPath}`);
          reject(fsErr);
        } else {
          resolve();
        }
      });
    });
    res.sendFile(fullPath);
  } catch (err) {
    console.warn(`⚠️ Error serving cover for playlist ${id}:`, err);
    res.sendFile(DEFAULT_COVER);
  }
});

// Route: Associate label with playlist
router.post('/playlist_labels', async (req, res) => {
  const { playlist_id, label_id } = req.body;
  if (!playlist_id || !label_id) {
    return res.status(400).json({ error: 'Missing playlist_id or label_id' });
  }
  try {
    await dbRun(
      `INSERT INTO playlist_labels (playlist_id, label_id) VALUES (?, ?) ON CONFLICT DO NOTHING`,
      [playlist_id, label_id]
    );
    res.json({ success: true });
  } catch (error) {
    console.error('❌ Failed to associate label with playlist:', error);
    res.status(500).json({ error: 'Failed to associate label' });
  }
});

// Route: Remove label from playlist
router.delete('/playlist_labels', async (req, res) => {
  const { playlist_id, label_id } = req.body;
  if (!playlist_id || !label_id) {
    return res.status(400).json({ error: 'Missing playlist_id or label_id' });
  }
  try {
    await dbRun(
      `DELETE FROM playlist_labels WHERE playlist_id = ? AND label_id = ?`,
      [playlist_id, label_id]
    );
    // Clean up unused labels
    await dbRun(
      `DELETE FROM labels WHERE id NOT IN (
        SELECT label_id FROM album_labels
        UNION
        SELECT label_id FROM track_labels
        UNION
        SELECT label_id FROM playlist_labels
      )`,
      []
    );
    res.json({ success: true });
  } catch (error) {
    console.error('❌ Failed to remove label from playlist:', error);
    res.status(500).json({ error: 'Failed to remove label' });
  }
});

// Route: Get playlist labels
router.get('/playlist_labels/:playlist_id', async (req, res) => {
  const { playlist_id } = req.params;
  try {
    const labels = await dbAll(
      `SELECT l.id, l.name FROM labels l JOIN playlist_labels pl ON l.id = pl.label_id WHERE pl.playlist_id = ?`,
      [playlist_id]
    );
    res.json({ labels });
  } catch (error) {
    console.error('❌ Failed to fetch playlist labels:', error);
    res.status(500).json({ error: 'Failed to fetch playlist labels' });
  }
});

module.exports = router;