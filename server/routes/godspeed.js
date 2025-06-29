const express = require('express');
const router = express.Router();

// Import sub-routers
const albumRoutes = require('./godspeed/albumRoutes');
const trackRoutes = require('./godspeed/trackRoutes');
const labelRoutes = require('./godspeed/labelRoutes');
const playlistRoutes = require('./godspeed/playlistRoutes');
const artistRoutes = require('./godspeed/artistRoutes');

// Mount sub-routers
router.use('/', albumRoutes);
router.use('/', trackRoutes);
router.use('/', labelRoutes);
router.use('/', playlistRoutes);
router.use('/', artistRoutes);

module.exports = router;