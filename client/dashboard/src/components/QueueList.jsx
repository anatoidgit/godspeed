import React, { useRef, useEffect, useState } from 'react';
import { useAudioStore } from "../stores/useAudioStore";
import "./QueueList.css";

function QueueList() {
  const {
    queue,
    currentTrackId,
    currentIndex,
    playTrack,
    setCurrentIndexDirect,
    reorderQueue,
    removeTrack,
  } = useAudioStore();

  const [expandedAlbums, setExpandedAlbums] = useState({});
  const [dragOverIndex, setDragOverIndex] = useState(null);
  const [draggingItem, setDraggingItem] = useState(null);
  const cellRefs = useRef([]);
  const animationRefs = useRef([]);

  useEffect(() => {
    return () => {
      animationRefs.current.forEach(raf => cancelAnimationFrame(raf));
    };
  }, []);

  const resetScrollPosition = (cell) => {
    const content = cell.querySelector('.queue-cell-content');
    if (content) {
      content.style.transform = 'translateX(0)';
    }
  };

  const handleJumpTo = (index) => (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (!queue[index] || !queue[index].audioSrc) {
      console.error("Invalid track or audioSrc at index:", index, queue[index]);
      return;
    }
    console.log("Jumping to track:", queue[index], "at index:", index);
    setCurrentIndexDirect(index);
    playTrack(queue[index], index);
  };

  const handleJumpToAlbum = (groupKey) => (event) => {
    event.preventDefault();
    event.stopPropagation();
    const firstTrackIndex = queue.findIndex(track => {
      const key = track.groupId ? `${track.album}|${track.artist}|${track.groupId}` : `__single__${track.queueIndex}`;
      return key === groupKey;
    });
    if (firstTrackIndex === -1 || !queue[firstTrackIndex] || !queue[firstTrackIndex].audioSrc) {
      console.error("No valid tracks found for group:", groupKey, "at index:", firstTrackIndex);
      return;
    }
    console.log("Jumping to album:", groupKey, "first track at index:", firstTrackIndex, queue[firstTrackIndex]);
    setCurrentIndexDirect(firstTrackIndex);
    playTrack(queue[firstTrackIndex], firstTrackIndex);
  };

  const toggleAlbumExpand = (albumKey) => (event) => {
    event.stopPropagation();
    console.log("Toggling album expansion:", albumKey, "Current state:", expandedAlbums[albumKey] ? "expanded" : "collapsed");
    setExpandedAlbums(prev => {
      const newState = { ...prev, [albumKey]: !prev[albumKey] };
      console.log("New expandedAlbums state:", newState);
      return newState;
    });
  };

  const handleRemoveTrack = (queueUid) => (event) => {
    event.preventDefault();
    event.stopPropagation();
    console.log("Removing track with queueUid:", queueUid, "Track:", queue.find(track => track.queueUid === queueUid));
    removeTrack(queueUid);
  };

  const handleDragStart = (index, groupKey = null) => (event) => {
    event.dataTransfer.setData('application/json', JSON.stringify({ index, groupKey, isGroup: !index && !!groupKey }));
    event.dataTransfer.effectAllowed = 'move';
    setDraggingItem({ index, groupKey });
    console.log("Drag started:", { index, groupKey, isGroup: !index && !!groupKey });
  };

  const handleDragOver = (event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  };

  const handleDragEnter = (index, groupKey = null) => (event) => {
    event.preventDefault();
    setDragOverIndex({ index, groupKey });
  };

  const handleDragLeave = () => {
    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    setDraggingItem(null);
  };

  const handleDrop = (targetIndex, targetGroupKey = null) => (event) => {
    event.preventDefault();
    event.stopPropagation();
    setDragOverIndex(null);
    setDraggingItem(null);

    const data = JSON.parse(event.dataTransfer.getData('application/json'));
    const { index: sourceIndex, groupKey: sourceGroupKey, isGroup } = data;
    console.log("Dropped:", { sourceIndex, sourceGroupKey, isGroup, targetIndex, targetGroupKey });

    if ((sourceIndex === targetIndex && sourceGroupKey === targetGroupKey) || (isGroup && targetGroupKey === sourceGroupKey)) return;

    reorderQueue(sourceIndex, sourceGroupKey, targetIndex, targetGroupKey, isGroup);
  };

  const groupedQueue = queue.reduce((acc, track, idx) => {
    if (!track || !track.id) {
      console.warn("Skipping invalid track at index:", idx, track);
      return acc;
    }

    const albumKey = track.groupId ? `${track.album}|${track.artist}|${track.groupId}` : `__single__${idx}`;
    if (!acc[albumKey]) acc[albumKey] = [];
    acc[albumKey].push({ ...track, queueIndex: idx });
    return acc;
  }, {});

  const animateOnHover = (index, subIndex, refIndex) => (e) => {
    const cell = e.currentTarget;
    const content = cell.querySelector('.queue-cell-content');
    if (content && content.scrollWidth > cell.offsetWidth) {
      const distance = content.scrollWidth - cell.offsetWidth;
      let start = null;

      const animate = (timestamp) => {
        if (!start) start = timestamp;
        const progress = timestamp - start;
        const percentage = Math.min(progress / 8000, 1);
        content.style.transform = `translateX(-${percentage * distance}px)`;
        if (percentage < 1) {
          animationRefs.current[refIndex] = requestAnimationFrame(animate);
        }
      };

      animationRefs.current[refIndex] = requestAnimationFrame(animate);
    }
  };

  const stopHover = (refIndex) => (e) => {
    cancelAnimationFrame(animationRefs.current[refIndex]);
    resetScrollPosition(e.currentTarget);
  };

  return (
    <div className="queue-list-section">
      <div className="queue-container">
        <div className="queue-header">
          <div>Title</div>
          <div>Artist</div>
          <div>Album</div>
          <div>Year</div>
        </div>
        <div className="queue-list">
          {queue.length === 0 ? (
            <div className="queue-empty">Queue is empty</div>
          ) : (
            Object.entries(groupedQueue).map(([groupKey, tracks], groupIndex) => {
              const parts = groupKey.split('|');
              const isGrouped = !groupKey.startsWith("__single__");
              const albumName = parts[0] || "Unknown Album";
              const artistName = parts[1] || "Unknown Artist";
              const isExpanded = expandedAlbums[groupKey] ?? false;
              const groupYear = tracks[0]?.year ?? "—";

              const currentTrackInGroup = tracks.find(t => t.queueUid === currentTrackId);
              const isGroupActive = !!currentTrackInGroup;

              const displayTitle = isGroupActive ? currentTrackInGroup.title : "—";

              return (
                <div key={groupKey} className="queue-group">
                  {isGrouped && (
                    <div
                      className={`queue-row queue-group-header ${isGroupActive ? 'active' : ''} ${
                        dragOverIndex?.groupKey === groupKey ? 'drag-over' : ''
                      } ${draggingItem?.groupKey === groupKey ? 'dragging' : ''}`}
                      draggable={!isExpanded}
                      onDragStart={handleDragStart(null, groupKey)}
                      onDragOver={handleDragOver}
                      onDragEnter={handleDragEnter(null, groupKey)}
                      onDragLeave={handleDragLeave}
                      onDragEnd={handleDragEnd}
                      onDrop={handleDrop(null, groupKey)}
                      onClick={toggleAlbumExpand(groupKey)}
                      onDoubleClick={handleJumpToAlbum(groupKey)}
                    >
                      <div className="queue-cell">
                        <span className="queue-cell-content">{displayTitle}</span>
                      </div>
                      <div className="queue-cell">
                        <span className="queue-cell-content">{artistName}</span>
                      </div>
                      <div className="queue-cell">
                        <span className="queue-cell-content">{albumName}</span>
                      </div>
                      <div className="queue-cell">
                        <span className="queue-cell-content">{groupYear}</span>
                        <span className="expand-toggle">{isExpanded ? '▾' : '▸'}</span>
                      </div>
                    </div>
                  )}

                  {(isGrouped ? isExpanded : true) &&
                    tracks.map((track, i) => {
                      const index = track.queueIndex;
                      const isActive = index === currentIndex;
                      const baseRef = (groupIndex * 100) + i * 3;

                      return (
                        <div
                          key={track.queueUid || `${track.id}-${index}`}
                          className={`queue-row ${isActive ? "active" : ""} ${isGrouped ? "grouped-track" : ""} ${
                            dragOverIndex?.index === index && dragOverIndex?.groupKey === null ? 'drag-over' : ''
                          } ${draggingItem?.index === index && draggingItem?.groupKey === (isGrouped ? groupKey : null) ? 'dragging' : ''}`}
                          draggable
                          onDragStart={handleDragStart(index, isGrouped ? groupKey : null)}
                          onDragOver={handleDragOver}
                          onDragEnter={handleDragEnter(index)}
                          onDragLeave={handleDragLeave}
                          onDragEnd={handleDragEnd}
                          onDrop={handleDrop(index)}
                          onClick={handleJumpTo(index)}
                        >
                          {[track.title, track.artist, track.album].map((text, j) => (
                            <div
                              key={j}
                              className="queue-cell"
                              ref={el => cellRefs.current[baseRef + j] = el}
                              onMouseEnter={animateOnHover(index, i, baseRef + j)}
                              onMouseLeave={stopHover(baseRef + j)}
                            >
                              <span className="queue-cell-content">{text || "—"}</span>
                            </div>
                          ))}
                          <div className="queue-cell queue-cell-actions">
                            <span className="queue-cell-content">{track.year ?? "—"}</span>
                            <button
                              className="remove-track-button"
                              onClick={handleRemoveTrack(track.queueUid)}
                              title="Remove track from queue"
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                      );
                    })}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

export default QueueList;