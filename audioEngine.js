/* ==========================================================================
   KERALA TEA SHOP AMBIENT RADIO - WEB AUDIO ENGINE
   ========================================================================== */

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.isInitialized = false;
    this.engineMode = 'hd'; // 'hd' (Normalized Recorded Loops) or 'synth' (Procedural)
    
    // Radio HTML5 Audio
    this.radioAudio = new Audio();
    this.radioAudio.volume = 0.9;
    this.hls = null;
    this.radioGainNode = null;
    
    // Master Nodes
    this.masterGain = null;
    this.masterAmbientGain = null;
    this.masterRadioGain = null;
    this.analyser = null;

    // Audio Buffers Cache
    this.audioBuffers = {};

    // HD Blanket Sound Mapping
    this.hdSoundFiles = {
      rain: 'sounds/rain.ogg',
      wind: 'sounds/wind.ogg',
      thunder: 'sounds/thunder.ogg',
      crickets: 'sounds/summer-night.ogg',
      chatter: 'sounds/chatter.ogg',
      fireplace: 'sounds/fireplace.ogg',
      birds: 'sounds/birds.ogg',
      'tea-clink': 'sounds/tea-clink.ogg',
      boat: 'sounds/boat.ogg',
      city: 'sounds/city.ogg',
      train: 'sounds/train.ogg',
      waves: 'sounds/waves.ogg'
    };

    // Ambient Channels State
    this.channels = {
      rain: { volume: 0, muted: false, sourceNode: null, gainNode: null, synthGainNode: null },
      wind: { volume: 0, muted: false, sourceNode: null, gainNode: null, synthGainNode: null },
      thunder: { volume: 0, muted: false, sourceNode: null, gainNode: null, synthGainNode: null },
      crickets: { volume: 0, muted: false, sourceNode: null, gainNode: null, synthGainNode: null },
      chatter: { volume: 0, muted: false, sourceNode: null, gainNode: null, synthGainNode: null },
      fireplace: { volume: 0, muted: false, sourceNode: null, gainNode: null, synthGainNode: null },
      birds: { volume: 0, muted: false, sourceNode: null, gainNode: null, synthGainNode: null },
      'tea-clink': { volume: 0, muted: false, sourceNode: null, gainNode: null, synthGainNode: null },
      boat: { volume: 0, muted: false, sourceNode: null, gainNode: null, synthGainNode: null },
      city: { volume: 0, muted: false, sourceNode: null, gainNode: null, synthGainNode: null },
      train: { volume: 0, muted: false, sourceNode: null, gainNode: null, synthGainNode: null },
      waves: { volume: 0, muted: false, sourceNode: null, gainNode: null, synthGainNode: null }
    };

    // Instantiate HTML5 Audio elements for instant, reliable ambient loop playback
    this.audioElements = {};
    for (const [key, path] of Object.entries(this.hdSoundFiles)) {
      const audio = new Audio(path);
      audio.loop = true;
      audio.volume = 0;
      this.audioElements[key] = audio;
    }

    this.isPlayingRadio = false;
    this.isLoadingRadio = false;

    // Attach stream event listeners for buffering / loading / playing states
    this.radioAudio.addEventListener('loadstart', () => {
      this.isLoadingRadio = true;
      if (window.app) window.app.updatePlaybackUI('radio', 'loading');
    });

    this.radioAudio.addEventListener('waiting', () => {
      this.isLoadingRadio = true;
      if (window.app) window.app.updatePlaybackUI('radio', 'loading');
    });

    this.radioAudio.addEventListener('playing', () => {
      this.isLoadingRadio = false;
      this.isPlayingRadio = true;
      this.setStreamingActive(true);
      if (window.app) window.app.updatePlaybackUI('radio', 'playing');
    });

    this.radioAudio.addEventListener('pause', () => {
      if (!this.isLoadingRadio) {
        this.isPlayingRadio = false;
        this.setStreamingActive(false);
        if (window.app) window.app.updatePlaybackUI('radio', 'paused');
      }
    });

    this.radioAudio.addEventListener('error', () => {
      this.isLoadingRadio = false;
      this.isPlayingRadio = false;
      this.setStreamingActive(false);
      if (window.app) window.app.updatePlaybackUI('radio', 'error');
    });
  }

  // Initialize Web Audio Context on first user interaction
  async init() {
    if (this.isInitialized) return;
    this.isInitialized = true;

    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioCtx();

      // Master Output & Analyser
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 1.0;

      this.masterAmbientGain = this.ctx.createGain();
      this.masterAmbientGain.gain.value = 1.0;
      this.masterAmbientGain.connect(this.masterGain);

      this.masterRadioGain = this.ctx.createGain();
      this.masterRadioGain.gain.value = 0.95;
      this.masterRadioGain.connect(this.masterGain);

      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 64;
      this.masterGain.connect(this.analyser);
      this.analyser.connect(this.ctx.destination);

      // HTML5 radioAudio streams directly to standard browser output to avoid Web Audio API CORS-tainted silencing
      this.radioAudio.volume = 0.9;

      // Load HD Ambient Sound Buffers asynchronously
      this._loadAllHDBuffers().catch(err => console.warn("HD sound buffers load warning:", err));
      this._initProceduralSynths();
    } catch (e) {
      console.warn("AudioContext init warning:", e);
    }
  }

  async ensureContextRunning() {
    if (!this.ctx) {
      await this.init();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      try {
        await this.ctx.resume();
      } catch (e) {
        console.warn("Context resume error:", e);
      }
    }
    for (const [key, ch] of Object.entries(this.channels)) {
      if (ch.volume > 0 && !ch.muted) {
        const audio = this.audioElements[key];
        if (audio && audio.paused) {
          audio.play().catch(() => {});
        }
      }
    }
  }

  // Set Engine Mode ('hd' for Blanket HD Audio Buffers, 'synth' for procedural)
  setEngineMode(mode) {
    this.engineMode = mode;
    for (const key in this.channels) {
      this._updateChannelGain(key);
    }
  }

  // Decode audio loops into Web Audio memory buffers
  async _loadAllHDBuffers() {
    const promises = Object.entries(this.hdSoundFiles).map(async ([key, path]) => {
      try {
        const response = await fetch(path);
        const arrayBuffer = await response.arrayBuffer();
        const decodedBuffer = await this.ctx.decodeAudioData(arrayBuffer);
        this.audioBuffers[key] = decodedBuffer;
        this._startHDLoop(key);
      } catch (e) {
        console.error(`Error loading HD sound buffer [${key}]:`, e);
      }
    });

    await Promise.all(promises);
  }

  _startHDLoop(key) {
    if (!this.ctx || !this.audioBuffers[key]) return;

    // Create Loop Buffer Source
    const source = this.ctx.createBufferSource();
    source.buffer = this.audioBuffers[key];
    source.loop = true;

    // Gain Node
    const gainNode = this.ctx.createGain();
    const ch = this.channels[key];
    const initialVol = (this.engineMode === 'hd' && !ch.muted) ? ch.volume : 0;
    gainNode.gain.setValueAtTime(initialVol, this.ctx.currentTime);

    source.connect(gainNode);
    gainNode.connect(this.masterAmbientGain);
    source.start(0);

    ch.sourceNode = source;
    ch.gainNode = gainNode;
  }

  // Radio Audio Stream Controls - Always loads fresh stream URL for true LIVE broadcast
  playRadio(streamUrl) {
    if (!streamUrl) return;

    // Auto-upgrade HTTP stream URLs to HTTPS to prevent Mixed Content security blocking on HTTPS origins (like Vercel)
    if (streamUrl.startsWith('http://')) {
      streamUrl = streamUrl.replace(/^http:\/\//i, 'https://');
    }

    this.ensureContextRunning();
    
    this.radioAudio.volume = 0.9;
    if (this.radioGainNode) this.radioGainNode.gain.value = 0.9;

    this.isLoadingRadio = true;
    if (window.app) window.app.updatePlaybackUI('radio', 'loading');

    if (streamUrl.includes('.m3u8') && window.Hls && window.Hls.isSupported()) {
      if (this.hls) {
        this.hls.destroy();
      }
      this.hls = new window.Hls({
        enableWorker: true,
        lowLatencyMode: true
      });
      this.hls.loadSource(streamUrl);
      this.hls.attachMedia(this.radioAudio);
      this.hls.on(window.Hls.Events.MANIFEST_PARSED, () => {
        this.radioAudio.play().catch(err => {
          console.error("HLS Play error:", err);
          this.isLoadingRadio = false;
          if (window.app) window.app.updatePlaybackUI('radio', 'error');
        });
      });
      this.hls.on(window.Hls.Events.ERROR, (event, data) => {
        if (data.fatal) {
          this.isLoadingRadio = false;
          if (window.app) window.app.updatePlaybackUI('radio', 'error');
        }
      });
    } else {
      if (this.hls) {
        this.hls.destroy();
        this.hls = null;
      }
      // Always reload live stream source URL to force live real-time stream (never timeline cached offset)
      this.radioAudio.src = streamUrl;
      this.radioAudio.load();

      const playPromise = this.radioAudio.play();
      if (playPromise !== undefined) {
        playPromise.catch(err => {
          console.error("Radio stream playback error:", err);
          this.isLoadingRadio = false;
          if (window.app) window.app.updatePlaybackUI('radio', 'error');
        });
      }
    }
  }

  pauseRadio() {
    this.isLoadingRadio = false;
    this.radioAudio.pause();
    if (this.hls) {
      this.hls.destroy();
      this.hls = null;
    }
    // Clear audio stream src to release network buffer and prevent playing cached timeline
    this.radioAudio.src = '';
    this.radioAudio.load();
    this.isPlayingRadio = false;
    this.setStreamingActive(false);
    if (window.app) window.app.updatePlaybackUI('radio', 'paused');
  }

  setRadioVolume(vol) {
    const numericVol = parseFloat(vol);
    this.radioAudio.volume = numericVol;
    if (this.radioGainNode && this.ctx) {
      this.radioGainNode.gain.setValueAtTime(numericVol, this.ctx.currentTime);
    }
  }

  // Active Streaming State (Ambient sounds only play while live streaming or youtube is active)
  setStreamingActive(isActive) {
    this.isStreamingActive = !!isActive;
    this._updateMasterAmbientGain();
  }

  // Master Ambient Volume Control (Locked at maximum 1.0 when active; cards control individual volume levels)
  setMasterAmbientVolume(vol) {
    this.masterAmbientVolValue = 1.0;
    this._updateMasterAmbientGain();
  }

  _updateMasterAmbientGain() {
    if (!this.masterAmbientGain || !this.ctx) return;
    const targetVol = 1.0;
    this.masterAmbientGain.gain.setTargetAtTime(targetVol, this.ctx.currentTime, 0.1);
  }

  // Individual Sound Volume & Mute Controls
  setChannelVolume(sound, vol) {
    if (!this.channels[sound]) return;
    const numVol = Math.max(0, Math.min(1, parseFloat(vol || 0)));
    this.channels[sound].volume = numVol;
    this._updateChannelGain(sound);
  }

  toggleChannelMute(sound) {
    if (!this.channels[sound]) return;
    this.channels[sound].muted = !this.channels[sound].muted;
    this._updateChannelGain(sound);
    return this.channels[sound].muted;
  }

  setChannelMute(sound, isMuted) {
    if (!this.channels[sound]) return;
    this.channels[sound].muted = !!isMuted;
    this._updateChannelGain(sound);
  }

  _updateChannelGain(sound) {
    const ch = this.channels[sound];
    if (!ch) return;

    const targetVol = ch.muted ? 0 : ch.volume;

    // 1. Direct HTML5 Audio Loop Control (Instant & 100% reliable)
    const audio = this.audioElements[sound];
    if (audio) {
      audio.volume = targetVol;
      if (targetVol > 0 && audio.paused) {
        audio.play().catch(err => {
          console.warn(`HTML5 audio playback deferred for [${sound}]:`, err);
        });
      } else if (targetVol === 0 && !audio.paused) {
        audio.pause();
      }
    }

    // 2. HD Blanket Decoded Audio Loop Output (Web Audio)
    if (this.ctx && ch.gainNode) {
      const hdTarget = (this.engineMode === 'hd') ? targetVol : 0;
      ch.gainNode.gain.setTargetAtTime(hdTarget, this.ctx.currentTime, 0.05);
    }

    // 3. Procedural Synth Output
    if (this.ctx && ch.synthGainNode) {
      const synthTarget = (this.engineMode === 'synth') ? targetVol : 0;
      ch.synthGainNode.gain.setTargetAtTime(synthTarget, this.ctx.currentTime, 0.05);
    }
  }

  /* ==========================================================================
     PROCEDURAL SYNTHESIS ENGINE (SYNTH FALLBACK)
     ========================================================================== */

  _initProceduralSynths() {
    this._setupRainSynth();
    this._setupWindSynth();
    this._setupThunderSynth();
    this._setupCricketsSynth();
    this._setupChatterSynth();
    this._setupFireplaceSynth();
    this._setupBirdsSynth();
    this._setupTeaClinkSynth();
  }

  _createNoiseBuffer(type = 'pink', duration = 3) {
    const bufferSize = this.ctx.sampleRate * duration;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = buffer.getChannelData(0);
    
    if (type === 'pink') {
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.96900 * b2 + white * 0.1538520;
        b3 = 0.86650 * b3 + white * 0.3104856;
        b4 = 0.55000 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.0168980;
        output[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
        output[i] *= 0.11;
        b6 = white * 0.115926;
      }
    } else if (type === 'brown') {
      let lastOut = 0.0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        output[i] = (lastOut + (0.02 * white)) / 1.02;
        lastOut = output[i];
        output[i] *= 3.5;
      }
    } else {
      for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
      }
    }
    return buffer;
  }

  _setupRainSynth() {
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    const noiseBuffer = this._createNoiseBuffer('pink', 4);
    const source = this.ctx.createBufferSource();
    source.buffer = noiseBuffer;
    source.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1400;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterAmbientGain);
    source.start(0);
    this.channels.rain.synthGainNode = gain;
  }

  _setupWindSynth() {
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    const brownBuffer = this._createNoiseBuffer('brown', 5);
    const source = this.ctx.createBufferSource();
    source.buffer = brownBuffer;
    source.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 500;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterAmbientGain);
    source.start(0);
    this.channels.wind.synthGainNode = gain;
  }

  _setupThunderSynth() {
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    gain.connect(this.masterAmbientGain);
    this.channels.thunder.synthGainNode = gain;
  }

  _setupCricketsSynth() {
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    gain.connect(this.masterAmbientGain);
    this.channels.crickets.synthGainNode = gain;
  }

  _setupChatterSynth() {
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    const noiseBuffer = this._createNoiseBuffer('pink', 3);
    const source = this.ctx.createBufferSource();
    source.buffer = noiseBuffer;
    source.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 900;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterAmbientGain);
    source.start(0);
    this.channels.chatter.synthGainNode = gain;
  }

  _setupFireplaceSynth() {
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    const noiseBuffer = this._createNoiseBuffer('white', 2);
    const source = this.ctx.createBufferSource();
    source.buffer = noiseBuffer;
    source.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 2500;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterAmbientGain);
    source.start(0);
    this.channels.fireplace.synthGainNode = gain;
  }

  _setupBirdsSynth() {
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    gain.connect(this.masterAmbientGain);
    this.channels.birds.synthGainNode = gain;
  }

  _setupTeaClinkSynth() {
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    gain.connect(this.masterAmbientGain);
    this.channels['tea-clink'].synthGainNode = gain;
  }
}

// Global Singleton Instance
window.audioEngine = new AudioEngine();
