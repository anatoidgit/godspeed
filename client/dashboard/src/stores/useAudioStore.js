import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const generateUid = () => Math.random().toString(36).substr(2, 9);

const formatTrack = (track, options = {}) => {
  if (!track) return null;
  return {
    id: track.id || generateUid(),
    title: track.title || 'Unknown Track',
    artist: track.artist || 'Unknown Artist',
    album: track.album || 'Unknown Album',
    year: track.year || 'Unknown Year',
    duration: track.duration || 0,
    audioSrc: track.audioSrc,
    albumCover: track.albumCover,
    waveformImage: track.waveformImage || '/assets/default-waveform.png',
    codec: track.codec || 'Unknown',
    bitrate: track.bitrate || null,
    fileSize: track.fileSize || null,
    queueUid: track.queueUid || generateUid(),
    groupId: track.groupId || options.groupId || null,
    playSingle: track.playSingle || false,
  };
};

export const useAudioStore = create(
  persist(
    (set, get) => ({
      // Playback state
      currentTrack: null,
      currentTrackId: null,
      isPlaying: false,
      progress: 0,
      duration: 0,
      // Volume & pan
      baseLeftVolume: 1,
      baseRightVolume: 1,
      masterVolume: 1,
      pan: 0,
      isMono: false,
      isMuted: false,
      replayGainEnabled: false,
      // Queue
      queue: [],
      currentIndex: 0,
      isSinglePlay: false,
      // Web Audio API refs
      audioRef: null,
      audioCtxRef: null,
      sourceRef: null,
      splitterRef: null,
      mergerRef: null,
      gainLtoLRef: null,
      gainRtoRRef: null,
      gainLtoRRef: null,
      gainRtoLRef: null,
      monoGainRef: null,
      monoToLRef: null,
      monoToRRef: null,
      currentPlaySessionRef: null,

      // Actions
      initializeAudio: () => {
        if (get().audioCtxRef) {
          console.log('AudioContext already initialized, skipping.');
          return;
        }

        try {
          const audio = new Audio();
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

          set({
            audioRef: audio,
            audioCtxRef: audioCtx,
            sourceRef: source,
            splitterRef: splitter,
            mergerRef: merger,
            gainLtoLRef: gainLtoL,
            gainRtoRRef: gainRtoR,
            gainLtoRRef: gainLtoR,
            gainRtoLRef: gainRtoL,
            monoGainRef: monoGain,
            monoToLRef: monoToL,
            monoToRRef: monoToR,
            currentPlaySessionRef: { id: null, playCounted: false },
          });

          get().computeGains();
          get().initAudioEvents();
          console.log('AudioContext initialized successfully.');
        } catch (error) {
          console.error('Failed to initialize AudioContext:', error);
        }
      },

      initAudioEvents: () => {
        const { audioRef, currentTrack, currentPlaySessionRef, setProgress, setDuration, playNext } = get();
        if (!audioRef) return;

        const handleTimeUpdate = () => {
          if (!audioRef.duration || !currentTrack?.id) return;

          const secondsPlayed = audioRef.currentTime;
          const percentPlayed = secondsPlayed / audioRef.duration;
          setProgress(secondsPlayed / audioRef.duration);
          console.log('Time update:', { progress: secondsPlayed, duration: audioRef.duration });

          if (
            currentPlaySessionRef &&
            !currentPlaySessionRef.playCounted &&
            currentPlaySessionRef.id &&
            secondsPlayed >= Math.max(10, 0.3 * audioRef.duration)
          ) {
            console.log(`Attempting to scrobble track ${currentTrack.id} at ${secondsPlayed}s (threshold: ${Math.max(10, 0.3 * audioRef.duration)}s)`);
            fetch('/godspeed/log_play', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                track_id: currentTrack.id,
                source: currentTrack.playSingle ? 'single' : 'queue',
                sessionId: currentPlaySessionRef.id,
              }),
            })
              .then(() => {
                set({ currentPlaySessionRef: { ...currentPlaySessionRef, playCounted: true } });
                console.log(`Successfully scrobbled track ${currentTrack.id}`);
              })
              .catch(error => console.error('Failed to scrobble:', error));
          }
        };

        const handleLoadedMetadata = () => {
          setDuration(audioRef.duration || 0);
          console.log('Loaded metadata, duration:', audioRef.duration);
        };

        const handleEnded = () => {
          if (
            currentTrack?.id &&
            currentPlaySessionRef &&
            !currentPlaySessionRef.playCounted &&
            currentPlaySessionRef.id
          ) {
            console.log(`Scrobbling track ${currentTrack.id} on end`);
            fetch('/godspeed/log_play', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                track_id: currentTrack.id,
                source: currentTrack.playSingle ? 'single' : 'queue',
                sessionId: currentPlaySessionRef.id,
              }),
            })
              .then(() => {
                set({ currentPlaySessionRef: { ...currentPlaySessionRef, playCounted: true } });
                console.log(`Successfully scrobbled track ${currentTrack.id} on end`);
              })
              .catch(error => console.error('Failed to scrobble on end:', error));
          }
          console.log('Track ended:', currentTrack?.title);
          playNext();
        };

        const handleError = () => {
          console.error('Audio playback error:', audioRef.error);
          playNext();
        };

        audioRef.addEventListener('timeupdate', handleTimeUpdate);
        audioRef.addEventListener('loadedmetadata', handleLoadedMetadata);
        audioRef.addEventListener('ended', handleEnded);
        audioRef.addEventListener('error', handleError);

        return () => {
          audioRef.removeEventListener('timeupdate', handleTimeUpdate);
          audioRef.removeEventListener('loadedmetadata', handleLoadedMetadata);
          audioRef.removeEventListener('ended', handleEnded);
          audioRef.removeEventListener('error', handleError);
        };
      },

      cleanupAudio: () => {
        const { audioRef, audioCtxRef, sourceRef } = get();
        if (audioRef) {
          audioRef.pause();
          audioRef.src = '';
        }
        if (sourceRef) {
          sourceRef.disconnect();
        }
        if (audioCtxRef) {
          audioCtxRef.close().catch(error => console.error('Error closing AudioContext:', error));
        }
        set({
          audioRef: null,
          audioCtxRef: null,
          sourceRef: null,
          splitterRef: null,
          mergerRef: null,
          gainLtoLRef: null,
          gainRtoRRef: null,
          gainLtoRRef: null,
          gainRtoLRef: null,
          monoGainRef: null,
          monoToLRef: null,
          monoToRRef: null,
          isPlaying: false,
          currentTrack: null,
          currentTrackId: null,
          progress: 0,
          duration: 0,
          currentPlaySessionRef: null,
        });
      },

      computeGains: () => {
        const { baseLeftVolume, baseRightVolume, masterVolume, pan, isMono, isMuted, replayGainEnabled, monoGainRef, monoToLRef, monoToRRef, gainLtoLRef, gainRtoRRef, gainLtoRRef, gainRtoLRef, audioCtxRef } = get();
        const master = isMuted ? 0 : Math.max(0, Math.min(1, masterVolume));
        const lBase = Math.max(0, Math.min(1, baseLeftVolume));
        const rBase = Math.max(0, Math.min(1, baseRightVolume));
        const panValue = Math.max(-1, Math.min(1, pan));
        const replayGain = replayGainEnabled ? 0.5 : 1;
        const currentTime = audioCtxRef ? audioCtxRef.currentTime : 0;

        if (isMono && monoGainRef && monoToLRef && monoToRRef) {
          const monoVolume = ((lBase + rBase) / 2) * master * replayGain;
          const monoToLeft = panValue <= 0 ? 1 : 1 - panValue;
          const monoToRight = panValue >= 0 ? 1 : 1 + panValue;
          monoGainRef.gain.setValueAtTime(monoVolume, currentTime);
          monoToLRef.gain.setValueAtTime(monoToLeft * 0.5, currentTime);
          monoToRRef.gain.setValueAtTime(monoToRight * 0.5, currentTime);
          if (gainLtoLRef) gainLtoLRef.gain.setValueAtTime(0, currentTime);
          if (gainRtoRRef) gainRtoRRef.gain.setValueAtTime(0, currentTime);
          if (gainLtoRRef) gainLtoRRef.gain.setValueAtTime(0, currentTime);
          if (gainRtoLRef) gainRtoLRef.gain.setValueAtTime(0, currentTime);
          console.log('Mono mode gains:', { monoGain: monoVolume, monoToL: monoToLRef.gain.value, monoToR: monoToRRef.gain.value, pan: panValue });
        } else if (gainLtoLRef && gainRtoRRef && gainLtoRRef && gainRtoLRef) {
          const leftToLeft = panValue <= 0 ? 1 : 1 - panValue;
          const rightToRight = panValue >= 0 ? 1 : 1 + panValue;
          const leftToRight = panValue > 0 ? panValue : 0;
          const rightToLeft = panValue < 0 ? -panValue : 0;

          gainLtoLRef.gain.setValueAtTime(lBase * master * leftToLeft * replayGain, currentTime);
          gainRtoRRef.gain.setValueAtTime(rBase * master * rightToRight * replayGain, currentTime);
          gainLtoRRef.gain.setValueAtTime(lBase * master * leftToRight * replayGain, currentTime);
          gainRtoLRef.gain.setValueAtTime(rBase * master * rightToLeft * replayGain, currentTime);

          if (monoGainRef) monoGainRef.gain.setValueAtTime(0, currentTime);
          if (monoToLRef) monoToLRef.gain.setValueAtTime(0, currentTime);
          if (monoToRRef) monoToRRef.gain.setValueAtTime(0, currentTime);
          console.log('Stereo mode gains:', { LtoL: gainLtoLRef.gain.value, RtoR: gainRtoRRef.gain.value, LtoR: gainLtoRRef.gain.value, RtoL: gainRtoLRef.gain.value, pan: panValue });
        }
      },

      setMono: async (enabled) => {
        const { splitterRef, mergerRef, audioCtxRef, gainLtoLRef, gainRtoRRef, gainLtoRRef, gainRtoLRef, monoGainRef, monoToLRef, monoToRRef, audioRef, isPlaying, sourceRef } = get();
        if (!splitterRef || !mergerRef || !audioCtxRef || !sourceRef) {
          console.error('Audio graph not initialized for setMono');
          return;
        }

        try {
          // Resume AudioContext if suspended
          if (audioCtxRef.state === 'suspended') {
            await audioCtxRef.resume();
            console.log('AudioContext resumed for setMono');
          }

          // Disconnect all nodes to avoid stale connections
          mergerRef.disconnect();
          splitterRef.disconnect();
          [gainLtoLRef, gainRtoRRef, gainLtoRRef, gainRtoLRef, monoGainRef, monoToLRef, monoToRRef].forEach(ref => {
            try {
              ref?.disconnect();
            } catch (e) {
              console.warn('Error disconnecting node:', e);
            }
          });

          // Reconnect source to splitter
          sourceRef.connect(splitterRef);

          if (enabled) {
            // Mono mode: Combine left and right channels into monoGain, then split to left and right outputs
            splitterRef.connect(monoGainRef, 0); // Left channel to mono
            splitterRef.connect(monoGainRef, 1); // Right channel to mono
            monoGainRef.connect(monoToLRef);
            monoGainRef.connect(monoToRRef);
            monoToLRef.connect(mergerRef, 0, 0); // Mono to left output
            monoToRRef.connect(mergerRef, 0, 1); // Mono to right output
            console.log('Mono mode enabled: audio graph reconfigured');
          } else {
            // Stereo mode: Standard panning setup
            splitterRef.connect(gainLtoLRef, 0);
            splitterRef.connect(gainLtoRRef, 0);
            splitterRef.connect(gainRtoRRef, 1);
            splitterRef.connect(gainRtoLRef, 1);
            gainLtoLRef.connect(mergerRef, 0, 0);
            gainRtoLRef.connect(mergerRef, 0, 0);
            gainRtoRRef.connect(mergerRef, 0, 1);
            gainLtoRRef.connect(mergerRef, 0, 1);
            console.log('Stereo mode enabled: audio graph reconfigured');
          }

          // Reconnect merger to destination
          mergerRef.connect(audioCtxRef.destination);

          // Restart playback if necessary
          if (isPlaying && audioRef && audioRef.src) {
            const currentTime = audioRef.currentTime;
            try {
              audioRef.pause();
              await audioCtxRef.resume();
              audioRef.currentTime = currentTime;
              await audioRef.play();
              console.log('Playback restarted after mono/stereo toggle at time:', currentTime);
            } catch (e) {
              console.error('Error restarting playback after setMono:', e);
              set({ isPlaying: false });
            }
          }

          set({ isMono: enabled });
          get().computeGains();
        } catch (error) {
          console.error('Error setting mono mode:', error);
          set({ isMono: false }); // Fallback to stereo on error
          get().computeGains();
        }
      },

      toggleReplayGain: () => {
        set(state => ({ replayGainEnabled: !state.replayGainEnabled }));
        get().computeGains();
      },

      toggleMute: () => {
        set(state => ({ isMuted: !state.isMuted }));
        get().computeGains();
      },

      playTrack: async (track, index = null) => {
        const formattedTrack = formatTrack(track);
        if (!formattedTrack?.audioSrc) {
          console.error('No audioSrc provided for track:', track);
          return;
        }

        try {
          const { audioRef, audioCtxRef, initializeAudio, queue } = get();
          if (!audioRef || !audioCtxRef) {
            console.log('Initializing AudioContext for playTrack');
            initializeAudio();
          }

          const audio = get().audioRef;
          audio.pause();
          audio.src = '';
          set({ progress: 0, duration: 0 });
          const sessionId = generateUid();
          set({ currentPlaySessionRef: { id: sessionId, playCounted: false } });

          console.log('Current queue before playTrack:', queue, 'Requested index:', index);

          if (formattedTrack.playSingle) {
            set({ queue: [formattedTrack], currentIndex: 0, isSinglePlay: true });
            console.log('Playing single track, queue updated:', [formattedTrack]);
          } else if (index !== null && queue[index] && queue[index].id === formattedTrack.id) {
            set({ currentIndex: index, isSinglePlay: false });
            console.log('Jumping to existing track at index:', index);
          } else {
            const existingIndex = queue.findIndex(t => t.id === formattedTrack.id && t.queueUid === formattedTrack.queueUid);
            if (existingIndex === -1) {
              set(state => ({
                queue: [...state.queue, formattedTrack],
                currentIndex: state.queue.length,
                isSinglePlay: false,
              }));
              console.log('Appended new track to queue:', formattedTrack, 'New index:', queue.length);
            } else {
              set({ currentIndex: existingIndex, isSinglePlay: false });
              console.log('Jumping to existing track at index:', existingIndex);
            }
          }

          audio.src = formattedTrack.audioSrc;
          console.log('Attempting to play:', formattedTrack.audioSrc, 'at index:', index);
          await audioCtxRef.resume();
          await audio.play().catch(error => {
            console.error('Autoplay failed:', error, 'for track:', formattedTrack);
            set({ isPlaying: false });
            throw error;
          });

          set({
            currentTrack: formattedTrack,
            currentTrackId: formattedTrack.queueUid,
            isPlaying: true,
          });

          console.log('Playback started, current queue:', get().queue, 'currentIndex:', get().currentIndex);
        } catch (error) {
          console.error('Error playing track:', error, 'Track:', formattedTrack);
          set({ isPlaying: false });
        }
      },

      playTrackDirect: async (track, index = null) => {
        await get().playTrack(track, index);
      },

      playQueue: async (trackList, startIndex = 0, options = {}) => {
        if (!Array.isArray(trackList) || trackList.length === 0) {
          console.error('Invalid trackList:', trackList);
          return;
        }

        try {
          const { audioRef, audioCtxRef, initializeAudio } = get();
          if (!audioRef || !audioCtxRef) {
            console.log('Initializing AudioContext for playQueue');
            initializeAudio();
          }

          const formattedQueue = trackList
            .map(track => formatTrack(track, { groupId: track.groupId || null }))
            .filter(track => track?.audioSrc);

          if (formattedQueue.length === 0) {
            console.error('No valid tracks in queue');
            return;
          }

          const safeIndex = Math.max(0, Math.min(startIndex, formattedQueue.length - 1));
          const startTrack = formattedQueue[safeIndex];

          set({
            queue: formattedQueue,
            currentIndex: safeIndex,
            isSinglePlay: false,
            currentTrack: startTrack,
            currentTrackId: startTrack.queueUid,
            isPlaying: true,
            progress: 0,
            duration: 0,
            currentPlaySessionRef: { id: generateUid(), playCounted: false },
          });

          const audio = get().audioRef;
          audio.pause();
          audio.src = startTrack.audioSrc;
          console.log('Attempting to play queue:', startTrack.audioSrc, 'at index:', safeIndex);
          await audioCtxRef.resume();
          await audio.play().catch(error => {
            console.error('Autoplay failed:', error, 'for track:', startTrack);
            set({ isPlaying: false });
            throw error;
          });

          console.log('Queue playback started, current queue:', get().queue, 'currentIndex:', safeIndex);
        } catch (error) {
          console.error('Error playing queue:', error);
          set({ isPlaying: false });
        }
      },

      togglePlayPause: async () => {
        const { audioRef, audioCtxRef, isPlaying } = get();
        if (!audioRef.src) {
          console.error('No audio source set for togglePlayPause');
          return;
        }

        try {
          await audioCtxRef.resume();
          if (isPlaying) {
            audioRef.pause();
            set({ isPlaying: false });
          } else {
            await audioRef.play();
            set({ isPlaying: true });
          }
        } catch (error) {
          console.error('Play/pause error:', error);
          set({ isPlaying: false });
        }
      },

      seekTo: (percent) => {
        const audio = get().audioRef;
        if (!audio.duration) return;

        const safePercent = Math.max(0, Math.min(1, percent));
        audio.currentTime = safePercent * audio.duration;
        set({ progress: safePercent });
      },

      playNext: () => {
        const { queue, currentIndex, isSinglePlay } = get();
        if (queue.length === 0 || isSinglePlay) {
          set({ isPlaying: false, progress: 0, currentTrack: null, currentTrackId: null, queue: [] });
          return;
        }

        console.log('playNext: Current queue:', queue, 'currentIndex:', currentIndex);

        // Remove the finished track
        const newQueue = [...queue];
        newQueue.splice(currentIndex, 1);

        if (newQueue.length === 0) {
          // Queue is empty after removal
          set({ isPlaying: false, progress: 0, currentTrack: null, currentTrackId: null, queue: [], currentIndex: 0 });
          console.log('Queue empty after track removal, stopping playback');
          return;
        }

        // Determine next index
        let nextIndex = currentIndex;
        if (currentIndex >= newQueue.length) {
          // Last track was removed, loop to first track
          nextIndex = 0;
        }

        // Find the first track of the group if nextIndex points to a group
        const nextTrack = newQueue[nextIndex];
        const groupId = nextTrack.groupId;
        if (groupId) {
          // Find the first track of the same groupId
          const firstGroupIndex = newQueue.findIndex(track => track.groupId === groupId);
          if (firstGroupIndex !== -1 && firstGroupIndex < nextIndex) {
            nextIndex = firstGroupIndex;
          }
        }

        set({ queue: newQueue, currentIndex: nextIndex });
        console.log('Playing next track after removal:', newQueue[nextIndex], 'new index:', nextIndex, 'new queue:', newQueue);
        get().playTrack(newQueue[nextIndex], nextIndex);
      },

      playPrevious: () => {
        const { queue, currentIndex } = get();
        if (queue.length === 0 || currentIndex === 0) {
          set({ isPlaying: false, progress: 0 });
          return;
        }

        const prevIndex = currentIndex - 1;
        set({ currentIndex: prevIndex });
        get().playTrack(queue[prevIndex], prevIndex);
      },

      removeTrack: (queueUid) => {
        const { queue, currentIndex, currentTrackId, audioRef } = get();
        const trackIndex = queue.findIndex(track => track.queueUid === queueUid);
        if (trackIndex === -1) {
          console.warn('Track not found in queue:', queueUid);
          return;
        }

        console.log('Removing track:', queue[trackIndex], 'at index:', trackIndex);

        const newQueue = [...queue];
        newQueue.splice(trackIndex, 1);

        let newIndex = currentIndex;
        let stopPlayback = false;

        if (trackIndex < currentIndex) {
          // Track before current was removed, shift index
          newIndex = currentIndex - 1;
        } else if (trackIndex === currentIndex && currentTrackId === queueUid) {
          // Current track was removed, stop playback
          stopPlayback = true;
          newIndex = Math.min(currentIndex, newQueue.length - 1);
        }

        if (stopPlayback) {
          if (audioRef) {
            audioRef.pause();
            audioRef.src = '';
          }
          set({
            queue: newQueue,
            currentIndex: newIndex,
            isPlaying: false,
            progress: 0,
            currentTrack: null,
            currentTrackId: null,
            currentPlaySessionRef: { id: null, playCounted: false },
          });
          console.log('Current track removed, stopped playback, new queue:', newQueue, 'new index:', newIndex);
        } else {
          set({ queue: newQueue, currentIndex: newIndex });
          console.log('Track removed, new queue:', newQueue, 'new index:', newIndex);
        }
      },

      queueNext: (track) => {
        const formatted = formatTrack(track);
        set(state => ({
          queue: [...state.queue.slice(0, state.currentIndex + 1), formatted, ...state.queue.slice(state.currentIndex + 1)],
        }));
      },

      queueNextBatch: (tracks) => {
        const formatted = tracks.map(track => formatTrack(track, { groupId: track.groupId || null }));
        set(state => ({
          queue: [...state.queue.slice(0, state.currentIndex + 1), ...formatted, ...state.queue.slice(state.currentIndex + 1)],
        }));
      },

      queueLater: (track) => {
        const formatted = formatTrack(track);
        set(state => ({ queue: [...state.queue, formatted] }));
      },

      queueLaterBatch: (tracks) => {
        const formatted = tracks.map(track => formatTrack(track, { groupId: track.groupId || null }));
        set(state => ({
          queue: [...state.queue, ...formatted],
        }));
        console.log('Queued batch later:', formatted, 'New queue:', get().queue);
      },

      clearQueue: () => {
        set({ queue: [], currentIndex: 0 });
      },

      reorderQueue: (sourceIndex, sourceGroupKey, targetIndex, targetGroupKey, isGroup) => {
        set(state => {
          const newQueue = [...state.queue];
          if (isGroup && sourceGroupKey && targetGroupKey) {
            const grouped = newQueue.reduce((acc, track, idx) => {
              const key = track.groupId ? `${track.album}|${track.artist}|${track.groupId}` : `__single__${idx}`;
              if (!acc[key]) acc[key] = [];
              acc[key].push({ ...track, queueIndex: idx });
              return acc;
            }, {});

            const sourceGroup = grouped[sourceGroupKey];
            const targetGroup = grouped[targetGroupKey];
            if (!sourceGroup || !targetGroup) return state;

            const sourceStartIndex = sourceGroup[0].queueIndex;
            const targetStartIndex = targetGroup[0].queueIndex;
            const sourceTracks = sourceGroup.map(t => ({ ...t, queueIndex: undefined }));

            newQueue.splice(sourceStartIndex, sourceGroup.length);
            const adjustedTargetIndex = targetStartIndex > sourceStartIndex
              ? targetStartIndex - sourceGroup.length
              : targetStartIndex;
            newQueue.splice(adjustedTargetIndex, 0, ...sourceTracks);

            const newCurrentIndex = state.currentIndex >= sourceStartIndex && state.currentIndex < sourceStartIndex + sourceGroup.length
              ? adjustedTargetIndex + (state.currentIndex - sourceStartIndex)
              : state.currentIndex >= adjustedTargetIndex && state.currentIndex < sourceStartIndex
              ? state.currentIndex + sourceGroup.length
              : state.currentIndex >= sourceStartIndex && state.currentIndex < adjustedTargetIndex
              ? state.currentIndex - sourceGroup.length
              : state.currentIndex;

            return { queue: newQueue, currentIndex: newCurrentIndex };
          } else if (sourceIndex !== null && targetIndex !== null) {
            const movedTrack = { ...newQueue[sourceIndex], groupId: targetGroupKey ? newQueue[targetIndex].groupId : null };
            newQueue.splice(sourceIndex, 1);
            const adjustedTargetIndex = targetIndex > sourceIndex ? targetIndex - 1 : targetIndex;
            newQueue.splice(adjustedTargetIndex, 0, movedTrack);

            const newCurrentIndex = state.currentIndex === sourceIndex
              ? adjustedTargetIndex
              : state.currentIndex >= sourceIndex && state.currentIndex < adjustedTargetIndex
              ? state.currentIndex - 1
              : state.currentIndex >= adjustedTargetIndex && state.currentIndex < sourceIndex
              ? state.currentIndex + 1
              : state.currentIndex;

            return { queue: newQueue, currentIndex: newCurrentIndex };
          }
          return state;
        });
      },

      setBaseVolume: (left, right) => {
        set({ baseLeftVolume: left, baseRightVolume: right });
        get().computeGains();
      },

      setMasterVolume: (volume) => {
        set({ masterVolume: volume });
        get().computeGains();
      },

      setPan: (pan) => {
        set({ pan });
        get().computeGains();
      },

      toggleMute: () => {
        set(state => ({ isMuted: !state.isMuted }));
        get().computeGains();
      },

      setProgress: (progress) => set({ progress }),
      setDuration: (duration) => set({ duration }),
      setCurrentIndex: (index) => set({ currentIndex: index }),
      setCurrentIndexDirect: (index) => set({ currentIndex: index }),
      getQueue: () => get().queue,
      getCurrentIndex: () => get().currentIndex,
    }),
    {
      name: 'godspeed-audio',
      partialize: state => ({
        queue: state.queue,
        baseLeftVolume: state.baseLeftVolume,
        baseRightVolume: state.baseRightVolume,
        masterVolume: state.masterVolume,
        pan: state.pan,
        isMono: state.isMono,
        isMuted: state.isMuted,
        replayGainEnabled: state.replayGainEnabled,
      }),
    }
  )
);