/* ==========================================================================
   KERALA TEA SHOP AMBIENT RADIO - MAIN APP CONTROLLER
   ========================================================================== */

class App {
  constructor() {
    this.currentLanguage = localStorage.getItem('chaya_kada_lang') || 'ml';
    this.radioStations = [];
    this.customUserItems = JSON.parse(localStorage.getItem('chaya_kada_custom_items') || '[]');
  }

  async init() {
    this._bindDOM();
    this._setupEventListeners();
    this._initRainCanvas();
    this._initVisualizerCanvas();
    
    // Set initial language
    if (this.currentLanguage !== 'ml') {
      this.currentLanguage = 'ml';
      this.toggleLanguage();
    }

    // Fetch live Malayalam stations from Radio-Browser API and restore saved station order
    await this.fetchMalayalamRadioStations();
    
    // Restore last saved settings
    this.restoreLastSavedSettings();
  }

  _bindDOM() {
    this.elements = {
      // Header & Actions
      langToggleBtn: document.getElementById('langToggleBtn'),
      langText: document.getElementById('langText'),
      adminModalBtn: document.getElementById('adminModalBtn'),
      adminModal: document.getElementById('adminModal'),
      closeModalBtn: document.getElementById('closeModalBtn'),
      cancelModalBtn: document.getElementById('cancelModalBtn'),
      saveCustomBtn: document.getElementById('saveCustomBtn'),
      saveRadioOrderBtn: document.getElementById('saveRadioOrderBtn'),

      // Admin Tabs
      adminTabRadios: document.getElementById('adminTabRadios'),
      adminTabCustom: document.getElementById('adminTabCustom'),
      adminRadiosPanel: document.getElementById('adminRadiosPanel'),
      adminCustomPanel: document.getElementById('adminCustomPanel'),
      adminStationListContainer: document.getElementById('adminStationListContainer'),

      // Controls
      stationSelect: document.getElementById('stationSelect'),
      playPauseRadioBtn: document.getElementById('playPauseRadioBtn'),
      playIcon: document.getElementById('playIcon'),
      radioVolume: document.getElementById('radioVolume'),

      // Now Playing UI
      radioPowerLed: document.getElementById('radioPowerLed'),
      tuningNeedle: document.getElementById('tuningNeedle'),
      sourceTag: document.getElementById('sourceTag'),
      nowPlayingTitle: document.getElementById('nowPlayingTitle'),
      nowPlayingSubtitle: document.getElementById('nowPlayingSubtitle'),
      stationFavicon: document.getElementById('stationFavicon'),
      stationFallbackIcon: document.getElementById('stationFallbackIcon')
    };
  }

  getStationByUrl(url) {
    if (!url) return null;
    return this.radioStations.find(st => st.url === url) || null;
  }

  _updateTuningNeedle() {
    if (!this.elements.tuningNeedle || !this.elements.stationSelect) return;
    const select = this.elements.stationSelect;
    const idx = select.selectedIndex >= 0 ? select.selectedIndex : 0;
    const total = select.options.length || 1;
    const pct = Math.max(8, Math.min(92, (idx / (total - 1 || 1)) * 84 + 8));
    this.elements.tuningNeedle.style.left = `${pct}%`;
  }

  _displayStationDetails(url) {
    const st = this.getStationByUrl(url);
    const selectedOpt = this.elements.stationSelect && this.elements.stationSelect.selectedIndex >= 0 ? this.elements.stationSelect.options[this.elements.stationSelect.selectedIndex] : null;
    let rawName = selectedOpt ? selectedOpt.textContent.trim() : 'Malayalam Radio';
    const name = st ? st.name : (rawName || 'Malayalam Radio');
    const favicon = st ? st.favicon : '';
    this.updateNowPlayingInfo('LIVE RADIO', name, (this.currentLanguage === 'ml') ? 'മലയാളം ലൈവ് സ്ട്രീമിംഗ്' : 'Live Malayalam Broadcast', favicon);
    this._updateTuningNeedle();
  }

  // Restore saved station, volume, and ambient slider settings silently
  restoreLastSavedSettings() {
    // 1. Saved Radio Station
    const savedStationUrl = localStorage.getItem('chaya_kada_last_station');
    if (savedStationUrl && this.elements.stationSelect) {
      this.elements.stationSelect.value = savedStationUrl;
      this._displayStationDetails(savedStationUrl);
    }

    // 2. Saved Radio Volume
    const savedRadioVol = localStorage.getItem('chaya_kada_radio_volume');
    if (savedRadioVol !== null && this.elements.radioVolume) {
      this.elements.radioVolume.value = savedRadioVol;
      window.audioEngine.setRadioVolume(savedRadioVol);
    }

    // 3. Keep Master Ambience locked at maximum 1.0
    if (window.audioEngine) {
      window.audioEngine.setMasterAmbientVolume(1.0);
    }

    // 4. Ambient Channels: Always reset to 0 (OFF) by default on every reload
    localStorage.removeItem('chaya_kada_ambient_levels');
    document.querySelectorAll('.sound-volume').forEach(slider => {
      const sound = slider.dataset.sound;
      slider.value = 0;
      this._updateChannelDisplay(sound, 0);
      window.audioEngine.setChannelVolume(sound, 0);
    });
  }

