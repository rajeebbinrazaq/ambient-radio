/* ==========================================================================
   KERALA TEA SHOP AMBIENT RADIO - MAIN APP CONTROLLER
   ========================================================================== */

class App {
  constructor() {
    this.radioStations = [];
    this.lastUnmutedVolume = 0.8;
    this.activePresetKey = null;
    this.isELink = () => document.body.classList.contains('theme-elink');
    this.presets = {
      'night-rain': {
        name: 'രാത്രി മഴ',
        levels: { rain: 0.40, wind: 0.20, crickets: 0.15, fireplace: 0.10 }
      },
      'heavy-rain': {
        name: 'പെരുമഴകാലം',
        levels: { rain: 0.40, wind: 0.20, crickets: 0.15, thunder: 0.40 }
      },
      'morning': {
        name: 'രാവിലെ',
        levels: { birds: 0.40, wind: 0.05 }
      },
      'river-bank': {
        name: 'പുഴയോരം',
        levels: { boat: 0.20, birds: 0.10 }
      },
      'malabar-express': {
        name: 'മലബാർ എക്സ്പ്രസ്സ്',
        levels: { train: 0.40, wind: 0.10 }
      },
      'seashore': {
        name: 'കടൽതീരം',
        levels: { waves: 0.40, chatter: 0.15 }
      }
    };
  }

  async init() {
    this._bindDOM();
    this._setupEventListeners();
    this._initRainCanvas();
    this._initVisualizerCanvas();
    
    await this.fetchMalayalamRadioStations();
    this.restoreLastSavedSettings();
    this._initClock();
    this._initWeather();
  }

  _bindDOM() {
    // Inject percentage labels for all range sliders
    document.querySelectorAll('input[type="range"]').forEach(slider => {
      if (!slider.parentElement.querySelector('.vol-percentage')) {
        const span = document.createElement('span');
        span.className = 'vol-percentage';
        span.innerText = Math.round(slider.value * 100) + '%';
        slider.parentElement.appendChild(span);
      }
    });

    this.elements = {
      // Controls
      stationSelect: document.getElementById('stationSelect'),
      playPauseRadioBtn: document.getElementById('playPauseRadioBtn'),
      playIcon: document.getElementById('playIcon'),
      radioVolume: document.getElementById('radioVolume'),

      // Now Playing & Radio Frame UI
      radioPowerLed: document.getElementById('radioPowerLed'),
      volKnobVisual: document.getElementById('volKnobVisual'),
      tuneKnobVisual: document.getElementById('tuneKnobVisual'),
      tuningNeedle: document.getElementById('tuningNeedle'),
      sourceTag: document.getElementById('sourceTag'),
      nowPlayingTitle: document.getElementById('nowPlayingTitle'),
      nowPlayingSubtitle: document.getElementById('nowPlayingSubtitle'),
      stationFavicon: document.getElementById('stationFavicon'),
      stationFallbackIcon: document.getElementById('stationFallbackIcon'),
      masterAmbientVolume: document.getElementById('masterAmbientVolume')
    };
  }

  getStationByUrl(url) {
    if (!url) return null;
    return this.radioStations.find(st => st.url === url) || null;
  }

  _updateSliderPercentage(slider) {
    if (!slider || !slider.parentElement) return;
    const span = slider.parentElement.querySelector('.vol-percentage');
    if (span) {
      span.innerText = Math.round(slider.value * 100) + '%';
    }
  }

  _updateTuningNeedle() {
    if (!this.elements.tuningNeedle || !this.elements.stationSelect) return;
    const select = this.elements.stationSelect;
    const idx = select.selectedIndex >= 0 ? select.selectedIndex : 0;
    const total = select.options.length || 1;
    const pct = Math.max(8, Math.min(92, (idx / (total - 1 || 1)) * 84 + 8));
    this.elements.tuningNeedle.style.left = `${pct}%`;

    // Rotate the tuning knob visually (-135deg to +135deg)
    if (this.elements.tuneKnobVisual) {
      const angle = (idx / (total - 1 || 1)) * 270 - 135;
      this.elements.tuneKnobVisual.style.transform = `rotate(${angle}deg)`;
    }
  }

