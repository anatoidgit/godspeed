const express = require('express');
const router = express.Router();
const { dbAll } = require('./dbUtils');

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

module.exports = router;