  // Do not remember last setup in case of Ambience sounds
  saveAmbientLevels() {
    localStorage.removeItem('chaya_kada_ambient_levels');
  }

  // Fetch real-time active Malayalam stations from Radio-Browser API and apply saved station order
  async fetchMalayalamRadioStations() {
    const savedRadioOrderStr = localStorage.getItem('chaya_kada_radio_stations');
    
    if (savedRadioOrderStr) {
      try {
        this.radioStations = JSON.parse(savedRadioOrderStr);
        this.populateStationSelect();
        return;
      } catch (e) {
        console.warn("Saved radio order invalid, fetching fresh...", e);
      }
    }

    try {
      const response = await fetch('https://de1.api.radio-browser.info/json/stations/search?language=malayalam&hidebroken=true&order=votes&reverse=true');
      const data = await response.json();

      if (data && data.length > 0) {
        this.radioStations = data.map(st => ({
          name: st.name.trim(),
          url: st.url_resolved || st.url,
          favicon: st.favicon || '',
          codec: st.codec || 'MP3',
          bitrate: st.bitrate || 128
        }));
      } else {
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
      { name: "AIR Malayalam (ആകാശവാണി)", url: "https://air.realhost.co.in/realhost/airmalayalam/playlist.m3u8", favicon: "" },
      { name: "Club FM 94.3", url: "https://clubfm.stream/live", favicon: "" },
      { name: "Radio Mango 91.9", url: "https://radiomango.stream/live", favicon: "" },
      { name: "Radio Suno 91.7", url: "https://suno.stream/live", favicon: "" },
      { name: "Radio City Malayalam", url: "https://radiocity.stream/malayalam", favicon: "" }
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
      optGroupApi.label = `മലയാളം റേഡിയോകൾ (${this.radioStations.length})`;
      
      this.radioStations.forEach((st) => {
        const opt = document.createElement('option');
        opt.value = st.url;
        opt.textContent = st.name; // Clean Station Name Only
        optGroupApi.appendChild(opt);
      });
      select.appendChild(optGroupApi);

      // Custom user radios
      const customRadios = this.customUserItems.filter(i => i.type === 'radio');
      if (customRadios.length > 0) {
        const optGroupCustom = document.createElement('optgroup');
        optGroupCustom.label = "നിങ്ങളുടെ റേഡിയോകൾ (Custom)";
        customRadios.forEach(cr => {
          const opt = document.createElement('option');
          opt.value = cr.url;
          opt.textContent = cr.title;
          optGroupCustom.appendChild(opt);
        });
        select.appendChild(optGroupCustom);
      }

      if (!localStorage.getItem('chaya_kada_last_station')) {
        this.updateNowPlayingInfo('LIVE RADIO', this.radioStations[0].name, (this.currentLanguage === 'ml') ? 'മലയാളം ലൈവ് സ്ട്രീമിംഗ്' : 'Malayalam Live Streaming');
      }
    } else {
      select.innerHTML = '<option value="">റേഡിയോ ലഭ്യമല്ല (ചെക്ക് കണക്ഷൻ)</option>';
    }
  }

  _setupEventListeners() {
    // Language Toggle
    this.elements.langToggleBtn.addEventListener('click', () => {
      this.toggleLanguage();
    });

    // Radio Play/Pause Controls
    this.elements.playPauseRadioBtn.addEventListener('click', async () => {
      await window.audioEngine.ensureContextRunning();

      if (window.audioEngine.isPlayingRadio || window.audioEngine.isLoadingRadio) {
        window.audioEngine.pauseRadio();
      } else {
        const url = this.elements.stationSelect.value;
        if (!url) return;
        this._displayStationDetails(url);
        window.audioEngine.playRadio(url);
      }
    });

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
      window.audioEngine.setRadioVolume(e.target.value);
      localStorage.setItem('chaya_kada_radio_volume', e.target.value);
    });

    // Ambient Sound Volume Sliders
    document.querySelectorAll('.sound-volume').forEach(slider => {
      slider.addEventListener('input', (e) => {
        const sound = e.target.dataset.sound;
        const val = parseFloat(e.target.value);
        this._updateChannelDisplay(sound, val);
        window.audioEngine.setChannelVolume(sound, val);
        this.saveAmbientLevels();
      });
    });