  setRadioVolumeLevel(volVal) {
    const val = Math.max(0, Math.min(1, parseFloat(volVal || 0)));
    if (val > 0) {
      this.lastUnmutedVolume = val;
    }
    if (this.elements.radioVolume) {
      this.elements.radioVolume.value = val;
      this._updateSliderPercentage(this.elements.radioVolume);
    }
    if (window.audioEngine) {
      window.audioEngine.setRadioVolume(val);
    }
    localStorage.setItem('chaya_kada_radio_volume', val);
    this._updateVolumeKnobRotation(val);

    this._updateVolumeKnobGlow();
  }

  _updateVolumeKnobGlow() {
    if (!this.elements.volKnobVisual) return;
    const vol = this.elements.radioVolume ? parseFloat(this.elements.radioVolume.value || 0) : 0;
    const isPlaying = window.audioEngine ? window.audioEngine.isPlayingRadio : false;
    const isLoading = window.audioEngine ? window.audioEngine.isLoadingRadio : false;

    if (vol === 0) {
      this.elements.volKnobVisual.classList.add('is-muted');
      this.elements.volKnobVisual.classList.remove('is-streaming', 'loading');
    } else if (isPlaying) {
      this.elements.volKnobVisual.classList.add('is-streaming');
      this.elements.volKnobVisual.classList.remove('is-muted', 'loading');
    } else if (isLoading) {
      this.elements.volKnobVisual.classList.add('loading');
      this.elements.volKnobVisual.classList.remove('is-muted', 'is-streaming');
    } else {
      this.elements.volKnobVisual.classList.remove('is-muted', 'is-streaming', 'loading');
    }
  }

  _updateVolumeKnobRotation(volVal) {
    if (!this.elements.volKnobVisual) return;
    const val = parseFloat(volVal || 0);
    const angle = (val * 270) - 135; // 0 -> -135deg, 1 -> +135deg
    this.elements.volKnobVisual.style.transform = `rotate(${angle}deg)`;
  }

  _displayStationDetails(url) {
    const st = this.getStationByUrl(url);
    const selectedOpt = this.elements.stationSelect && this.elements.stationSelect.selectedIndex >= 0 ? this.elements.stationSelect.options[this.elements.stationSelect.selectedIndex] : null;
    let rawName = selectedOpt ? selectedOpt.textContent.trim() : 'Malayalam Radio';
    const name = st ? st.name : (rawName || 'Malayalam Radio');
    const favicon = st ? st.favicon : '';
    const subtitleHtml = `<span class="ml-text">മലയാളം ലൈവ് സ്ട്രീമിംഗ്</span><span class="en-text">Malayalam Live Streaming</span>`;
    this.updateNowPlayingInfo('LIVE RADIO', name, subtitleHtml, favicon);
    this._updateTuningNeedle();
  }

