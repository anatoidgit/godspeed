const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();
const { db, dbAll, dbGet, dbRun } = require('./dbUtils');
const { MUSIC_DIR } = require('../../config');

const DEFAULT_COVER = path.join(__dirname, '../static/default-cover.jpg');

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
      : path.join(MUSIC_DIR, coverPath);

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