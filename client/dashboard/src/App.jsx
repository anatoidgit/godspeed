import { Routes, Route } from 'react-router-dom';
import Sidebar from "./components/Sidebar";
import AlbumGrid from "./components/AlbumGrid";
import ArtistsList from "./components/ArtistsList";
import ArtistPage from "./components/ArtistPage";
import AlbumPage from "./components/AlbumPage";
import YearPage from "./components/YearPage";
import PlayerFooter from "./components/PlayerFooter";
import TimeWrapPage from "./components/TimeWrapPage";
import LabelsPage from "./components/LabelsPage";
import PlaylistsPage from "./components/PlaylistsPage";
import PlaylistPage from "./components/PlaylistPage"; // New component
import "./App.css";

function App() {
  return (
    <div className="app-layout">
      <Sidebar />
      <div className="main-content">
        <Routes>
          <Route path="/" element={<AlbumGrid />} />
          <Route path="/artists" element={<ArtistsList />} />
          <Route path="/artist" element={<ArtistPage />} />
          <Route path="/album" element={<AlbumPage />} />
          <Route path="/year" element={<YearPage />} />
          <Route path="/timewrap" element={<TimeWrapPage />} />
          <Route path="/labels" element={<LabelsPage />} />
          <Route path="/playlists" element={<PlaylistsPage />} />
          <Route path="/playlists/:id" element={<PlaylistPage />} />
          <Route path="*" element={<div>404 Not Found</div>} />
        </Routes>
      </div>
      <PlayerFooter />
    </div>
  );
}

export default App;