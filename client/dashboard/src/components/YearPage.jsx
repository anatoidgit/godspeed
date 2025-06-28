import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import "./albumgrid.css";
import { FaPlay, FaRandom } from "react-icons/fa";

function useQuery() {
  const { search } = useLocation();
  return new URLSearchParams(search);
}

function YearPage() {
  const query = useQuery();
  const navigate = useNavigate();
  const year = query.get("year");

  const [albums, setAlbums] = useState([]);

  useEffect(() => {
    fetch("/godspeed/albums")
      .then(res => res.json())
      .then(data => {
        const filtered = data.filter(album => String(album.year) === year);

        Promise.all(
          filtered.map(async album => {
            const res = await fetch(`/godspeed/tracks?album_id=${album.id}`);
            const tracks = await res.json();
            const totalSize = tracks.reduce((acc, t) => acc + (t.file_size || 0), 0);
            return {
              ...album,
              totalSizeMB: Math.round(totalSize / 1024 / 1024)
            };
          })
        ).then(setAlbums);
      })
      .catch(err => console.error("Failed to fetch year albums:", err));
  }, [year]);

  const readableSize = (() => {
    const totalSizeMB = albums.reduce((sum, album) => sum + (album.totalSizeMB || 0), 0);
    return totalSizeMB >= 1024
      ? (totalSizeMB / 1024).toFixed(1) + " GB"
      : Math.round(totalSizeMB) + " MB";
  })();

  const goToAlbum = (title) => {
    navigate(`/album?album=${encodeURIComponent(title)}`);
  };

  const goToArtist = (e, artist) => {
    e.stopPropagation();
    navigate(`/artist?artist=${encodeURIComponent(artist)}`);
  };

  return (
    <div className="main-content album-grid" id="albumContainer">
      {/* YEAR INFO TILE */}
      <div className="card" onClick={(e) => e.stopPropagation()}>
        <div className="album-image-wrapper">
          <img src="/img/year_tile_cover.jpg" alt={`Albums of ${year}`} />
        </div>
        <div className="card-info">
          <div>
            <div className="card-title">{year}</div>
            <div className="card-meta">{albums.length} albums released</div>
            <div className="card-meta">{readableSize} total</div>
          </div>
          <div className="card-buttons">
            <button className="card-icon-button" onClick={(e) => e.stopPropagation()}>
              <FaPlay /> Play
            </button>
            <button className="card-icon-button" onClick={(e) => e.stopPropagation()}>
              <FaRandom /> Shuffle
            </button>
          </div>
        </div>
      </div>

      {/* ALBUM CARDS */}
      {albums.map((album) => (
        <div
          key={album.id}
          className="card"
          onClick={() => goToAlbum(album.title)}
        >
          <div className="album-image-wrapper">
            <img src={`/godspeed/album/${album.id}/cover`} alt={`Cover for ${album.title}`} />
          </div>

          <div className="card-info">
            <div>
              <div className="card-title">{album.title}</div>
              <div
                className="card-artist clickable"
                onClick={(e) => goToArtist(e, album.album_artist)}
              >
                {album.album_artist}
              </div>
              <div className="card-meta">Released: {album.year}</div>
            </div>

            <div className="card-buttons">
              <button
                className="card-icon-button"
                onClick={(e) => e.stopPropagation()}
              >
                <FaPlay /> Play
              </button>
              <button
                className="card-icon-button"
                onClick={(e) => e.stopPropagation()}
              >
                <FaRandom /> Shuffle
              </button>
            </div>
          </div>
        </div>
      ))}

      {albums.length === 0 && (
        <p style={{ color: "gray", padding: "0 24px" }}>
          No albums found for {year}.
        </p>
      )}
    </div>
  );
}

export default YearPage;
