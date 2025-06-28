import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import "./artistpage.css";
import lastfmIcon from "./last_ico.ico";

function useQuery() {
  const { search } = useLocation();
  return new URLSearchParams(search);
}

function ArtistPage() {
  const query = useQuery();
  const artistName = query.get("artist") || "Unknown Artist";
  const navigate = useNavigate();

  const [albums, setAlbums] = useState([]);
  const [hoverCover, setHoverCover] = useState(null);
  const [mouse, setMouse] = useState({ x: 0, y: 0 });

  useEffect(() => {
    fetch("/godspeed/albums")
      .then(res => res.json())
      .then(data => {
        console.log("Fetched albums:", data); // ✅ Add this
        const filtered = data.filter(album =>
          album.album_artist?.toLowerCase() === artistName.toLowerCase()
        );
        console.log("Filtered albums:", filtered); // ✅ Add this too
        // For each album, fetch tracks to get song count & size
        Promise.all(
          filtered.map(async album => {
            const res = await fetch(`/godspeed/tracks?album_id=${album.id}`);
            const tracks = await res.json();
            const totalSize = tracks.reduce((acc, t) => acc + (t.file_size || 0), 0);
            return {
              ...album,
              songCount: tracks.length,
              totalSizeMB: Math.round(totalSize / 1024 / 1024)
            };
          })
        ).then(setAlbums);
      })
      .catch(err => console.error("Failed to fetch albums or tracks:", err));
  }, [artistName]);

  useEffect(() => {
    const move = (e) => setMouse({ x: e.clientX, y: e.clientY });
    window.addEventListener("mousemove", move);
    return () => window.removeEventListener("mousemove", move);
  }, []);

  return (
    <div className="main-content artist-list-section">
      <div className="artist-container">
        <div className="artist-header">
          <div className="artist-name-block">
            <h2>{artistName}</h2>
            <a
              href={`https://www.last.fm/music/${encodeURIComponent(artistName)}`}
              target="_blank"
              rel="noopener noreferrer"
              title="View on Last.fm"
            >
              <img src={lastfmIcon} alt="Last.fm" className="lastfm-icon" />
            </a>
          </div>
        </div>

        <div className="albums-header">
          <div>Album</div>
          <div>Year</div>
          <div>Songs</div>
          <div>Size</div>
          <div>Plays</div>
        </div>

        <div className="album-list">
          {albums.map((album) => (
            <div
              key={album.id}
              className="album-row"
              onClick={() => navigate(`/album?album=${encodeURIComponent(album.title)}`)}
              onMouseMove={() =>
                setHoverCover(`/godspeed/album/${album.id}/cover`)
              }
              onMouseLeave={() => setHoverCover(null)}
            >
              <div>{album.title}</div>
              <div>{album.year}</div>
              <div>{album.songCount}</div>
              <div>{album.totalSizeMB} MB</div>
              <div>{album.plays?.toLocaleString?.() ?? "—"}</div>
            </div>
          ))}
        </div>
      </div>

      {hoverCover && (
        <div
          className="floating-preview"
          style={{
            top: `${mouse.y + 20}px`,
            left: `${mouse.x + 20}px`,
            display: "block",
          }}
        >
          <img src={hoverCover} alt="Preview" />
        </div>
      )}
    </div>
  );
}

export default ArtistPage;
