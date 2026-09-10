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
    this.radioAudio.crossOrigin = "anonymous";
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

    // Ambient Channels State (All 0 by default on every reload)
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

    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AudioCtx();

    // Master Output & Analyser
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 1.0;

    this.masterAmbientGain = this.ctx.createGain();
    this.masterAmbientGain.gain.value = this.isStreamingActive ? 1.0 : 0;
    this.masterAmbientGain.connect(this.masterGain);

    this.masterRadioGain = this.ctx.createGain();
    this.masterRadioGain.gain.value = 0.95;
    this.masterRadioGain.connect(this.masterGain);

    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 64;
    this.masterGain.connect(this.analyser);
    this.analyser.connect(this.ctx.destination);

    // Route Radio Audio Stream safely
    try {
      const radioSource = this.ctx.createMediaElementSource(this.radioAudio);
      this.radioGainNode = this.ctx.createGain();
      this.radioGainNode.gain.value = 0.9;
      radioSource.connect(this.radioGainNode);
      this.radioGainNode.connect(this.masterRadioGain);
    } catch (e) {
      console.warn("Direct HTML5 audio stream output fallback:", e);
    }

    // Load HD Ambient Sound Buffers
    await this._loadAllHDBuffers();
    this._initProceduralSynths();

    this.isInitialized = true;
  }

  async ensureContextRunning() {
    if (!this.ctx) {
      await this.init();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      await this.ctx.resume();
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
    const targetVol = this.isStreamingActive ? 1.0 : 0;
    this.masterAmbientGain.gain.setTargetAtTime(targetVol, this.ctx.currentTime, 0.1);
  }

  // Individual Sound Volume & Mute Controls
  setChannelVolume(sound, vol) {
    if (!this.channels[sound]) return;
    this.channels[sound].volume = parseFloat(vol);
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
    if (!ch || !this.ctx) return;

    const targetVol = ch.muted ? 0 : ch.volume;

    // 1. HD Blanket Decoded Audio Loop Output
    if (ch.gainNode) {
      const hdTarget = (this.engineMode === 'hd') ? targetVol : 0;
      ch.gainNode.gain.setTargetAtTime(hdTarget, this.ctx.currentTime, 0.05);
    }

    // 2. Procedural Synth Output
    if (ch.synthGainNode) {
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