  // Restore saved station, volume, and ambient slider settings silently
  restoreLastSavedSettings() {
    // 1. Saved Radio Station
    let savedStationUrl = localStorage.getItem('chaya_kada_last_station');
    if (savedStationUrl && savedStationUrl.startsWith('http://')) {
      savedStationUrl = savedStationUrl.replace(/^http:\/\//i, 'https://');
      localStorage.setItem('chaya_kada_last_station', savedStationUrl);
    }
    if (savedStationUrl && this.elements.stationSelect) {
      this.elements.stationSelect.value = savedStationUrl;
      this._displayStationDetails(savedStationUrl);
    }

    // 2. Saved Radio Volume
    const savedRadioVol = localStorage.getItem('chaya_kada_radio_volume');
    if (savedRadioVol !== null && this.elements.radioVolume) {
      const volNum = parseFloat(savedRadioVol);
      if (volNum > 0) this.lastUnmutedVolume = volNum;
      this.setRadioVolumeLevel(volNum);
    } else if (this.elements.radioVolume) {
      this.setRadioVolumeLevel(this.elements.radioVolume.value);
    }

    // 3. Restore Master Ambient Volume
    const savedAmbientMasterVol = localStorage.getItem('chaya_kada_ambient_master_volume');
    if (savedAmbientMasterVol !== null && this.elements.masterAmbientVolume) {
      const volNum = parseFloat(savedAmbientMasterVol);
      this.elements.masterAmbientVolume.value = volNum;
      this._updateSliderPercentage(this.elements.masterAmbientVolume);
      if (window.audioEngine) window.audioEngine.setMasterAmbientVolume(volNum);
    } else if (window.audioEngine) {
      window.audioEngine.setMasterAmbientVolume(1.0);
    }

    // 4. Ambient Channels: Always clear ambient card selection on every page reload
    localStorage.removeItem('chaya_kada_ambient_levels');
    this.activePresetKey = null;
    this._updatePresetPillsUI();
    document.querySelectorAll('.sound-volume').forEach(slider => {
      const sound = slider.dataset.sound;
      slider.value = 0;
      this._updateChannelDisplay(sound, 0);
      if (window.audioEngine) {
        window.audioEngine.setChannelVolume(sound, 0);
      }
    });
  }

  async applyPreset(presetKey) {
    await window.audioEngine.ensureContextRunning();

    if (this.activePresetKey === presetKey) {
      // Deselect preset if clicked again
      this.clearPresetSelection();
      return;
    }

    const preset = this.presets[presetKey];
    if (!preset) return;

    this.activePresetKey = presetKey;
    this._updatePresetPillsUI();

    const targetLevels = preset.levels || {};
    const allSliders = document.querySelectorAll('.sound-volume');

    allSliders.forEach(slider => {
      const sound = slider.dataset.sound;
      const targetVol = targetLevels[sound] !== undefined ? targetLevels[sound] : 0;
      slider.value = targetVol;
      this._updateChannelDisplay(sound, targetVol);
      if (window.audioEngine) {
        window.audioEngine.setChannelVolume(sound, targetVol);
      }
    });

    this.saveAmbientLevels();
  }

  clearPresetSelection() {
    this.activePresetKey = null;
    this._updatePresetPillsUI();
    const allSliders = document.querySelectorAll('.sound-volume');
    allSliders.forEach(slider => {
      const sound = slider.dataset.sound;
      slider.value = 0;
      this._updateChannelDisplay(sound, 0);
      if (window.audioEngine) {
        window.audioEngine.setChannelVolume(sound, 0);
      }
    });
    this.saveAmbientLevels();
  }

  _updatePresetPillsUI() {
    document.querySelectorAll('.preset-toggle-btn').forEach(btn => {
      const statusEl = btn.querySelector('.preset-toggle-status');
      if (btn.dataset.preset === this.activePresetKey) {
        btn.classList.add('active');
        if (statusEl) statusEl.textContent = 'ON';
      } else {
        btn.classList.remove('active');
        if (statusEl) statusEl.textContent = 'OFF';
      }
    });
  }

  _checkOrClearActivePreset() {
    if (!this.activePresetKey) return;
    const preset = this.presets[this.activePresetKey];
    if (!preset) {
      this.activePresetKey = null;
      this._updatePresetPillsUI();
      return;
    }

    const allSliders = document.querySelectorAll('.sound-volume');
    let matches = true;
    allSliders.forEach(slider => {
      const sound = slider.dataset.sound;
      const targetVol = preset.levels[sound] !== undefined ? preset.levels[sound] : 0;
      const currentVol = parseFloat(slider.value || 0);
      if (Math.abs(currentVol - targetVol) > 0.01) {
        matches = false;
      }
    });

    if (!matches) {
      this.activePresetKey = null;
      this._updatePresetPillsUI();
    }
  }

  saveAmbientLevels() {
    // Ambient selections are not persisted across reloads as requested
    localStorage.removeItem('chaya_kada_ambient_levels');
  }

  _updateChannelDisplay(sound, vol) {
    const card = document.querySelector(`.sc[data-sound="${sound}"]`);
    if (!card) return;

    const slider = card.querySelector('.sound-volume');
    if (slider) this._updateSliderPercentage(slider);

    const val = Math.max(0, Math.min(1, parseFloat(vol || 0)));
    const pct = Math.round(val * 100);

    const statusEl = card.querySelector('.sound-status');
    if (statusEl) {
      statusEl.textContent = `${pct}%`;
    }

    const tagEl = card.querySelector('.sc-status-tag');
    if (val > 0) {
      card.classList.add('active');
      if (tagEl) {
        tagEl.textContent = 'ON';
        tagEl.classList.add('active');
      }
    } else {
      card.classList.remove('active');
      if (tagEl) {
        tagEl.textContent = 'OFF';
        tagEl.classList.remove('active');
      }
    }

    const bars = card.querySelectorAll('.sc-graph-bar');
    const fillCount = Math.ceil(val * bars.length);
    bars.forEach((bar, idx) => {
      if (idx < fillCount) {
        bar.classList.add('filled');
      } else {
        bar.classList.remove('filled');
      }
    });
  }

  // Sanitize and upgrade station URLs to HTTPS (preventing Mixed Content blocking on HTTPS hosts like Vercel)
  _sanitizeStationUrls(stations) {
    if (!Array.isArray(stations)) return [];
    const isHttpsHost = window.location.protocol === 'https:';

    return stations
      .map(st => {
        let url = (st.url || '').trim();
        if (url.startsWith('http://')) {
          url = url.replace(/^http:\/\//i, 'https://');
        }
        return {
          ...st,
          url: url
        };
      })
      .filter(st => {
        if (!st.url) return false;
        // On HTTPS origins (e.g. Vercel), ensure only HTTPS stream URLs are used
        if (isHttpsHost && !st.url.startsWith('https://')) {
          return false;
        }
        return true;
      });
  }

  // Fetch real-time active Malayalam stations from Radio-Browser API and apply saved station order
  async fetchMalayalamRadioStations() {
    const savedRadioOrderStr = localStorage.getItem('chaya_kada_radio_stations');
    
    if (savedRadioOrderStr) {
      try {
        const parsed = JSON.parse(savedRadioOrderStr);
        const sanitized = this._sanitizeStationUrls(parsed);
        if (sanitized && sanitized.length > 0) {
          this.radioStations = sanitized;
          this.populateStationSelect();
          return;
        }
      } catch (e) {
        console.warn("Saved radio order invalid, fetching fresh...", e);
      }
    }

    try {
      const response = await fetch('https://de1.api.radio-browser.info/json/stations/search?language=malayalam&hidebroken=true&order=votes&reverse=true');
      const data = await response.json();

      if (data && data.length > 0) {
        const mapped = data.map(st => ({
          name: st.name.trim(),
          url: (st.url_resolved || st.url || '').trim(),
          favicon: st.favicon || '',
          codec: st.codec || 'MP3',
          bitrate: st.bitrate || 128
        }));
        this.radioStations = this._sanitizeStationUrls(mapped);
      }

      if (!this.radioStations || this.radioStations.length === 0) {
        this.radioStations = this._getDefaultFallbackStations();
      }
    } catch (err) {
      console.warn("API Fetch error, loading fallback Malayalam stations:", err);
      this.radioStations = this._getDefaultFallbackStations();
    }

    this.saveRadioStations();
    this.populateStationSelect();
  }

  _getDefaultFallbackStations() {
    return [
      { name: "AIR Malayalam (ആകാശവാണി)", url: "https://air.pc.cdn.bitgravity.com/air/live/pbaudio230/playlist.m3u8", favicon: "" },
      { name: "Radio Malayalam 98.6 FM", url: "https://stream.zeno.fm/512rbf1e3qzuv", favicon: "" },
      { name: "London Malayalam Radio", url: "https://ais-edge105-live365-dal02.cdnstream.com/a50671", favicon: "" },
      { name: "Raagam AIR 24*7", url: "https://airhlspush.pc.cdn.bitgravity.com/httppush/hlspbaudioragam/hlspbaudioragam_Auto.m3u8", favicon: "" },
      { name: "KJ Yesudas Radio", url: "https://stream.zeno.fm/9x1sw687nf9uv", favicon: "" },
      { name: "Radio Suno 91.7 FM", url: "https://playerservices.streamtheworld.com/api/livestream-redirect/SUNO917_SC", favicon: "" },
      { name: "Aaha Radio", url: "https://s2.radio.co/s3801784f1/listen", favicon: "" }
    ];
  }

  saveRadioStations() {
    localStorage.setItem('chaya_kada_radio_stations', JSON.stringify(this.radioStations));
  }

  populateStationSelect() {
    const select = this.elements.stationSelect;
    select.innerHTML = '';

    if (this.radioStations.length > 0) {
      const optGroupApi = document.createElement('optgroup');
      optGroupApi.label = this.isELink() ? `Malayalam Radios (${this.radioStations.length})` : `മലയാളം റേഡിയോകൾ (${this.radioStations.length})`;
      
      this.radioStations.forEach((st) => {
        const opt = document.createElement('option');
        opt.value = st.url;
        opt.textContent = st.name; // Clean Station Name Only
        optGroupApi.appendChild(opt);
      });
      select.appendChild(optGroupApi);

      

      if (!localStorage.getItem('chaya_kada_last_station')) {
        const subtitleHtml = `<span class="ml-text">മലയാളം ലൈവ് സ്ട്രീമിംഗ്</span><span class="en-text">Malayalam Live Streaming</span>`;
        this.updateNowPlayingInfo('LIVE RADIO', this.radioStations[0].name, subtitleHtml);
      }
    } else {
      select.innerHTML = this.isELink() ? '<option value="">Radio Unavailable (Check Connection)</option>' : '<option value="">റേഡിയോ ലഭ്യമല്ല (ചെക്ക് കണക്ഷൻ)</option>';
    }
  }

  _setupEventListeners() {

    // Theme Toggle
    const themeToggleCheckbox = document.getElementById('themeToggleCheckbox');
    if (themeToggleCheckbox) {
      themeToggleCheckbox.addEventListener('change', () => {
        document.body.classList.toggle('theme-elink');
        this.populateStationSelect();
        const subtitleHtml = `<span class="ml-text">മലയാളം ലൈവ് സ്ട്രീമിംഗ്</span><span class="en-text">Malayalam Live Streaming</span>`;
        if (this.elements.nowPlayingSubtitle && this.elements.nowPlayingSubtitle.innerHTML.includes('സ്ട്രീമിംഗ്') || this.elements.nowPlayingSubtitle.innerHTML.includes('Streaming')) {
            this.elements.nowPlayingSubtitle.innerHTML = subtitleHtml;
        }
      });
    }

    // Radio Play/Pause Controls
    if (this.elements.playPauseRadioBtn) {
      this.elements.playPauseRadioBtn.addEventListener('click', () => {
        this.togglePlayPauseRadio();
      });
    }

    this.elements.stationSelect.addEventListener('change', async () => {
      const url = this.elements.stationSelect.value;
      if (!url) return;
      localStorage.setItem('chaya_kada_last_station', url);
      this._displayStationDetails(url);
      
      if (window.audioEngine.isPlayingRadio) {
        await window.audioEngine.ensureContextRunning();
        window.audioEngine.playRadio(url);
      }
    });

    this.elements.radioVolume.addEventListener('input', (e) => {
      this.setRadioVolumeLevel(e.target.value);
    });

    if (this.elements.masterAmbientVolume) {
      this.elements.masterAmbientVolume.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        this._updateSliderPercentage(this.elements.masterAmbientVolume);
        if (window.audioEngine) window.audioEngine.setMasterAmbientVolume(val);
        localStorage.setItem('chaya_kada_ambient_master_volume', val);
      });
    }

    // Volume Knob Interaction (Click to Mute/Unmute, Scroll to adjust volume)
    if (this.elements.volKnobVisual && this.elements.radioVolume) {
      this.elements.volKnobVisual.addEventListener('click', () => {
        let currentVol = parseFloat(this.elements.radioVolume.value || 0);
        if (currentVol > 0) {
          this.setRadioVolumeLevel(0);
        } else {
          let restoreVol = (this.lastUnmutedVolume && this.lastUnmutedVolume > 0) ? this.lastUnmutedVolume : 0.8;
          this.setRadioVolumeLevel(restoreVol);
        }
      });

      this.elements.volKnobVisual.addEventListener('wheel', (e) => {
        e.preventDefault();
        let currentVol = parseFloat(this.elements.radioVolume.value || 0);
        let step = 0.05;
        let newVol = currentVol + (e.deltaY < 0 ? step : -step);
        newVol = Math.max(0, Math.min(1, Math.round(newVol * 100) / 100));
        this.setRadioVolumeLevel(newVol);
      }, { passive: false });
    }

    // Tuning Knob Interaction (Click to Play/Pause, Scroll to change station)
    if (this.elements.tuneKnobVisual) {
      this.elements.tuneKnobVisual.addEventListener('click', () => {
        this.togglePlayPauseRadio();
      });

      this.elements.tuneKnobVisual.addEventListener('wheel', (e) => {
        e.preventDefault();
        const select = this.elements.stationSelect;
        if (select.options.length <= 1) return;
        let newIdx = select.selectedIndex + (e.deltaY > 0 ? 1 : -1);
        if (newIdx < 0) newIdx = select.options.length - 1;
        if (newIdx >= select.options.length) newIdx = 0;
        select.selectedIndex = newIdx;
        select.dispatchEvent(new Event('change'));
      }, { passive: false });
    }

    // Preset Toggle Buttons Event Listeners
    document.querySelectorAll('.preset-toggle-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const key = btn.dataset.preset;
        if (key) this.applyPreset(key);
      });
    });

    // Ambient Sound Volume Sliders
    document.querySelectorAll('.sound-volume').forEach(slider => {
      slider.addEventListener('input', async (e) => {
        await window.audioEngine.ensureContextRunning();
        const sound = e.target.dataset.sound;
        const val = parseFloat(e.target.value);
        this._updateChannelDisplay(sound, val);
        window.audioEngine.setChannelVolume(sound, val);
        this._checkOrClearActivePreset();
        this.saveAmbientLevels();
      });
    });

    // Ambient Card Click - Toggle card volume on/off
    document.querySelectorAll('.sc.ambient-channel').forEach(card => {
      card.addEventListener('click', async (e) => {
        if (e.target.tagName === 'INPUT') return;
        await window.audioEngine.ensureContextRunning();
        const sound = card.dataset.sound;
        const slider = card.querySelector('.sound-volume');
        if (!slider) return;

        let currentVal = parseFloat(slider.value);
        let newVal = (currentVal > 0) ? 0 : 0.4;
        slider.value = newVal;
        this._updateChannelDisplay(sound, newVal);
        window.audioEngine.setChannelVolume(sound, newVal);
        this._checkOrClearActivePreset();
        this.saveAmbientLevels();
      });
    });
  }

  async togglePlayPauseRadio() {
    await window.audioEngine.ensureContextRunning();

    if (window.audioEngine.isPlayingRadio || window.audioEngine.isLoadingRadio) {
      window.audioEngine.pauseRadio();
    } else {
      const url = this.elements.stationSelect ? this.elements.stationSelect.value : '';
      if (!url) return;
      this._displayStationDetails(url);
      window.audioEngine.playRadio(url);
    }
  }

  updatePlaybackUI(source, state) {
    const isPlaying = (state === 'playing' || state === true);
    const isLoading = (state === 'loading');
    const isError = (state === 'error');

    if (this.elements.radioPowerLed) {
      if (isLoading) {
        this.elements.radioPowerLed.className = 'radio-indicator-light loading';
      } else if (isPlaying) {
        this.elements.radioPowerLed.className = 'radio-indicator-light active';
      } else if (isError) {
        this.elements.radioPowerLed.className = 'radio-indicator-light error';
      } else {
        this.elements.radioPowerLed.className = 'radio-indicator-light';
      }
    }

    if (this.elements.stationSelect) {
      if (isLoading) {
        this.elements.stationSelect.classList.add('is-loading');
        this.elements.stationSelect.classList.remove('is-streaming');
      } else if (isPlaying) {
        this.elements.stationSelect.classList.add('is-streaming');
        this.elements.stationSelect.classList.remove('is-loading');
      } else {
        this.elements.stationSelect.classList.remove('is-streaming', 'is-loading');
      }
    }

    if (this.elements.tuneKnobVisual) {
      if (isLoading) {
        this.elements.tuneKnobVisual.classList.add('loading');
        this.elements.tuneKnobVisual.classList.remove('is-streaming');
      } else if (isPlaying) {
        this.elements.tuneKnobVisual.classList.add('is-streaming');
        this.elements.tuneKnobVisual.classList.remove('loading');
      } else {
        this.elements.tuneKnobVisual.classList.remove('is-streaming', 'loading');
      }
    }

    this._updateVolumeKnobGlow();

    if (this.elements.nowPlayingSubtitle) {
      const mlText = 'മലയാളം ലൈവ് സ്ട്രീമിംഗ്';
      const enText = 'Malayalam Live Streaming';
      const defaultHtml = `<span class="ml-text">${mlText}</span><span class="en-text">${enText}</span>`;
      if (isLoading) {
        this.elements.nowPlayingSubtitle.innerHTML = `<span class="ml-text">കണക്ട് ചെയ്യുന്നു...</span><span class="en-text">Connecting...</span>`;
      } else if (isPlaying) {
        this.elements.nowPlayingSubtitle.innerHTML = defaultHtml;
      } else if (isError) {
        this.elements.nowPlayingSubtitle.innerHTML = `<span class="ml-text">കണക്ഷൻ തടസ്സപ്പെട്ടു</span><span class="en-text">Connection Interrupted</span>`;
      } else {
        this.elements.nowPlayingSubtitle.innerHTML = defaultHtml;
      }
    }
  }

  updateNowPlayingInfo(tag, title, subtitleHtml, favicon = '') {
    if (this.elements.sourceTag) this.elements.sourceTag.textContent = tag;
    if (this.elements.nowPlayingTitle) this.elements.nowPlayingTitle.textContent = title;
    if (this.elements.nowPlayingSubtitle) this.elements.nowPlayingSubtitle.innerHTML = subtitleHtml;

    if (this.elements.stationFavicon) {
      if (favicon && favicon.trim() !== '') {
        this.elements.stationFavicon.src = favicon;
        this.elements.stationFavicon.classList.remove('hidden');
        if (this.elements.stationFallbackIcon) this.elements.stationFallbackIcon.classList.add('hidden');
        this.elements.stationFavicon.onerror = () => {
          this.elements.stationFavicon.classList.add('hidden');
          if (this.elements.stationFallbackIcon) this.elements.stationFallbackIcon.classList.remove('hidden');
        };
      } else {
        this.elements.stationFavicon.classList.add('hidden');
        if (this.elements.stationFallbackIcon) this.elements.stationFallbackIcon.classList.remove('hidden');
      }
    }
  }

  /* ==========================================================================
     CANVAS VISUALIZERS (RAIN DROPS & AUDIO SPECTRUM)
     ========================================================================== */

  _initRainCanvas() {
    const canvas = document.getElementById('rainCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    let width = canvas.width = window.innerWidth;
    let height = canvas.height = window.innerHeight;

    window.addEventListener('resize', () => {
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    });

    const drops = [];
    for (let i = 0; i < 90; i++) {
      drops.push({
        x: Math.random() * width,
        y: Math.random() * height,
        length: Math.random() * 20 + 10,
        speed: Math.random() * 8 + 6,
        opacity: Math.random() * 0.4 + 0.1
      });
    }

    const drawRain = () => {
      ctx.clearRect(0, 0, width, height);
      ctx.strokeStyle = 'rgba(115, 112, 160, 0.25)';
      ctx.lineWidth = 1.2;

      drops.forEach(d => {
        ctx.beginPath();
        ctx.moveTo(d.x, d.y);
        ctx.lineTo(d.x - 2, d.y + d.length);
        ctx.stroke();

        d.y += d.speed;
        d.x -= 0.5;

        if (d.y > height) {
          d.y = -20;
          d.x = Math.random() * width;
        }
      });

      requestAnimationFrame(drawRain);
    };

    drawRain();
  }

  _initVisualizerCanvas() {
    const canvas = document.getElementById('visualizerCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const render = () => {
      requestAnimationFrame(render);
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (!window.audioEngine || !window.audioEngine.analyser) return;

      const bufferLength = window.audioEngine.analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      window.audioEngine.analyser.getByteFrequencyData(dataArray);

      const barWidth = (canvas.width / bufferLength) * 2.5;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const barHeight = (dataArray[i] / 255) * canvas.height * 0.7;

        const gradient = ctx.createLinearGradient(0, canvas.height, 0, canvas.height - barHeight);
        gradient.addColorStop(0, 'rgba(38, 36, 60, 0.2)');
        gradient.addColorStop(1, 'rgba(115, 112, 160, 0.6)');

        ctx.fillStyle = gradient;
        ctx.fillRect(x, canvas.height - barHeight, barWidth - 2, barHeight);

        x += barWidth;
      }
    };

    render();
  }

  _initClock() {
    const clockEl = document.getElementById('digitalClock');
    if (!clockEl) return;

    const updateClock = () => {
      const now = new Date();
      const utcTime = now.getTime() + (now.getTimezoneOffset() * 60000);
      const istTime = new Date(utcTime + (330 * 60000)); // +5:30
      
      let hours = istTime.getHours();
      let minutes = istTime.getMinutes();
      const ampm = hours >= 12 ? 'PM' : 'AM';
      hours = hours % 12;
      hours = hours ? hours : 12;
      minutes = minutes < 10 ? '0' + minutes : minutes;
      
      clockEl.textContent = `${hours}:${minutes} ${ampm}`;
      
      const calendarEl = document.getElementById('calendarDate');
      if (calendarEl) {
        const mlSpan = calendarEl.querySelector('.ml-text');
        const enSpan = calendarEl.querySelector('.en-text');
        if (mlSpan && enSpan) {
          const mlDateStr = new Intl.DateTimeFormat('ml-IN', {
            weekday: 'short', year: 'numeric', month: 'short', day: 'numeric', timeZone: 'Asia/Kolkata'
          }).format(now);
          const enDateStr = new Intl.DateTimeFormat('en-IN', {
            weekday: 'short', year: 'numeric', month: 'short', day: 'numeric', timeZone: 'Asia/Kolkata'
          }).format(now);
          mlSpan.textContent = mlDateStr;
          enSpan.textContent = enDateStr;
        }
      }
    };

    updateClock();
    setInterval(updateClock, 10000); // update frequently enough
  }

  _initWeather() {
    const weatherEl = document.getElementById('weatherCondition');
    if (!weatherEl) return;

    const fetchWeather = async () => {
      try {
        // Fetch weather for Kochi, Kerala
        const response = await fetch('https://api.open-meteo.com/v1/forecast?latitude=9.9312&longitude=76.2673&current_weather=true');
        const data = await response.json();
        
        if (data && data.current_weather) {
          const code = data.current_weather.weathercode;
          const temp = Math.round(data.current_weather.temperature);
          
          let mlCondition = 'വ്യക്തമായ';
          let enCondition = 'Clear';
          let emoji = '☀️';
          
          if (code === 0) { mlCondition = 'തെളിഞ്ഞ ആകാശം'; enCondition = 'Clear Sky'; emoji = '☀️'; }
          else if (code === 1 || code === 2 || code === 3) { mlCondition = 'മേഘാവൃതം'; enCondition = 'Cloudy'; emoji = '⛅'; }
          else if (code === 45 || code === 48) { mlCondition = 'മൂടൽമഞ്ഞ്'; enCondition = 'Fog'; emoji = '🌫️'; }
          else if (code >= 51 && code <= 57) { mlCondition = 'ചാറ്റൽ മഴ'; enCondition = 'Drizzle'; emoji = '🌦️'; }
          else if (code >= 61 && code <= 67) { mlCondition = 'മഴ'; enCondition = 'Rain'; emoji = '🌧️'; }
          else if (code >= 71 && code <= 77) { mlCondition = 'മഞ്ഞുവീഴ്ച'; enCondition = 'Snow'; emoji = '❄️'; }
          else if (code >= 80 && code <= 82) { mlCondition = 'ശക്തമായ മഴ'; enCondition = 'Heavy Rain'; emoji = '⛈️'; }
          else if (code >= 85 && code <= 86) { mlCondition = 'മഞ്ഞുവീഴ്ച'; enCondition = 'Snow'; emoji = '❄️'; }
          else if (code >= 95 && code <= 99) { mlCondition = 'ഇടിമിന്നൽ'; enCondition = 'Thunderstorm'; emoji = '🌩️'; }
          
          const mlSpan = weatherEl.querySelector('.ml-text');
          const enSpan = weatherEl.querySelector('.en-text');
          
          if (mlSpan && enSpan) {
            mlSpan.textContent = `${emoji} ${temp}°C, ${mlCondition}`;
            enSpan.textContent = `${emoji} ${temp}°C, ${enCondition}`;
          }
        }
      } catch (err) {
        console.error('Failed to fetch weather:', err);
      }
    };
    
    fetchWeather();
    // Update every 30 minutes
    setInterval(fetchWeather, 30 * 60 * 1000);
  }
}

// Instantiate and initialize on DOM Load
document.addEventListener('DOMContentLoaded', () => {
  window.app = new App();
  window.app.init();
});
