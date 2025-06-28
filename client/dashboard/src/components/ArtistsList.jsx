import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import "./artistslist.css";

function ArtistsList() {
  const [artists, setArtists] = useState([]);
  const [sortKey, setSortKey] = useState("name");
  const [ascending, setAscending] = useState(true);
  const navigate = useNavigate();

  // ✅ Fetch from updated backend route
  useEffect(() => {
    fetch("/godspeed/artists")
      .then(res => res.json())
      .then(data => {
        const enriched = data.map(artist => ({
          ...artist,
          albums: artist.albums || [],
          songs: artist.songs || 0,
          plays: artist.plays || 0
        }));
        setArtists(enriched);
      })
      .catch(err => {
        console.error("❌ Failed to fetch artists:", err);
      });
  }, []);

  const sortedArtists = [...artists].sort((a, b) => {
    const valA = a[sortKey];
    const valB = b[sortKey];
    if (typeof valA === "string") {
      return ascending ? valA.localeCompare(valB) : valB.localeCompare(valA);
    }
    return ascending ? valA - valB : valB - valA;
  });

  const handleSort = (key) => {
    if (sortKey === key) {
      setAscending(!ascending);
    } else {
      setSortKey(key);
      setAscending(true);
    }
  };

  return (
    <div className="main-content artist-list-section">
      <div className="artists-container">
        <div className="artists-header">
          <div data-sort="name" onClick={() => handleSort("name")}>Artist</div>
          <div data-sort="albums" onClick={() => handleSort("albums")}>Albums</div>
          <div data-sort="songs" onClick={() => handleSort("songs")}>Songs</div>
          <div data-sort="plays" onClick={() => handleSort("plays")}>Plays</div>
        </div>
        <div className="artists-list">
          {sortedArtists.map((artist, idx) => (
            <div
              key={idx}
              className="artist-row"
              onClick={() =>
                navigate(`/artist?artist=${encodeURIComponent(artist.name)}`)
              }
            >
              <div>{artist.name}</div>
              <div>{artist.albums?.length ?? 0}</div>
              <div>{artist.songs}</div>
              <div>{artist.plays.toLocaleString()}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default ArtistsList;
