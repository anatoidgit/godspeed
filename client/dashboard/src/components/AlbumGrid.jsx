import { useNavigate, useLocation } from "react-router-dom";
import { useEffect, useState } from 'react';
import { useAudioStore } from '../stores/useAudioStore';
import "./albumgrid.css";
import { FaPlay, FaRandom } from "react-icons/fa";

function AlbumGrid() {
  const navigate = useNavigate();
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const sortType = params.get("sort") || "az";
  const { playQueue } = useAudioStore();
  const [albums, setAlbums] = useState([]);

  useEffect(() => {
    fetch('/godspeed/albums')
      .then(res => res.json())
      .then(data => {
        setAlbums(data);
      })
      .catch(err => console.error('❌ Failed to fetch albums:', err));
  }, []);

  const sortedAlbums = [...albums].sort((a, b) => {
    const aTitle = a.title.toLowerCase();
    const bTitle = b.title.toLowerCase();
    if (sortType === "az") return aTitle.localeCompare(bTitle);
    if (sortType === "za") return bTitle.localeCompare(aTitle);
    if (sortType === "random") return Math.random() - 0.5;
    return 0;
  });

  const goToAlbum = (title) => {
    navigate(`/album?album=${encodeURIComponent(title)}`);
  };

  const goToArtist = (e, artist) => {
    e.stopPropagation();
    navigate(`/artist?artist=${encodeURIComponent(artist)}`);
  };

  const goToYear = (e, year) => {
    e.stopPropagation();
    navigate(`/year?year=${encodeURIComponent(year)}`);
  };

  const handlePlayAlbum = async (album) => {
    const groupId = Math.random().toString(36).substr(2, 9);
    const tracksRes = await fetch(`/godspeed/tracks?album_id=${album.id}`);
    if (!tracksRes.ok) {
      console.error('❌ Failed to fetch tracks for album:', album.id);
      return;
    }
    const albumTracks = await tracksRes.json();
    const formattedTracks = albumTracks.map(track => ({
      id: track.id,
      title: track.title,
      artist: track.album_artist || album.album_artist || 'Unknown Artist',
      album: album.title,
      year: track.year || album.year || 'Unknown Year',
      duration: track.duration,
      audioSrc: `/godspeed/track/${track.id}/play`,
      albumCover: `/godspeed/album/${album.id}/cover`,
      waveformImage: track.waveform_path || "/waveforms/default.webp",
      codec: track.codec,
      bitrate: track.bitrate,
      fileSize: track.file_size,
      groupId,
    }));
    console.log('Playing album:', album.title, formattedTracks);
    playQueue(formattedTracks, 0);
  };

  const handleShuffleAlbum = async (album) => {
    const groupId = Math.random().toString(36).substr(2, 9);
    const tracksRes = await fetch(`/godspeed/tracks?album_id=${album.id}`);
    if (!tracksRes.ok) {
      console.error('❌ Failed to fetch tracks for album:', album.id);
      return;
    }
    const albumTracks = await tracksRes.json();
    const shuffledTracks = [...albumTracks].sort(() => Math.random() - 0.5);
    const formattedTracks = shuffledTracks.map(track => ({
      id: track.id,
      title: track.title,
      artist: track.album_artist || album.album_artist || 'Unknown Artist',
      album: album.title,
      year: track.year || album.year || 'Unknown Year',
      duration: track.duration,
      audioSrc: `/godspeed/track/${track.id}/play`,
      albumCover: `/godspeed/album/${album.id}/cover`,
      waveformImage: track.waveform_path || "/waveforms/default.webp",
      codec: track.codec,
      bitrate: track.bitrate,
      fileSize: track.file_size,
      groupId,
    }));
    console.log('Shuffling album:', album.title, formattedTracks);
    playQueue(formattedTracks, 0);
  };

  return (
    <div className="album-grid" id="albumContainer">
      {sortedAlbums.map((album) => (
        <div
          key={album.id}
          className="card"
          onClick={() => goToAlbum(album.title)}
          data-title={album.title}
          data-artist={album.album_artist}
        >
          <div className="album-image-wrapper">
            <img
              src={`/godspeed/album/${album.id}/thumb`}
              alt={`Cover for ${album.title}`}
              onError={(e) => {
                e.target.src = '/placeholder-cover.jpg';
                e.target.onerror = null;
              }}
            />
          </div>
          <div className="card-info">
            <div>
              <div className="card-title">{album.title}</div>
              <div
                className="card-artist clickable"
                onClick={(e) => goToArtist(e, album.album_artist || 'Unknown Artist')}
              >
                {album.album_artist || 'Unknown Artist'}
              </div>
              <div
                className="card-meta clickable"
                onClick={(e) => goToYear(e, album.year)}
              >
                Year: {album.year || '—'}
              </div>
            </div>
            <div className="card-buttons">
              <button
                className="card-action-button"
                onClick={(e) => {
                  e.stopPropagation();
                  handlePlayAlbum(album);
                }}
              >
                <FaPlay /> Play
              </button>
              <button
                className="card-action-button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleShuffleAlbum(album);
                }}
              >
                <FaRandom /> Shuffle
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default AlbumGrid;