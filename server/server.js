const express = require('express');
const cors = require('cors');
const path = require('path');
const fileUpload = require('express-fileupload');

const app = express();
const PORT = process.env.PORT || 4001;
const staticDir = path.join(__dirname, 'static');

// ✅ Middleware
app.use(cors());
app.use(express.json());
app.use(fileUpload()); // Added for handling file uploads (e.g., playlist covers)

// ✅ API routes BEFORE static and catch-all
const godspeedRoutes = require('./routes/godspeed');
app.use('/godspeed', godspeedRoutes);

// ✅ Static files (for Vite build, etc.)
app.use(express.static(staticDir));

// ✅ Error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).send('Server Error');
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});