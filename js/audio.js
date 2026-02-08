/**
 * audio.js — Web Audio API 기반 BGM/SFX 매니저
 *
 * @module  WormGameAudio
 * @depends (없음 — 독립 모듈, Web Audio API만 사용)
 * @exports global.WormGameAudio
 *
 * ES Module 전환 시: export class AudioManager { ... }
 */
(function attachAudio(global) {
  "use strict";

  var MUSIC_PATTERNS = Object.freeze({
    retro: Object.freeze([
      { lead: 523, bass: 131 },
      { lead: 659 },
      { lead: 784, bass: 147 },
      { lead: 659 },
      { lead: 523, bass: 131 },
      { lead: 659 },
      { lead: 880, bass: 165 },
      { lead: 659 },
      { lead: 494, bass: 123 },
      { lead: 659 },
      { lead: 740, bass: 147 },
      { lead: 659 },
      { lead: 494, bass: 123 },
      { lead: 587 },
      { lead: 659, bass: 147 },
      { lead: 740 },
    ]),
    arcade: Object.freeze([
      { lead: 440, bass: 110 },
      { lead: 554 },
      { lead: 659, bass: 123 },
      { lead: 740 },
      { lead: 659, bass: 131 },
      { lead: 554 },
      { lead: 659, bass: 147 },
      { lead: 880 },
      { lead: 659, bass: 131 },
      { lead: 554 },
      { lead: 494, bass: 123 },
      { lead: 554 },
      { lead: 659, bass: 147 },
      { lead: 740 },
      { lead: 880, bass: 165 },
      { lead: 988 },
    ]),
    chill: Object.freeze([
      { lead: 392, bass: 98 },
      { lead: 440 },
      { lead: 523, bass: 110 },
      { lead: 587 },
      { lead: 523, bass: 98 },
      { lead: 440 },
      { lead: 392, bass: 87 },
      { lead: 440 },
      { lead: 392, bass: 98 },
      { lead: 349 },
      { lead: 330, bass: 82 },
      { lead: 349 },
      { lead: 392, bass: 98 },
      { lead: 440 },
      { lead: 523, bass: 110 },
      { lead: 587 },
    ]),
  });

  function normalizeTrack(track) {
    if (track === "arcade" || track === "chill") {
      return track;
    }
    return "retro";
  }

  function AudioManager() {
    this.context = null;
    this.enabled = true;
    this.unlocked = false;
    this.masterVolume = 0.8;
    this.sfxVolume = 0.8;
    this.bgmEnabled = true;
    this.bgmTrack = "retro";
    this.bgmTimer = null;
    this.bgmStep = 0;
  }

  AudioManager.prototype.setEnabled = function setEnabled(enabled) {
    this.enabled = !!enabled;
    if (!this.enabled) {
      this.stopMusic();
      return;
    }
    this.startMusic(false);
  };

  AudioManager.prototype.setBgmEnabled = function setBgmEnabled(enabled) {
    this.bgmEnabled = !!enabled;
    if (!this.bgmEnabled) {
      this.stopMusic();
      return;
    }
    this.startMusic(false);
  };

  AudioManager.prototype.setMusicTrack = function setMusicTrack(track) {
    var normalized = normalizeTrack(track);
    if (this.bgmTrack === normalized) {
      return;
    }
    this.bgmTrack = normalized;
    this.bgmStep = 0;
    this.startMusic(true);
  };

  AudioManager.prototype.setMasterVolume = function setMasterVolume(value) {
    this.masterVolume = Math.min(1, Math.max(0, Number(value) || 0));
  };

  AudioManager.prototype.setSfxVolume = function setSfxVolume(value) {
    this.sfxVolume = Math.min(1, Math.max(0, Number(value) || 0));
  };

  AudioManager.prototype.ensureContext = function ensureContext() {
    if (this.context) {
      return this.context;
    }

    var AudioContextClass = global.AudioContext || global.webkitAudioContext;
    if (!AudioContextClass) {
      return null;
    }

    this.context = new AudioContextClass();
    return this.context;
  };

  AudioManager.prototype.unlock = function unlock() {
    var ctx = this.ensureContext();
    if (!ctx) {
      return;
    }

    if (ctx.state === "suspended") {
      ctx.resume();
    }

    this.unlocked = true;
    this.startMusic(false);
  };

  AudioManager.prototype.playTone = function playTone(options) {
    if (!this.enabled) {
      return;
    }

    if (options.channel === "bgm" && !this.bgmEnabled) {
      return;
    }

    var ctx = this.ensureContext();
    if (!ctx) {
      return;
    }

    if (ctx.state === "suspended") {
      ctx.resume();
    }

    var now = ctx.currentTime;
    var freq = options.frequency;
    var duration = options.duration;
    var type = options.type || "sine";
    var channelGain = options.channel === "bgm" ? 0.5 : this.sfxVolume;
    var gainValue = (options.gain || 0.08) * this.masterVolume * channelGain;
    var attack = options.attack || 0.005;
    var release = options.release || 0.03;

    var oscillator = ctx.createOscillator();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(freq, now);

    var gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(gainValue, now + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration + release);

    oscillator.connect(gain);
    gain.connect(ctx.destination);

    oscillator.start(now);
    oscillator.stop(now + duration + release + 0.01);
  };

  AudioManager.prototype.stopMusic = function stopMusic() {
    if (this.bgmTimer) {
      global.clearInterval(this.bgmTimer);
      this.bgmTimer = null;
    }
  };

  AudioManager.prototype.startMusic = function startMusic(forceRestart) {
    if (!this.enabled || !this.bgmEnabled || !this.unlocked) {
      return;
    }

    var ctx = this.ensureContext();
    if (!ctx) {
      return;
    }

    if (ctx.state === "suspended") {
      ctx.resume();
    }

    if (forceRestart) {
      this.stopMusic();
    }

    if (this.bgmTimer) {
      return;
    }

    var self = this;
    this.bgmTimer = global.setInterval(function onMusicTick() {
      self.tickMusic();
    }, 170);

    this.tickMusic();
  };

  AudioManager.prototype.tickMusic = function tickMusic() {
    var pattern = MUSIC_PATTERNS[this.bgmTrack] || MUSIC_PATTERNS.retro;
    if (!pattern || !pattern.length) {
      return;
    }

    var step = pattern[this.bgmStep % pattern.length];
    this.bgmStep += 1;

    if (step.bass) {
      this.playTone({
        frequency: step.bass,
        duration: 0.13,
        type: "triangle",
        gain: 0.05,
        attack: 0.01,
        release: 0.04,
        channel: "bgm",
      });
    }

    if (step.lead) {
      this.playTone({
        frequency: step.lead,
        duration: 0.1,
        type: "square",
        gain: 0.045,
        attack: 0.004,
        release: 0.02,
        channel: "bgm",
      });
    }
  };

  AudioManager.prototype.playItem = function playItem() {
    this.playTone({
      frequency: 620,
      duration: 0.08,
      type: "triangle",
      gain: 0.06,
    });
  };

  AudioManager.prototype.playBigItem = function playBigItem() {
    this.playTone({
      frequency: 560,
      duration: 0.09,
      type: "triangle",
      gain: 0.07,
    });
    this.playTone({
      frequency: 820,
      duration: 0.12,
      type: "square",
      gain: 0.06,
    });
  };

  AudioManager.prototype.playPower = function playPower() {
    this.playTone({
      frequency: 660,
      duration: 0.08,
      type: "triangle",
      gain: 0.06,
    });
    this.playTone({
      frequency: 880,
      duration: 0.1,
      type: "triangle",
      gain: 0.06,
    });
    this.playTone({
      frequency: 990,
      duration: 0.11,
      type: "triangle",
      gain: 0.055,
    });
  };

  AudioManager.prototype.playPortal = function playPortal() {
    this.playTone({
      frequency: 420,
      duration: 0.07,
      type: "sine",
      gain: 0.06,
    });
    this.playTone({
      frequency: 760,
      duration: 0.08,
      type: "sine",
      gain: 0.06,
    });
  };

  AudioManager.prototype.playStep = function playStep() {
    this.playTone({
      frequency: 330,
      duration: 0.06,
      type: "square",
      gain: 0.045,
    });
  };

  AudioManager.prototype.playBlocked = function playBlocked() {
    this.playTone({
      frequency: 155,
      duration: 0.1,
      type: "sawtooth",
      gain: 0.06,
    });
  };

  AudioManager.prototype.playUndo = function playUndo() {
    this.playTone({
      frequency: 250,
      duration: 0.08,
      type: "triangle",
      gain: 0.055,
    });
  };

  AudioManager.prototype.playClear = function playClear() {
    this.playTone({
      frequency: 510,
      duration: 0.11,
      type: "triangle",
      gain: 0.07,
    });
    this.playTone({
      frequency: 680,
      duration: 0.13,
      type: "triangle",
      gain: 0.065,
    });
  };

  AudioManager.prototype.playComplete = function playComplete() {
    this.playTone({
      frequency: 520,
      duration: 0.16,
      type: "triangle",
      gain: 0.07,
    });
    this.playTone({
      frequency: 740,
      duration: 0.18,
      type: "triangle",
      gain: 0.075,
    });
    this.playTone({
      frequency: 980,
      duration: 0.2,
      type: "triangle",
      gain: 0.08,
    });
  };

  global.WormGameAudio = AudioManager;
})(window);