    // Ambient Card Click - Toggle card volume on/off
    document.querySelectorAll('.sc.ambient-channel').forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.target.tagName === 'INPUT') return;
        const sound = card.dataset.sound;
        const slider = card.querySelector('.sound-volume');
        if (!slider) return;

        let currentVal = parseFloat(slider.value);
        let newVal = (currentVal > 0) ? 0 : 0.4;
        slider.value = newVal;
        this._updateChannelDisplay(sound, newVal);
        window.audioEngine.setChannelVolume(sound, newVal);
        this.saveAmbientLevels();
      });
    });

    // Admin Panel Modal Events
    this.elements.adminModalBtn.addEventListener('click', () => {
      this.openAdminModal();
    });
    this.elements.closeModalBtn.addEventListener('click', () => {
      this.closeAdminModal();
    });
    this.elements.cancelModalBtn.addEventListener('click', () => {
      this.closeAdminModal();
    });

    // Admin Tabs
    this.elements.adminTabRadios.addEventListener('click', () => {
      this.switchAdminTab('radios');
    });
    this.elements.adminTabCustom.addEventListener('click', () => {
      this.switchAdminTab('custom');
    });

    // Save Handlers
    this.elements.saveCustomBtn.addEventListener('click', () => {
      this.saveCustomItem();
    });
    this.elements.saveRadioOrderBtn.addEventListener('click', () => {
      this.saveAdminRadioOrder();
    });
  }

  // Update Ambient Card Display (Active State based on Volume > 0)
  _updateChannelDisplay(sound, vol) {
    const card = document.querySelector(`.sc[data-sound="${sound}"]`);
    if (!card) return;

    const numVol = parseFloat(vol) || 0;
    const isActive = (numVol > 0);
    const pct = Math.round(numVol * 100);

    // 1. Card Container Classes
    card.classList.toggle('active', isActive);

    // 2. Volume Value Text & Status Tag
    const valText = card.querySelector('.sound-status');
    if (valText) valText.textContent = `${pct}%`;

    const tag = card.querySelector('.sc-status-tag');
    if (tag) {
      tag.textContent = isActive ? 'ON' : 'OFF';
      tag.classList.toggle('active', isActive);
    }

    // 3. Mini Visualizer Bars (20 bars total)
    const bars = card.querySelectorAll('.sc-graph-bar');
    const filledCount = isActive ? Math.round(numVol * bars.length) : 0;
    bars.forEach((bar, idx) => {
      if (idx < filledCount) {
        bar.classList.add('filled');
      } else {
        bar.classList.remove('filled');
      }
    });

    // 4. Slider Background Fill
    const slider = card.querySelector('.vol-slider');
    if (slider) {
      const activeColor = 'rgba(115, 112, 160, 0.75)';
      slider.style.background = `linear-gradient(to right, ${activeColor} 0%, ${activeColor} ${pct}%, rgba(38, 36, 60, 0.4) ${pct}%, rgba(38, 36, 60, 0.4) 100%)`;
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

    if (isLoading) {
      this.elements.playIcon.className = 'fa-solid fa-spinner fa-spin';
      this.elements.nowPlayingSubtitle.textContent = (this.currentLanguage === 'ml') ? 'കണക്ട് ചെയ്യുന്നു...' : 'Connecting to Live Stream...';
    } else if (isPlaying) {
      this.elements.playIcon.className = 'fa-solid fa-pause';
      this.elements.nowPlayingSubtitle.textContent = (this.currentLanguage === 'ml') ? 'മലയാളം ലൈവ് സ്ട്രീമിംഗ്' : 'Live Malayalam Broadcast';
    } else if (isError) {
      this.elements.playIcon.className = 'fa-solid fa-play';
      this.elements.nowPlayingSubtitle.textContent = (this.currentLanguage === 'ml') ? 'കണക്ഷൻ തടസ്സപ്പെട്ടു' : 'Stream Unavailable';
    } else {
      this.elements.playIcon.className = 'fa-solid fa-play';
      this.elements.nowPlayingSubtitle.textContent = (this.currentLanguage === 'ml') ? 'മലയാളം ലൈവ് സ്ട്രീമിംഗ്' : 'Malayalam Live Streaming';
    }
  }

  updateNowPlayingInfo(tag, title, subtitle, favicon = '') {
    this.elements.sourceTag.textContent = tag;
    this.elements.nowPlayingTitle.textContent = title;
    this.elements.nowPlayingSubtitle.textContent = subtitle;

    // Favicon / Station Logo Artwork
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

  saveCustomItem() {
    const titleInput = document.getElementById('customTitleInput');
    const urlInput = document.getElementById('customUrlInput');
    if (!titleInput || !urlInput) return;

    const title = titleInput.value.trim();
    const url = urlInput.value.trim();

    if (!title || !url) {
      alert(this.currentLanguage === 'ml' ? 'ദയവായി പേരും ലിങ്കും നൽകുക.' : 'Please enter title and URL.');
      return;
    }

    this.customUserItems.push({ type: 'radio', title, url });
    localStorage.setItem('chaya_kada_custom_items', JSON.stringify(this.customUserItems));
    
    titleInput.value = '';
    urlInput.value = '';

    this.populateStationSelect();
    this.closeAdminModal();
    alert(this.currentLanguage === 'ml' ? 'സ്റ്റേഷൻ വിജയികരമായി ചേർത്തു!' : 'Custom Radio Station saved!');
  }

  openAdminModal() {
    this.elements.adminModal.classList.remove('hidden');
    this.renderAdminStationList();
  }

  closeAdminModal() {
    this.elements.adminModal.classList.add('hidden');
  }

  switchAdminTab(tab) {
    if (tab === 'radios') {
      this.elements.adminTabRadios.classList.add('active');
      this.elements.adminTabCustom.classList.remove('active');
      this.elements.adminRadiosPanel.classList.remove('hidden');
      this.elements.adminCustomPanel.classList.add('hidden');
    } else {
      this.elements.adminTabCustom.classList.add('active');
      this.elements.adminTabRadios.classList.remove('active');
      this.elements.adminCustomPanel.classList.remove('hidden');
      this.elements.adminRadiosPanel.classList.add('hidden');
    }
  }

  renderAdminStationList() {
    const container = this.elements.adminStationListContainer;
    container.innerHTML = '';

    this.radioStations.forEach((st, idx) => {
      const item = document.createElement('div');
      item.className = 'admin-station-item';
      item.dataset.index = idx;

      item.innerHTML = `
        <div class="station-reorder-btns">
          <button class="reorder-btn move-up" ${idx === 0 ? 'disabled' : ''}><i class="fa-solid fa-chevron-up"></i></button>
          <button class="reorder-btn move-down" ${idx === this.radioStations.length - 1 ? 'disabled' : ''}><i class="fa-solid fa-chevron-down"></i></button>
        </div>
        <input type="text" class="station-title-input" value="${st.name}">
        <button class="delete-station-btn" title="Remove Station"><i class="fa-solid fa-trash-can"></i></button>
      `;

      item.querySelector('.move-up').addEventListener('click', () => this.reorderStation(idx, -1));
      item.querySelector('.move-down').addEventListener('click', () => this.reorderStation(idx, 1));
      item.querySelector('.delete-station-btn').addEventListener('click', () => this.deleteStation(idx));
      item.querySelector('.station-title-input').addEventListener('change', (e) => {
        this.radioStations[idx].name = e.target.value.trim();
      });

      container.appendChild(item);
    });
  }

  reorderStation(index, direction) {
    const targetIdx = index + direction;
    if (targetIdx < 0 || targetIdx >= this.radioStations.length) return;
    const temp = this.radioStations[index];
    this.radioStations[index] = this.radioStations[targetIdx];
    this.radioStations[targetIdx] = temp;
    this.renderAdminStationList();
  }

  deleteStation(index) {
    if (confirm(this.currentLanguage === 'ml' ? 'ഈ സ്റ്റേഷൻ നീക്കം ചെയ്യണോ?' : 'Remove this station?')) {
      this.radioStations.splice(index, 1);
      this.renderAdminStationList();
    }
  }

  saveAdminRadioOrder() {
    this.saveRadioStations();
    this.populateStationSelect();
    this.closeAdminModal();
    alert(this.currentLanguage === 'ml' ? 'റേഡിയോ ക്രമീകരണം സേവ് ചെയ്തു!' : 'Station order saved!');
  }

  toggleLanguage() {
    this.currentLanguage = (this.currentLanguage === 'ml') ? 'en' : 'ml';
    localStorage.setItem('chaya_kada_lang', this.currentLanguage);
    this.elements.langText.textContent = (this.currentLanguage === 'ml') ? 'EN' : 'ML';

    document.querySelectorAll('.lang-ml').forEach(el => {
      el.classList.toggle('hidden', this.currentLanguage !== 'ml');
    });
    document.querySelectorAll('.lang-en').forEach(el => {
      el.classList.toggle('hidden', this.currentLanguage !== 'en');
    });
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
}

// Instantiate and initialize on DOM Load
document.addEventListener('DOMContentLoaded', () => {
  window.app = new App();
  window.app.init();
});
