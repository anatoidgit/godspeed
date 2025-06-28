import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { FaBars, FaArrowLeft, FaArrowRight } from "react-icons/fa";
import AdvancedVolumeControl from "../components/AdvancedVolumeControl"; // adjust path if needed
import "./sidebar.css";

function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  // Collapse on window resize
  useEffect(() => {
    const handleResize = () => {
      const isNarrow = window.innerWidth < 768;
      setCollapsed(isNarrow);
      localStorage.setItem("sidebarCollapsed", isNarrow);
    };

    const stored = localStorage.getItem("sidebarCollapsed") === "true";
    if (window.innerWidth >= 768) setCollapsed(stored);
    else setCollapsed(true);

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    localStorage.setItem("sidebarCollapsed", collapsed);
  }, [collapsed]);

  const handleSort = (sortType) => {
    const searchParams = new URLSearchParams({ sort: sortType });
    navigate(`/?${searchParams.toString()}`);
  };

  const handleShowAll = () => {
    navigate("/", { replace: location.pathname === "/" });
  };

  // Determine active category based on current path
  const isActive = (path) => location.pathname === path;

  return (
    <div className={`sidebar ${collapsed ? "collapsed" : ""}`}>
      <div className="sidebar-header">
        <h1 id="logo">Godspeed</h1>
        <div className="navi-block">
          <div className="nav-controls">
            <button title="Back" onClick={() => window.history.back()}>
              <FaArrowLeft size={14} />
            </button>
            <button title="Forward" onClick={() => window.history.forward()}>
              <FaArrowRight size={14} />
            </button>
          </div>

          <button
            id="toggleSidebar"
            onClick={() => setCollapsed(!collapsed)}
            title="Toggle Sidebar"
          >
            <FaBars size={14} />
          </button>
        </div>
      </div>

      {collapsed ? (
        <div className="collapsed-menu">
          <button
            className={`category ${isActive("/playlists") ? "active" : ""}`}
            onClick={() => navigate("/playlists")}
            title="Playlists"
          >
            📜
          </button>
          <button
            className={`category ${isActive("/artists") ? "active" : ""}`}
            onClick={() => navigate("/artists")}
            title="Artists"
          >
            🎤
          </button>
          <button
            className={`category ${isActive("/timewrap") ? "active" : ""}`}
            onClick={() => navigate("/timewrap")}
            title="Timewrap"
          >
            ⏰
          </button>
          <button
            className={`category ${isActive("/favorites") ? "active" : ""}`}
            onClick={() => navigate("/favorites")}
            title="Favorites"
          >
            ❤️
          </button>
          <button
            className={`category ${isActive("/labels") ? "active" : ""}`}
            onClick={() => navigate("/labels")}
            title="Labels"
          >
            🏷️
          </button>
          <button
            className={`category ${isActive("/scan") ? "active" : ""}`}
            onClick={() => navigate("/scan")}
            title="Scan"
          >
            🔍
          </button>
          <button
            className={`category ${isActive("/info") ? "active" : ""}`}
            onClick={() => navigate("/info")}
            title="Info"
          >
            ℹ️
          </button>
        </div>
      ) : (
        <>
          <input type="text" placeholder="Search..." />

          <div className="sort-controls">
            <button id="showAllBtn" onClick={handleShowAll}>
              All
            </button>
            <div className="sort-dropdown-wrapper">
              <button id="sortBtn">Sort By ▾</button>
              <div className="dropdown-menu" id="sortMenu">
                <button onClick={() => handleSort("az")}>A–Z</button>
                <button onClick={() => handleSort("za")}>Z–A</button>
                <button onClick={() => handleSort("random")}>Random</button>
              </div>
            </div>
          </div>

          <div className="category-block">
            <div
              className={`category ${isActive("/artists") ? "active" : ""}`}
              onClick={() => navigate("/artists")}
            >
              Artists
            </div>
            <div
              className={`category ${isActive("/timewrap") ? "active" : ""}`}
              onClick={() => navigate("/timewrap")}
            >
              Timewrap
            </div>
            <div
              className={`category ${isActive("/playlists") ? "active" : ""}`}
              onClick={() => navigate("/playlists")}
            >
              Playlists
            </div>
            <div
              className={`category ${isActive("/favorites") ? "active" : ""}`}
              onClick={() => navigate("/favorites")}
            >
              Favorites
            </div>
          </div>

          <div className="sort-controls">
            <button
              id="scanBtn"
              className={isActive("/labels") ? "active" : ""}
              onClick={() => navigate("/labels")}
            >
              Labels
            </button>
          </div>
          <div className="sort-controls">
            <button
              id="scanBtn"
              className={isActive("/charts") ? "active" : ""}
              onClick={() => navigate("/charts")}
            >
              Charts
            </button>
          </div>
          <div className="sort-controls">
            <button
              id="showAllBtn"
              className={isActive("/scan") ? "active" : ""}
              onClick={() => navigate("/scan")}
            >
              Scan
            </button>
            <button
              id="scanBtn"
              className={isActive("/info") ? "active" : ""}
              onClick={() => navigate("/info")}
            >
              Info
            </button>
          </div>
          <div className="volume-control-wrapper">
            <AdvancedVolumeControl />
          </div>
        </>
      )}
    </div>
  );
}

export default Sidebar;