import React, { createContext, useContext, useEffect, useRef, useState } from "react";

const AudioContext = createContext();
export const useAudio = () => useContext(AudioContext);

// Simple UID generator for queue entries
const generateUid = () => Math.random().toString(36).substr(2, 9);

const AudioProvider = ({ children }) => {
  const audioRef = useRef(new Audio());
  // Core playback state
  const [currentTrack, setCurrentTrack] = useState(null);
  const [currentTrackId, setCurrentTrackId] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  // Volume & pan control
  const [baseLeftVolume, setBaseLeftVolume] = useState(1);
  const [baseRightVolume, setBaseRightVolume] = useState(1);
  const [masterVolume, setMasterVolume] = useState(1);
  const [pan, setPan] = useState(0);
  const [isMono, setIsMono] = useState(false);
  // Queue state
  const [queue, setQueue] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  // Track whether the current track is single-play
  const [isSinglePlay, setIsSinglePlay] = useState(false);
  // Web Audio API
  const audioCtxRef = useRef(null);
  const sourceRef = useRef(null);
  const splitterRef = useRef(null);
  const mergerRef = useRef(null);
  const currentPlaySessionRef = useRef(null);
  const gainLtoLRef = useRef(null);
  const gainRtoRRef = useRef(null);
  const gainLtoRRef = useRef(null);
  const gainRtoLRef = useRef(null);
  const monoGainRef = useRef(null);
  const monoToLRef = useRef(null);
  const monoToRRef = useRef(null);

  const computeGains = () => {
    const master = masterVolume;
    const lBase = baseLeftVolume;
    const rBase = baseRightVolume;
    const panValue = Math.max(-1, Math.min(1, pan));

    if (isMono) {
      const monoVolume = ((lBase + rBase) / 2) * master;
      const panL = (1 - panValue) * 0.5;
      const panR = (1 + panValue) * 0.5;
      if (monoToLRef.current) monoToLRef.current.gain.value = monoVolume * panL;
      if (monoToRRef.current) monoToRRef.current.gain.value = monoVolume * panR;
    } else {
      const panL = 1 - Math.max(0, panValue);
      const panR = 1 + Math.min(0, panValue);
      if (gainLtoLRef.current) gainLtoLRef.current.gain.value = lBase * master * panL;
      if (gainRtoRRef.current) gainRtoRRef.current.gain.value = rBase * master * panR;
      if (gainLtoRRef.current) gainLtoRRef.current.gain.value = lBase * master * panR;
      if (gainRtoLRef.current) gainRtoLRef.current.gain.value = rBase * master * panL;
    }
  };

  useEffect(() => {
    const audio = audioRef.current;
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const source = audioCtx.createMediaElementSource(audio);
    const splitter = audioCtx.createChannelSplitter(2);
    const merger = audioCtx.createChannelMerger(2);

    const gainLtoL = audioCtx.createGain();
    const gainRtoR = audioCtx.createGain();
    const gainLtoR = audioCtx.createGain();
    const gainRtoL = audioCtx.createGain();

    const monoGain = audioCtx.createGain();
    const monoToL = audioCtx.createGain();
    const monoToR = audioCtx.createGain();

    source.connect(splitter);
    splitter.connect(gainLtoL, 0);
    splitter.connect(gainLtoR, 0);
    splitter.connect(gainRtoR, 1);
    splitter.connect(gainRtoL, 1);
    gainLtoL.connect(merger, 0, 0);
    gainRtoL.connect(merger, 0, 0);
    gainRtoR.connect(merger, 0, 1);
    gainLtoR.connect(merger, 0, 1);
    merger.connect(audioCtx.destination);

    audioCtxRef.current = audioCtx;
    sourceRef.current = source;
    splitterRef.current = splitter;
    mergerRef.current = merger;
    gainLtoLRef.current = gainLtoL;
    gainRtoRRef.current = gainRtoR;
    gainLtoRRef.current = gainLtoR;
    gainRtoLRef.current = gainRtoL;
    monoGainRef.current = monoGain;
    monoToLRef.current = monoToL;
    monoToRRef.current = monoToR;

    computeGains();

    return () => {
      audioCtx.close().catch(e => console.error("AudioContext close error:", e));
    };
  }, []);

  useEffect(() => {
    computeGains();
  }, [baseLeftVolume, baseRightVolume, masterVolume, pan, isMono]);

  const setMonoMode = (enabled) => {
    if (!splitterRef.current || !mergerRef.current || !audioCtxRef.current) return;

    splitterRef.current.disconnect();
    [
      gainLtoLRef, gainRtoRRef, gainLtoRRef, gainRtoLRef,
      monoGainRef, monoToLRef, monoToRRef,
    ].forEach(ref => ref.current?.disconnect());

    if (enabled) {
      splitterRef.current.connect(monoGainRef.current, 0);
      splitterRef.current.connect(monoGainRef.current, 1);
      monoGainRef.current.connect(monoToLRef.current);
      monoGainRef.current.connect(monoToRRef.current);
      monoToLRef.current.connect(mergerRef.current, 0, 0);
      monoToRRef.current.connect(mergerRef.current, 0, 1);
    } else {
      splitterRef.current.connect(gainLtoLRef.current, 0);
      splitterRef.current.connect(gainLtoRRef.current, 0);
      splitterRef.current.connect(gainRtoRRef.current, 1);
      splitterRef.current.connect(gainRtoLRef.current, 1);
      gainLtoLRef.current.connect(mergerRef.current, 0, 0);
      gainRtoLRef.current.connect(mergerRef.current, 0, 0);
      gainRtoRRef.current.connect(mergerRef.current, 0, 1);
      gainLtoRRef.current.connect(mergerRef.current, 0, 1);
    }

    setIsMono(enabled);
  };

  const formatTrack = (track, options = {}) => {
    if (!track) return null;
    return {
      id: track.id || generateUid(),
      title: track.title || "Unknown Track",
      artist: track.artist || "Unknown Artist",
      album: track.album || "Unknown Album",
      year: track.year || "Unknown Year",
      duration: track.duration || 0,
      audioSrc: track.audioSrc,
      albumCover: track.albumCover,
      waveformImage: track.waveformImage || "/waveforms/default.webp",
      codec: track.codec,
      bitrate: track.bitrate,
      fileSize: track.fileSize,
      queueUid: track.queueUid || generateUid(),
      groupId: track.groupId || options.groupId || null,
      playSingle: track.playSingle || false,
    };
  };

  const playTrack = async (track, index = null) => {
    const formattedTrack = formatTrack(track);
    if (!formattedTrack?.audioSrc) {
      console.error("No audioSrc provided for track:", track);
      return;
    }

    try {
      const audio = audioRef.current;
      audio.pause();
      const sessionId = generateUid();

      currentPlaySessionRef.current = {
        id: sessionId,
        playCounted: false,
      };

      const existingIndex = queue.findIndex(t => t.id === formattedTrack.id && t.queueUid === formattedTrack.queueUid);
      if (existingIndex !== -1 && index !== null) {
        setCurrentIndex(index);
        setIsSinglePlay(formattedTrack.playSingle);
      } else if (formattedTrack.playSingle) {
        setQueue([formattedTrack]);
        setCurrentIndex(0);
        setIsSinglePlay(true);
      } else {
        setIsSinglePlay(false);
        setQueue(prev => {
          const exists = prev.some(t => t.id === formattedTrack.id && t.queueUid === formattedTrack.queueUid);
          if (!exists) {
            return [...prev, formattedTrack];
          }
          return prev;
        });
        setCurrentIndex(index !== null ? index : queue.length);
      }

      audio.src = formattedTrack.audioSrc;
      await audio.play().catch(error => {
        console.error("Autoplay prevented:", error);
        setIsPlaying(false);
      });

      setCurrentTrack(formattedTrack);
      setCurrentTrackId(formattedTrack.queueUid);
      setIsPlaying(true);
    } catch (error) {
      console.error("Error playing track:", error);
      setIsPlaying(false);
    }
  };

  const playQueue = (trackList, startIndex = 0, options = {}) => {
    if (!Array.isArray(trackList) || trackList.length === 0) return;

    const formattedQueue = trackList
      .map(track => formatTrack(track, { groupId: track.groupId || null }))
      .filter(track => track?.audioSrc);

    if (formattedQueue.length === 0) return;

    const safeIndex = Math.max(0, Math.min(startIndex, formattedQueue.length - 1));
    const startTrack = formattedQueue[safeIndex];

    setQueue(formattedQueue);
    setCurrentIndex(safeIndex);
    setIsSinglePlay(false);
    setCurrentTrack(startTrack);
    setCurrentTrackId(startTrack.queueUid);

    const audio = audioRef.current;
    audio.pause();
    audio.src = startTrack.audioSrc;
    audio.play().catch(error => {
      console.error("Autoplay prevented:", error);
      setIsPlaying(false);
    });
    setIsPlaying(true);
  };

  const reorderQueue = (sourceIndex, sourceGroupKey, targetIndex, targetGroupKey, isGroup) => {
    setQueue(prev => {
      const newQueue = [...prev];

      if (isGroup && sourceGroupKey && targetGroupKey) {
        // Reordering groups
        const grouped = prev.reduce((acc, track, idx) => {
          const key = track.groupId ? `${track.album}|${track.artist}|${track.groupId}` : `__single__${idx}`;
          if (!acc[key]) acc[key] = [];
          acc[key].push({ ...track, queueIndex: idx });
          return acc;
        }, {});

        const sourceGroup = grouped[sourceGroupKey];
        const targetGroup = grouped[targetGroupKey];
        if (!sourceGroup || !targetGroup) return prev;

        const sourceStartIndex = sourceGroup[0].queueIndex;
        const targetStartIndex = targetGroup[0].queueIndex;
        const sourceTracks = sourceGroup.map(t => ({ ...t, queueIndex: undefined }));

        newQueue.splice(sourceStartIndex, sourceGroup.length);

        const adjustedTargetIndex = targetStartIndex > sourceStartIndex
          ? targetStartIndex - sourceGroup.length
          : targetStartIndex;

        newQueue.splice(adjustedTargetIndex, 0, ...sourceTracks);

        if (currentIndex >= sourceStartIndex && currentIndex < sourceStartIndex + sourceGroup.length) {
          const offset = currentIndex - sourceStartIndex;
          setCurrentIndex(adjustedTargetIndex + offset);
        } else if (currentIndex >= adjustedTargetIndex && currentIndex < sourceStartIndex) {
          setCurrentIndex(currentIndex + sourceGroup.length);
        } else if (currentIndex >= sourceStartIndex && currentIndex < adjustedTargetIndex) {
          setCurrentIndex(currentIndex - sourceGroup.length);
        }
      } else if (sourceIndex !== null && targetIndex !== null) {
        // Reordering single track, possibly out of a group
        const movedTrack = { ...newQueue[sourceIndex], groupId: targetGroupKey ? newQueue[targetIndex].groupId : null };
        newQueue.splice(sourceIndex, 1);

        const adjustedTargetIndex = targetIndex > sourceIndex ? targetIndex - 1 : targetIndex;
        newQueue.splice(adjustedTargetIndex, 0, movedTrack);

        if (currentIndex === sourceIndex) {
          setCurrentIndex(adjustedTargetIndex);
        } else if (currentIndex >= sourceIndex && currentIndex < adjustedTargetIndex) {
          setCurrentIndex(currentIndex - 1);
        } else if (currentIndex >= adjustedTargetIndex && currentIndex < sourceIndex) {
          setCurrentIndex(currentIndex + 1);
        }
      }

      console.log("Reordered queue:", newQueue);
      return newQueue;
    });
  };

  const playNextInQueue = (loop = true) => {
    if (queue.length === 0 || isSinglePlay) {
      setIsPlaying(false);
      setProgress(0);
      setCurrentTrack(null);
      setCurrentTrackId(null);
      setQueue([]);
      return;
    }

    const nextIndex = currentIndex + 1;

    if (nextIndex < queue.length) {
      setCurrentIndex(nextIndex);
      playTrack(queue[nextIndex], nextIndex);
    } else if (loop) {
      const leftover = queue.slice(0, currentIndex);
      if (leftover.length > 0) {
        setQueue(leftover);
        setCurrentIndex(0);
        playTrack(leftover[0], 0);
      } else {
        setIsPlaying(false);
        setProgress(0);
        setCurrentTrack(null);
        setCurrentTrackId(null);
        setQueue([]);
      }
    } else {
      setIsPlaying(false);
      setProgress(0);
      setCurrentTrack(null);
      setCurrentTrackId(null);
      setQueue([]);
    }
  };

  const togglePlayPause = async () => {
    const audio = audioRef.current;
    if (!audio.src) return;

    try {
      if (audio.paused) {
        await audio.play();
        setIsPlaying(true);
      } else {
        audio.pause();
        setIsPlaying(false);
      }
    } catch (error) {
      console.error("Play/pause error:", error);
    }
  };

  const seekTo = (percent) => {
    const audio = audioRef.current;
    if (!audio.duration) return;

    const safePercent = Math.max(0, Math.min(1, percent));
    audio.currentTime = safePercent * audio.duration;
  };

  useEffect(() => {
    const audio = audioRef.current;

    const handleTimeUpdate = () => {
      if (!audio.duration || !currentTrack?.id) return;

      setProgress(audio.currentTime / audio.duration);

      const secondsPlayed = audio.currentTime;
      const percentPlayed = secondsPlayed / audio.duration;
      const session = currentPlaySessionRef.current;

      if (
        session &&
        !session.playCounted &&
        session.id &&
        percentPlayed >= 0.3 &&
        secondsPlayed >= 10
      ) {
        fetch("/godspeed/log_play", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ track_id: currentTrack.id }),
        }).catch(err => console.error("Failed to log play:", err));

        session.playCounted = true;
      }
    };

    const handleLoadedMetadata = () => {
      setDuration(audio.duration || 0);
    };

    const handleEnded = () => {
      const session = currentPlaySessionRef.current;

      if (
        currentTrack?.id &&
        session &&
        !session.playCounted &&
        session.id
      ) {
        fetch("/godspeed/log_play", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ track_id: currentTrack.id }),
        }).catch(err => console.error("Failed to log play on end:", err));

        session.playCounted = true;
      }

      playNextInQueue();
    };

    const handleError = () => {
      console.error("Audio playback error:", audio.error);
      playNextInQueue();
    };

    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("error", handleError);

    return () => {
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("error", handleError);
    };
  }, [queue, currentIndex, isSinglePlay]);

  const queueNext = (track) => {
    const formatted = formatTrack(track);
    setQueue(prev => {
      const index = currentIndex + 1;
      const newQueue = [...prev];
      newQueue.splice(index, 0, formatted);
      return newQueue;
    });
  };

  const queueNextBatch = async (tracks) => {
    const formatted = tracks.map(track => formatTrack(track, { groupId: track.groupId || null }));
    setQueue(prev => {
      const index = currentIndex + 1;
      const newQueue = [...prev];
      newQueue.splice(index, 0, ...formatted);
      return newQueue;
    });
  };

  const queueLater = (track) => {
    const formatted = formatTrack(track);
    setQueue(prev => [...prev, formatted]);
  };

  const clearQueue = () => {
    setQueue([]);
    setCurrentIndex(0);
  };

  return (
    <AudioContext.Provider
      value={{
        currentTrack,
        currentTrackId,
        isPlaying,
        progress,
        duration,
        isMono,
        queue,
        currentIndex,
        playTrack,
        playQueue,
        togglePlayPause,
        seekTo,
        setMono: setMonoMode,
        playNext: () => playNextInQueue(false),
        leftVolume: baseLeftVolume,
        rightVolume: baseRightVolume,
        masterVolume,
        pan,
        setBaseVolume: (l, r) => {
          setBaseLeftVolume(l);
          setBaseRightVolume(r);
        },
        setMasterVolume,
        setPan,
        clearQueue,
        getQueue: () => queue,
        getCurrentIndex: () => currentIndex,
        queueNext,
        queueNextBatch,
        queueLater,
        playTrackDirect: playTrack,
        setCurrentIndexDirect: setCurrentIndex,
        reorderQueue
      }}
    >
      {children}
    </AudioContext.Provider>
  );
};

export default AudioProvider;