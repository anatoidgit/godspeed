import { useEffect } from 'react';
import throttle from 'lodash/throttle';
import { useAudioStore } from '../stores/useAudioStore';

export function useAudioEvents(audioRef, currentTrack, currentPlaySessionRef, isPlaying, playNext, setProgress, setDuration) {
  useEffect(() => {
    if (!audioRef || !currentTrack) return;

    const audio = audioRef;

    // Handle duration update when metadata is loaded
    const handleLoadedMetadata = () => {
      if (audio.duration) {
        setDuration(audio.duration);
      }
    };

    // Handle time update for progress and scrobble
    const handleTimeUpdate = throttle(() => {
      if (audio.duration && audio.currentTime && currentTrack.id && currentPlaySessionRef?.id) {
        const progress = audio.currentTime / audio.duration;
        setProgress(progress);

        // Check if scrobble threshold is met (30% or 10 seconds) and play hasn't been counted
        const playThreshold = Math.min(currentTrack.duration * 0.3, 10);
        if (!currentPlaySessionRef.playCounted && audio.currentTime >= playThreshold) {
          console.log(`Attempting to scrobble track ${currentTrack.id} at ${audio.currentTime.toFixed(2)}s (threshold: ${playThreshold}s)`);
          fetch('/godspeed/log_play', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              track_id: currentTrack.id,
            }),
          })
            .then(response => {
              if (!response.ok) {
                console.error(`Failed to log play for track ${currentTrack.id}: ${response.status}`);
                return;
              }
              console.log(`Successfully scrobbled track ${currentTrack.id}`);
              useAudioStore.setState(state => ({
                currentPlaySessionRef: { ...state.currentPlaySessionRef, playCounted: true },
              }));
            })
            .catch(error => {
              console.error(`Error logging play for track ${currentTrack.id}:`, error);
            });
        }
      }
    }, 1000);

    // Handle track end
    const handleEnded = () => {
      console.log('Track ended, playing next...');
      playNext(true);
    };

    // Handle errors
    const handleError = () => {
      console.error('Audio error occurred:', audio.error);
      useAudioStore.setState({ isPlaying: false });
    };

    // Add event listeners
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleError);

    // Cleanup
    return () => {
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError);
      handleTimeUpdate.cancel();
    };
  }, [audioRef, currentTrack, currentPlaySessionRef, isPlaying, playNext, setProgress, setDuration]);
}