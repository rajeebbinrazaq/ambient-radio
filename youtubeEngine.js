/* ==========================================================================
   KERALA TEA SHOP AMBIENT RADIO - YOUTUBE IFRAME PLAYER ENGINE
   ========================================================================== */

class YouTubeEngine {
  constructor() {
    this.player = null;
    this.isReady = false;
    this.currentPlaylistId = null;
    this.currentVideoId = null;
    this.isPlaying = false;
    this.volume = 80;
  }

  // Called when YouTube IFrame API is loaded
  init() {
    if (this.isReady || !window.YT) return;

    window.YT.ready(() => {
      this.player = new window.YT.Player('ytplayer', {
        height: '1',
        width: '1',
        playerVars: {
          autoplay: 0,
          controls: 0,
          disablekb: 1,
          fs: 0,
          rel: 0,
          playsinline: 1
        },
        events: {
          onReady: (event) => {
            this.isReady = true;
            this.player.setVolume(this.volume);
            console.log("YouTube Player API Ready");
          },
          onStateChange: (event) => {
            if (event.data === window.YT.PlayerState.PLAYING) {
              this.isPlaying = true;
              if (window.audioEngine) {
                if (window.audioEngine.isPlayingRadio) {
                  window.audioEngine.pauseRadio();
                }
                window.audioEngine.setStreamingActive(true);
              }
              if (window.app) {
                window.app.updatePlaybackUI('youtube', true);
              }
            } else if (event.data === window.YT.PlayerState.PAUSED || event.data === window.YT.PlayerState.ENDED) {
              this.isPlaying = false;
              if (window.audioEngine) {
                window.audioEngine.setStreamingActive(false);
              }
              if (window.app) {
                window.app.updatePlaybackUI('youtube', false);
              }
            }
          },
          onError: (err) => {
            console.error("YouTube Player Error:", err);
          }
        }
      });
    });
  }

  loadMedia(urlOrId) {
    if (!this.isReady || !this.player) return;

    // Parse URL if needed
    const parsed = this._parseYouTubeUrl(urlOrId);
    if (parsed.type === 'playlist') {
      this.currentPlaylistId = parsed.id;
      this.player.loadPlaylist({
        list: parsed.id,
        listType: 'playlist',
        index: 0
      });
    } else if (parsed.type === 'video') {
      this.currentVideoId = parsed.id;
      this.player.loadVideoById(parsed.id);
    }
  }

  play() {
    if (this.isReady && this.player) {
      this.player.playVideo();
    }
  }

  pause() {
    if (this.isReady && this.player) {
      this.player.pauseVideo();
    }
  }

  nextTrack() {
    if (this.isReady && this.player && typeof this.player.nextVideo === 'function') {
      this.player.nextVideo();
    }
  }

  prevTrack() {
    if (this.isReady && this.player && typeof this.player.previousVideo === 'function') {
      this.player.previousVideo();
    }
  }

  setVolume(vol) {
    this.volume = parseInt(vol, 10);
    if (this.isReady && this.player && typeof this.player.setVolume === 'function') {
      this.player.setVolume(this.volume);
    }
  }

  _parseYouTubeUrl(input) {
    if (!input) return { type: 'video', id: 'fJ9rUzIMcZQ' }; // default fallback

    // Check if playlist
    if (input.includes('list=')) {
      const match = input.match(/[&?]list=([^&]+)/);
      if (match && match[1]) {
        return { type: 'playlist', id: match[1] };
      }
    }

    // Check if video URL
    if (input.includes('youtu.be/')) {
      const id = input.split('youtu.be/')[1].split('?')[0];
      return { type: 'video', id: id };
    }

    if (input.includes('v=')) {
      const match = input.match(/[&?]v=([^&]+)/);
      if (match && match[1]) {
        return { type: 'video', id: match[1] };
      }
    }

    // Plain ID fallback
    if (input.startsWith('PL')) {
      return { type: 'playlist', id: input };
    }
    return { type: 'video', id: input };
  }
}

// Global Singleton
window.youtubeEngine = new YouTubeEngine();

// Callback for YouTube Iframe API
window.onYouTubeIframeAPIReady = function() {
  if (window.youtubeEngine) {
    window.youtubeEngine.init();
  }
};
