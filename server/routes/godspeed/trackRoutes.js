const express = require('express');
const fs = require('fs');
const path = require('path');
const mime = require('mime-types');
const router = express.Router();
const { dbAll, dbGet, dbRun } = require('./dbUtils');

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

module.exports = router;