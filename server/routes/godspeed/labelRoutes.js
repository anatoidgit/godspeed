const express = require('express');
const router = express.Router();
const { dbAll, dbRun } = require('./dbUtils');

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
    console.error('❌ Failed to fetch album labels for album_id:', album_id, error);
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
    console.error('❌ Failed to fetch track labels for track_id:', track_id, error);
    res.status(500).json({ error: 'Failed to fetch track labels' });
  }
});

module.exports = router;