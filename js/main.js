/**
 * main.js — 앱 진입점 (UI 바인딩, 이벤트, 게임루프)
 *
 * @module  (앱 엔트리 — export 없음)
 * @depends WormGameConstants        (GAME_STATE, ACTION, GAMEPLAY, TILE, ...)
 * @depends WormPuzzleGame           (Game)
 * @depends WormGameRenderer         (Renderer)
 * @depends WormGameAudio            (AudioManager)
 * @depends WormGameI18N             (I18N)
 * @depends WormGameLevels           (WORLD_TITLES)
 * @depends WormGameCharacterPreview (drawCharacterPreview)
 * @depends WormGameReplayUI         (createReplayUI)
 * @depends WormGameGamepad          (createGamepadHandler)
 *
 * 스크립트 로드 순서 (index.html):
 *   1. constants.js   (루트)
 *   2. levels.js      (← constants)
 *   3. snake.js       (← constants)
 *   4. game.js        (← constants, levels, snake)
 *   5. renderer.js    (← constants)
 *   6. audio.js       (독립)
 *   7. i18n.js        (독립)
 *   8. gamepad.js     (← constants)
 *   9. character-preview.js (독립, renderer 인스턴스는 런타임 주입)
 *  10. replay-ui.js   (← constants)
 *  11. main.js        (← 전부)
 *
 * ES Module 전환 시: 각 import 문으로 교체
 */
(function attachMain(global) {
  "use strict";

  var constants = global.WormGameConstants;
  var GAME_STATE = constants.GAME_STATE;
  var ACTION = constants.ACTION;
  var GAMEPLAY = constants.GAMEPLAY;
  var TILE = constants.TILE;
  var GRID_COLS = constants.GRID_COLS;
  var GRID_ROWS = constants.GRID_ROWS;
  var CANVAS_WIDTH = constants.CANVAS_WIDTH;
  var CANVAS_HEIGHT = constants.CANVAS_HEIGHT;
  var TILE_SIZE = constants.TILE_SIZE;
  var Game = global.WormPuzzleGame;
  var Renderer = global.WormGameRenderer;
  var AudioManager = global.WormGameAudio;

  var clamp = constants.clamp;
  var normalizeKeyToken = constants.normalizeKeyToken;

  function byId(id) {
    return document.getElementById(id);
  }

  function setupPadButton(button, handler) {
    var touched = false;
    var holdTimer = null;
    var repeatTimer = null;

    function clearRepeat() {
      if (holdTimer) {
        global.clearTimeout(holdTimer);
        holdTimer = null;
      }
      if (repeatTimer) {
        global.clearInterval(repeatTimer);
        repeatTimer = null;
      }
    }

    function startRepeat() {
      clearRepeat();
      handler();
      holdTimer = global.setTimeout(function startHoldRepeat() {
        repeatTimer = global.setInterval(function onHoldTick() {
          handler();
        }, GAMEPLAY.HOLD_REPEAT_MS);
      }, GAMEPLAY.HOLD_INITIAL_DELAY_MS);
    }

    button.addEventListener(
      "touchstart",
      function onTouchStart(event) {
        event.preventDefault();
        touched = true;
        startRepeat();
      },
      { passive: false }
    );

    button.addEventListener("touchend", clearRepeat, { passive: true });
    button.addEventListener("touchcancel", clearRepeat, { passive: true });
    button.addEventListener("mouseup", clearRepeat);
    button.addEventListener("mouseleave", clearRepeat);
    button.addEventListener("mousedown", function onMouseDown(event) {
      event.preventDefault();
      startRepeat();
    });

    button.addEventListener("click", function onClick(event) {
      if (touched) {
        touched = false;
        clearRepeat();
        return;
      }
      event.preventDefault();
      startRepeat();
      clearRepeat();
    });
  }

  var activeFocusTrap = null;
  var previousFocusElement = null;

  /**
   * 오버레이 포커스 트랩: Tab/Shift+Tab을 오버레이 내 요소로 제한한다.
   */
  function trapFocusIn(overlayEl) {
    releaseFocusTrap();
    previousFocusElement = document.activeElement;

    function onKeyDown(event) {
      if (event.key !== "Tab") {
        return;
      }
      var focusable = overlayEl.querySelectorAll(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }
      var first = focusable[0];
      var last = focusable[focusable.length - 1];
      if (event.shiftKey) {
        if (document.activeElement === first) {
          event.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    }

    overlayEl.addEventListener("keydown", onKeyDown);
    activeFocusTrap = { el: overlayEl, handler: onKeyDown };

    var firstBtn = overlayEl.querySelector("button:not([disabled])");
    if (firstBtn) {
      firstBtn.focus();
    }
  }

  function releaseFocusTrap() {
    if (activeFocusTrap) {
      activeFocusTrap.el.removeEventListener("keydown", activeFocusTrap.handler);
      activeFocusTrap = null;
    }
    if (previousFocusElement && previousFocusElement.focus) {
      previousFocusElement.focus();
      previousFocusElement = null;
    }
  }

  function setupButton(button, handler) {
    if (!button) {
      return;
    }
    button.addEventListener("click", function onClick(event) {
      event.preventDefault();
      handler();
    });
  }

  document.addEventListener("DOMContentLoaded", function onReady() {
    var canvas = byId("gameCanvas");
    var canvasPanel = byId("canvasPanel");
    var appRoot = byId("appRoot");

    var hudLevel = byId("hudLevel");
    var hudMoves = byId("hudMoves");
    var hudState = byId("hudState");
    var hudLength = byId("hudLength");
    var hudItems = byId("hudItems");
    var hudTheme = byId("hudTheme");
    var hudBest = byId("hudBest");
    var hudUnlocked = byId("hudUnlocked");
    var hudDifficulty = byId("hudDifficulty");
    var hudInputLag = byId("hudInputLag");
    var hudCharacter = byId("hudCharacter");
    var hudWorld = byId("hudWorld");
    var characterPanelTitle = byId("characterPanelTitle");
    var characterPanelName = byId("characterPanelName");
    var characterPanelMeta = byId("characterPanelMeta");
    var characterPreviewCanvas = byId("characterPreviewCanvas");
    var charLenMinus = byId("charLenMinus");
    var charLenPlus = byId("charLenPlus");
    var charLenValue = byId("charLenValue");
    var manualCharLength = 0; // 0 = 자동(게임 뱀 길이 따라감), >0 = 수동 고정

    var subtitleText = byId("subtitleText");
    var helpText = byId("helpText");

    var startBtn = byId("startBtn");
    var levelSelectBtn = byId("levelSelectBtn");
    var pauseBtn = byId("pauseBtn");
    var nextBtn = byId("nextBtn");
    var undoBtn = byId("undoBtn");
    var newGameBtn = byId("newGameBtn");
    var copyReplayBtn = byId("copyReplayBtn");
    var levelAdjustLabel = byId("levelAdjustLabel");
    var levelPrevStepBtn = byId("levelPrevStepBtn");
    var levelJumpRange = byId("levelJumpRange");
    var levelAdjustValue = byId("levelAdjustValue");
    var levelNextStepBtn = byId("levelNextStepBtn");

    var clearOverlay = byId("clearOverlay");
    var clearTitle = byId("clearTitle");
    var clearSubtitle = byId("clearSubtitle");
    var clearNextBtn = byId("clearNextBtn");
    var clearRestartBtn = byId("clearRestartBtn");
    var clearTitleBtn = byId("clearTitleBtn");

    var pauseMenu = byId("pauseMenu");
    var pauseTitle = byId("pauseTitle");
    var resumeBtn = byId("resumeBtn");
    var restartBtn = byId("restartBtn");
    var exitTitleBtn = byId("exitTitleBtn");

    var tutorialOverlay = byId("tutorialOverlay");
    var tutorialProgress = byId("tutorialProgress");
    var tutorialTitle = byId("tutorialTitle");
    var tutorialBody = byId("tutorialBody");
    var tutorialSkipBtn = byId("tutorialSkipBtn");
    var tutorialNextBtn = byId("tutorialNextBtn");

    var levelSelectPanel = byId("levelSelectPanel");
    var levelGrid = byId("levelGrid");
    var levelSelectSummary = byId("levelSelectSummary");
    var levelSelectTitle = byId("levelSelectTitle");

    var replayDebugPanel = byId("replayDebugPanel");
    var replayStepLabel = byId("replayStepLabel");
    var replayMeta = byId("replayMeta");
    var replayCanvas = byId("replayCanvas");
    var replayStepRange = byId("replayStepRange");
    var replayStepPrevBtn = byId("replayStepPrevBtn");
    var replayStepNextBtn = byId("replayStepNextBtn");
    var replayStepLatestBtn = byId("replayStepLatestBtn");
    var replayTitle = byId("replayTitle");

    var mobilePad = byId("mobilePad");
    var padDragHandle = byId("padDragHandle");

    var soundToggle = byId("soundToggle");
    var bgmToggle = byId("bgmToggle");
    var vibrationToggle = byId("vibrationToggle");
    var contrastToggle = byId("contrastToggle");
    var motionToggle = byId("motionToggle");
    var perfToggle = byId("perfToggle");
    var resetPolicyToggle = byId("resetPolicyToggle");
    var colorBlindToggle = byId("colorBlindToggle");
    var moveHintsToggle = byId("moveHintsToggle");
    var replayDebugToggle = byId("replayDebugToggle");
    var languageSelect = byId("languageSelect");
    var perfModeSelect = byId("perfModeSelect");
    var bgmTrackSelect = byId("bgmTrackSelect");
    var masterVolumeRange = byId("masterVolumeRange");
    var sfxVolumeRange = byId("sfxVolumeRange");
    var masterVolumeValue = byId("masterVolumeValue");
    var sfxVolumeValue = byId("sfxVolumeValue");

    var settingsTitle = byId("settingsTitle");
    var bgmToggleLabel = byId("bgmToggleLabel");
    var languageLabel = byId("languageLabel");
    var perfModeLabel = byId("perfModeLabel");
    var bgmTrackLabel = byId("bgmTrackLabel");
    var masterVolumeLabel = byId("masterVolumeLabel");
    var sfxVolumeLabel = byId("sfxVolumeLabel");
    var handModeLabel = byId("handModeLabel");
    var keybindSummary = byId("keybindSummary");
    var keybindNote = byId("keybindNote");
    var keybindGrid = byId("keybindGrid");

    var labelLevel = byId("labelLevel");
    var labelMoves = byId("labelMoves");
    var labelState = byId("labelState");
    var labelLength = byId("labelLength");
    var labelItems = byId("labelItems");
    var labelTheme = byId("labelTheme");
    var labelBest = byId("labelBest");
    var labelUnlocked = byId("labelUnlocked");
    var labelDifficulty = byId("labelDifficulty");
    var labelInputLag = byId("labelInputLag");
    var labelCharacter = byId("labelCharacter");
    var labelWorld = byId("labelWorld");

    var toast = byId("toast");

    var game = new Game();
    var renderer = new Renderer(canvas);
    var audio = new AudioManager();

    var lastToastTimer = null;
    var cachedLevelButtonState = "";
    var levelButtonNodes = [];
    var miniMapCache = {};
    var lastBlockedToastAt = 0;
    var heldMoveAction = null;
    var heldMoveNextAt = 0;
    var tutorialVisible = false;
    var tutorialStepIndex = 0;
    // replayStepIndex, replayLevelId → replay-ui.js 모듈이 관리
    var dpadDragState = null;
    var lastSettingsSnapshot = "";
    var uiDirty = true;

    // 게임패드: gamepad.js 모듈 인스턴스 (confirmRestart는 아래에서 정의 후 주입)
    var gamepadHandler = null;

    var I18N = global.WormGameI18N || {};

    function currentLanguage() {
      return game.settings.language === "en" ? "en" : "ko";
    }

    function t(key, params) {
      var lang = currentLanguage();
      var dict = I18N[lang] || I18N.ko;
      var template = dict[key] || I18N.ko[key] || key;
      if (!params) {
        return template;
      }
      return template.replace(/\{([a-zA-Z0-9_]+)\}/g, function replaceToken(_m, token) {
        if (!Object.prototype.hasOwnProperty.call(params, token)) {
          return "";
        }
        return String(params[token]);
      });
    }

    function setText(node, value) {
      if (node) {
        node.textContent = value;
      }
    }

    function showToast(message, type) {
      if (!toast) {
        return;
      }
      toast.textContent = message;
      toast.classList.remove("toast-success", "toast-warning", "toast-error");
      if (type === "success") {
        toast.classList.add("toast-success");
      } else if (type === "warning") {
        toast.classList.add("toast-warning");
      } else if (type === "error") {
        toast.classList.add("toast-error");
      }
      toast.classList.add("visible");
      if (lastToastTimer) {
        global.clearTimeout(lastToastTimer);
      }
      lastToastTimer = global.setTimeout(function hideToast() {
        toast.classList.remove("visible");
      }, 1650);
    }

    function applyBodyClasses() {
      document.body.classList.toggle("high-contrast", !!game.settings.highContrast);
      document.body.classList.toggle("left-handed", game.settings.handedness === "left");
      document.body.classList.toggle("reduce-motion", !!game.settings.reduceMotion);
      document.body.classList.toggle("show-perf-overlay", !!game.settings.showPerfOverlay);
    }

    function isMoveAction(action) {
      return (
        action === ACTION.MOVE_UP ||
        action === ACTION.MOVE_DOWN ||
        action === ACTION.MOVE_LEFT ||
        action === ACTION.MOVE_RIGHT
      );
    }

    function directionLabel(direction) {
      if (!direction) {
        return t("replayDirectionNone");
      }
      if (direction === "up") {
        return t("replayDirectionUp");
      }
      if (direction === "down") {
        return t("replayDirectionDown");
      }
      if (direction === "left") {
        return t("replayDirectionLeft");
      }
      if (direction === "right") {
        return t("replayDirectionRight");
      }
      return direction;
    }

    function numberWord(n) {
      var safe = Math.max(1, Math.round(Number(n) || 1));
      var underTen = ["", "하나", "둘", "셋", "넷", "다섯", "여섯", "일곱", "여덟", "아홉"];
      if (safe <= 9) {
        return underTen[safe];
      }
      if (safe === 10) {
        return "열";
      }
      if (safe < 20) {
        return "열" + underTen[safe - 10];
      }
      if (safe < 100) {
        var tens = ["", "", "스물", "서른", "마흔", "쉰", "예순", "일흔", "여든", "아흔"];
        var tValue = Math.floor(safe / 10);
        var oValue = safe % 10;
        return oValue ? tens[tValue] + underTen[oValue] : tens[tValue];
      }
      if (safe === 100) {
        return "백";
      }
      return safe + "번";
    }

    function numberblockAlias(number) {
      var safe = Math.max(1, Math.round(Number(number) || 1));
      var alias = {
        1: "원",
        2: "투",
        3: "쓰리",
        4: "포",
        5: "파이브",
        6: "식스",
        7: "세븐",
        8: "옥토블록",
        9: "나인",
        10: "텐",
      };
      return alias[safe] || "";
    }

    function shapeNameByNumber(number) {
      var safe = Math.max(1, Math.round(Number(number) || 1));
      var isKorean = currentLanguage() === "ko";
      if (safe === 1) {
        return isKorean ? "원형" : "Circle";
      }
      if (safe === 8) {
        return isKorean ? "옥타곤" : "Octagon";
      }
      if (safe === 10) {
        return isKorean ? "화이트" : "White";
      }
      return isKorean ? "블록" : "Block";
    }

    function characterDisplayNameByNumber(number) {
      var safeNumber = Math.max(1, Number(number) || 1);
      var baseName = numberWord(safeNumber);
      var alias = numberblockAlias(safeNumber);
      return alias ? baseName + " (" + alias + ") · " + safeNumber + "번" : baseName + " · " + safeNumber + "번";
    }

    function characterDisplayName(character) {
      if (!character) {
        return "-";
      }
      if (character.displayName) {
        return character.displayName;
      }
      return characterDisplayNameByNumber(character.number);
    }

    function worldStageCode(level) {
      if (!level) {
        return "-";
      }
      return t("worldStageCode", {
        world: level.world || 1,
        stage: level.stage || 1,
      });
    }

    function showLevelStartToast() {
      if (!game.currentLevel) {
        return;
      }
      var base = t("levelStartToast", { level: game.currentLevel.id });
      var character = game.getCurrentCharacter ? game.getCurrentCharacter() : null;
      if (character) {
        base += " · " + characterDisplayName(character);
      }
      showToast(base);
    }

    function formatVolume(value) {
      return Math.round(clamp(Number(value) || 0, 0, 1) * 100) + "%";
    }

    function keybindDefs() {
      return [
        { action: ACTION.MOVE_UP, label: t("keyMoveUp") },
        { action: ACTION.MOVE_DOWN, label: t("keyMoveDown") },
        { action: ACTION.MOVE_LEFT, label: t("keyMoveLeft") },
        { action: ACTION.MOVE_RIGHT, label: t("keyMoveRight") },
        { action: ACTION.UNDO, label: t("keyUndo") },
        { action: ACTION.RESTART, label: t("keyRestart") },
        { action: ACTION.PAUSE, label: t("keyPause") },
        { action: ACTION.NEXT, label: t("keyNext") },
        { action: ACTION.LEVEL_SELECT, label: t("keyLevelSelect") },
      ];
    }

    function updateStaticTexts() {
      document.documentElement.lang = currentLanguage();
      cachedLevelButtonState = "";
      miniMapCache = {};

      setText(subtitleText, t("subtitle"));
      setText(helpText, t("help"));
      setText(settingsTitle, t("settingsTitle"));
      setText(levelSelectTitle, t("levelSelectTitle"));
      setText(replayTitle, t("replayTitle"));

      setText(labelLevel, t("labelLevel"));
      setText(labelMoves, t("labelMoves"));
      setText(labelState, t("labelState"));
      setText(labelLength, t("labelLength"));
      setText(labelItems, t("labelItems"));
      setText(labelTheme, t("labelTheme"));
      setText(labelBest, t("labelBest"));
      setText(labelUnlocked, t("labelUnlocked"));
      setText(labelDifficulty, t("labelDifficulty"));
      setText(labelInputLag, t("labelInputLag"));
      setText(labelCharacter, t("labelCharacter"));
      setText(labelWorld, t("labelWorld"));
      setText(characterPanelTitle, t("characterPanelTitle"));

      setText(pauseTitle, t("pauseTitle"));
      setText(bgmToggleLabel, t("bgmToggleLabel"));
      setText(languageLabel, t("languageLabel"));
      setText(perfModeLabel, t("perfModeLabel"));
      setText(bgmTrackLabel, t("bgmTrackLabel"));
      setText(masterVolumeLabel, t("masterVolumeLabel"));
      setText(sfxVolumeLabel, t("sfxVolumeLabel"));
      setText(handModeLabel, t("handModeLabel"));
      setText(keybindSummary, t("keybindSummary"));
      setText(keybindNote, t("keybindNote"));
      setText(tutorialSkipBtn, t("tutorialSkip"));
      setText(replayStepPrevBtn, t("replayPrev"));
      setText(replayStepNextBtn, t("replayNext"));
      setText(replayStepLatestBtn, t("replayLatest"));

      if (languageSelect && languageSelect.options.length >= 2) {
        languageSelect.options[0].textContent = t("langKo");
        languageSelect.options[1].textContent = t("langEn");
      }

      if (perfModeSelect && perfModeSelect.options.length >= 3) {
        perfModeSelect.options[0].textContent = t("perfAuto");
        perfModeSelect.options[1].textContent = t("perfQuality");
        perfModeSelect.options[2].textContent = t("perfBattery");
      }

      if (bgmTrackSelect && bgmTrackSelect.options.length >= 3) {
        bgmTrackSelect.options[0].textContent = t("bgmRetro");
        bgmTrackSelect.options[1].textContent = t("bgmArcade");
        bgmTrackSelect.options[2].textContent = t("bgmChill");
      }

      setText(resumeBtn, t("gameResume"));
      setText(restartBtn, t("restartBtn"));
      setText(exitTitleBtn, t("titleBtn"));
      setText(nextBtn, t("nextBtn"));
      setText(undoBtn, t("undoBtn"));
      setText(newGameBtn, t("newGameBtn"));
      setText(copyReplayBtn, t("replayCopyBtn"));
      setText(levelAdjustLabel, t("levelAdjustLabel"));
      setText(levelPrevStepBtn, t("levelAdjustPrev"));
      setText(levelNextStepBtn, t("levelAdjustNext"));

      renderTutorialStep();
      renderKeyBindings();
    }

    function applyDpadPosition() {
      if (!mobilePad) {
        return;
      }

      var position = game.settings.dpadPosition || { x: null, y: null };
      var hasCustom = Number.isFinite(position.x) && Number.isFinite(position.y);

      if (!hasCustom) {
        mobilePad.style.left = "";
        mobilePad.style.top = "";
        mobilePad.style.right = "";
        mobilePad.style.bottom = "";
        return;
      }

      var rect = mobilePad.getBoundingClientRect();
      var maxX = Math.max(0, global.innerWidth - rect.width);
      var maxY = Math.max(0, global.innerHeight - rect.height);
      var x = clamp(Number(position.x), 0, maxX);
      var y = clamp(Number(position.y), 0, maxY);

      mobilePad.style.left = Math.round(x) + "px";
      mobilePad.style.top = Math.round(y) + "px";
      mobilePad.style.right = "auto";
      mobilePad.style.bottom = "auto";
    }

    function syncSettingControls(force) {
      var settingsSnapshot = JSON.stringify({
        soundEnabled: game.settings.soundEnabled,
        bgmEnabled: game.settings.bgmEnabled,
        bgmTrack: game.settings.bgmTrack,
        vibrationEnabled: game.settings.vibrationEnabled,
        highContrast: game.settings.highContrast,
        reduceMotion: game.settings.reduceMotion,
        showPerfOverlay: game.settings.showPerfOverlay,
        resetProgressOnNewGame: game.settings.resetProgressOnNewGame,
        colorBlindAssist: game.settings.colorBlindAssist,
        showMoveHints: game.settings.showMoveHints,
        replayDebugEnabled: game.settings.replayDebugEnabled,
        language: game.settings.language,
        mobilePerformanceMode: game.settings.mobilePerformanceMode,
        masterVolume: game.settings.masterVolume,
        sfxVolume: game.settings.sfxVolume,
        handedness: game.settings.handedness,
        dpadPosition: game.settings.dpadPosition,
      });

      if (!force && settingsSnapshot === lastSettingsSnapshot) {
        return;
      }
      lastSettingsSnapshot = settingsSnapshot;

      soundToggle.checked = !!game.settings.soundEnabled;
      bgmToggle.checked = !!game.settings.bgmEnabled;
      vibrationToggle.checked = !!game.settings.vibrationEnabled;
      contrastToggle.checked = !!game.settings.highContrast;
      motionToggle.checked = !!game.settings.reduceMotion;
      perfToggle.checked = !!game.settings.showPerfOverlay;
      resetPolicyToggle.checked = !!game.settings.resetProgressOnNewGame;
      colorBlindToggle.checked = !!game.settings.colorBlindAssist;
      moveHintsToggle.checked = !!game.settings.showMoveHints;
      replayDebugToggle.checked = !!game.settings.replayDebugEnabled;

      languageSelect.value = game.settings.language;
      perfModeSelect.value = game.settings.mobilePerformanceMode;
      bgmTrackSelect.value = game.settings.bgmTrack || "retro";
      masterVolumeRange.value = String(game.settings.masterVolume);
      sfxVolumeRange.value = String(game.settings.sfxVolume);
      setText(masterVolumeValue, formatVolume(game.settings.masterVolume));
      setText(sfxVolumeValue, formatVolume(game.settings.sfxVolume));

      var handedInputs = document.querySelectorAll('input[name="handedness"]');
      Array.prototype.forEach.call(handedInputs, function eachHand(input) {
        input.checked = input.value === game.settings.handedness;
      });

      audio.setEnabled(!!game.settings.soundEnabled);
      audio.setBgmEnabled(!!game.settings.bgmEnabled);
      audio.setMusicTrack(game.settings.bgmTrack || "retro");
      audio.setMasterVolume(game.settings.masterVolume);
      audio.setSfxVolume(game.settings.sfxVolume);

      applyBodyClasses();
      applyDpadPosition();

      replayDebugPanel.classList.toggle("hidden", !game.settings.replayDebugEnabled);
    }

    function updateSetting(patch) {
      game.updateSettings(patch);
      syncSettingControls(true);
      uiDirty = true;
    }

    function setupSettingsBindings() {
      soundToggle.addEventListener("change", function onSoundToggle() {
        updateSetting({ soundEnabled: soundToggle.checked });
      });
      bgmToggle.addEventListener("change", function onBgmToggle() {
        updateSetting({ bgmEnabled: bgmToggle.checked });
      });
      vibrationToggle.addEventListener("change", function onVibrationToggle() {
        updateSetting({ vibrationEnabled: vibrationToggle.checked });
      });
      contrastToggle.addEventListener("change", function onContrastToggle() {
        updateSetting({ highContrast: contrastToggle.checked });
      });
      motionToggle.addEventListener("change", function onMotionToggle() {
        updateSetting({ reduceMotion: motionToggle.checked });
      });
      perfToggle.addEventListener("change", function onPerfToggle() {
        updateSetting({ showPerfOverlay: perfToggle.checked });
      });
      resetPolicyToggle.addEventListener("change", function onResetPolicyToggle() {
        updateSetting({ resetProgressOnNewGame: resetPolicyToggle.checked });
      });
      colorBlindToggle.addEventListener("change", function onColorBlindToggle() {
        updateSetting({ colorBlindAssist: colorBlindToggle.checked });
      });
      moveHintsToggle.addEventListener("change", function onMoveHintsToggle() {
        updateSetting({ showMoveHints: moveHintsToggle.checked });
      });
      replayDebugToggle.addEventListener("change", function onReplayDebugToggle() {
        updateSetting({ replayDebugEnabled: replayDebugToggle.checked });
      });

      languageSelect.addEventListener("change", function onLanguageSelect() {
        updateSetting({ language: languageSelect.value });
        updateStaticTexts();
        showToast(languageSelect.value === "en" ? "Language switched to English" : "언어가 한국어로 변경되었습니다");
        updateUI(true);
      });

      perfModeSelect.addEventListener("change", function onPerfModeSelect() {
        updateSetting({ mobilePerformanceMode: perfModeSelect.value });
      });
      bgmTrackSelect.addEventListener("change", function onBgmTrackSelect() {
        updateSetting({ bgmTrack: bgmTrackSelect.value });
      });

      masterVolumeRange.addEventListener("input", function onMasterInput() {
        audio.setMasterVolume(masterVolumeRange.value);
        setText(masterVolumeValue, formatVolume(masterVolumeRange.value));
      });
      masterVolumeRange.addEventListener("change", function onMasterChange() {
        updateSetting({ masterVolume: masterVolumeRange.value });
      });

      sfxVolumeRange.addEventListener("input", function onSfxInput() {
        audio.setSfxVolume(sfxVolumeRange.value);
        setText(sfxVolumeValue, formatVolume(sfxVolumeRange.value));
      });
      sfxVolumeRange.addEventListener("change", function onSfxChange() {
        updateSetting({ sfxVolume: sfxVolumeRange.value });
      });

      var handedInputs = document.querySelectorAll('input[name="handedness"]');
      Array.prototype.forEach.call(handedInputs, function eachHand(input) {
        input.addEventListener("change", function onHandChange() {
          if (input.checked) {
            updateSetting({ handedness: input.value });
          }
        });
      });
    }

    function renderKeyBindings() {
      keybindGrid.innerHTML = "";

      var defs = keybindDefs();
      for (var i = 0; i < defs.length; i += 1) {
        (function setupRow(def) {
          var row = document.createElement("label");
          row.className = "keybind-row";

          var label = document.createElement("span");
          label.textContent = def.label;

          var input = document.createElement("input");
          input.type = "text";
          input.readOnly = true;
          input.value = game.getBindingToken(def.action) || t("keyDefault");

          input.addEventListener("focus", function onFocus() {
            input.value = t("keyWaiting");
          });

          input.addEventListener("blur", function onBlur() {
            input.value = game.getBindingToken(def.action) || t("keyDefault");
          });

          input.addEventListener("keydown", function onKeyDown(event) {
            event.preventDefault();
            audio.unlock();

            if (event.key === "Tab") {
              input.blur();
              return;
            }

            var token = "";
            if (event.key !== "Backspace" && event.key !== "Delete") {
              token = normalizeKeyToken(event.key);
            }

            game.setBindingToken(def.action, token);
            input.value = game.getBindingToken(def.action) || t("keyDefault");

            if (!token) {
              showToast(t("keyResetToast", { label: def.label }));
            } else {
              showToast(t("keySetToast", { label: def.label, token: token }));
            }
          });

          row.appendChild(label);
          row.appendChild(input);
          keybindGrid.appendChild(row);
        })(defs[i]);
      }
    }

    function drawMiniLevelMap(canvasNode, map, locked, current) {
      var ctx = canvasNode.getContext("2d");
      var width = canvasNode.width;
      var height = canvasNode.height;
      var tileW = width / GRID_COLS;
      var tileH = height / GRID_ROWS;

      ctx.clearRect(0, 0, width, height);

      for (var y = 0; y < GRID_ROWS; y += 1) {
        for (var x = 0; x < GRID_COLS; x += 1) {
          var tile = map[y][x];
          var px = x * tileW;
          var py = y * tileH;
          var color = "#b5e8ff";

          if (tile === TILE.WALL) {
            color = "#bf5545";
          } else if (tile === TILE.OBSTACLE) {
            color = "#2d4f9b";
          } else if (tile === TILE.EXIT) {
            color = "#37d98f";
          } else if (tile === TILE.ITEM) {
            color = "#ffe868";
          } else if (tile === TILE.BIG_ITEM) {
            color = "#ff9f36";
          } else if (tile === TILE.STAR_ITEM) {
            color = "#ffffff";
          } else if (tile === TILE.PORTAL_A) {
            color = "#37e5ff";
          } else if (tile === TILE.PORTAL_B) {
            color = "#ff6fd7";
          }

          ctx.fillStyle = color;
          ctx.fillRect(px, py, tileW, tileH);
        }
      }

      if (locked) {
        ctx.fillStyle = "rgba(0, 0, 0, 0.42)";
        ctx.fillRect(0, 0, width, height);
      }

      if (current) {
        ctx.strokeStyle = "#2dd173";
        ctx.lineWidth = 3;
        ctx.strokeRect(1.5, 1.5, width - 3, height - 3);
      }
    }

    function renderLevelButtons(force) {
      var items = game.getLevelSelectItems();
      var stateHash = items
        .map(function mapState(item) {
          return [item.id, item.locked ? 1 : 0, item.current ? 1 : 0, item.bestMoves].join(":");
        })
        .join("|");

      if (!force && stateHash === cachedLevelButtonState) {
        return;
      }
      cachedLevelButtonState = stateHash;

      var WORLD_TITLES = global.WormGameLevels.WORLD_TITLES || [];
      var LEVELS_PER_WORLD = 10;
      var needsFullBuild = levelButtonNodes.length !== items.length;

      if (needsFullBuild) {
        levelGrid.innerHTML = "";
        levelButtonNodes = [];

        var worldContainers = [];
        var worldCount = Math.ceil(items.length / LEVELS_PER_WORLD);
        for (var w = 0; w < worldCount; w += 1) {
          var details = document.createElement("details");
          details.className = "world-group";
          var summary = document.createElement("summary");
          summary.className = "world-group-title";
          summary.textContent = "W" + (w + 1) + " — " + (WORLD_TITLES[w] || "World " + (w + 1));
          details.appendChild(summary);
          var grid = document.createElement("div");
          grid.className = "world-level-grid";
          details.appendChild(grid);
          levelGrid.appendChild(details);
          worldContainers.push({ details: details, grid: grid });
        }

        items.forEach(function addLevelItem(item, idx) {
          var button = document.createElement("button");
          button.className = "level-btn";
          button.type = "button";

          var levelId = document.createElement("span");
          levelId.className = "level-id";

          var levelCharacter = document.createElement("span");
          levelCharacter.className = "level-character";

          var preview = document.createElement("canvas");
          preview.className = "level-preview";
          preview.width = 160;
          preview.height = 120;

          var badge = document.createElement("span");
          badge.className = "level-badge";

          button.appendChild(levelId);
          button.appendChild(levelCharacter);
          button.appendChild(preview);
          button.appendChild(badge);

          (function bindClick(levelIndex) {
            button.addEventListener("click", function onSelect() {
              audio.unlock();
              if (game.selectLevel(levelIndex)) {
                updateUI(true);
                resizeCanvasToPanel();
              }
            });
          })(item.index);

          var worldIdx = Math.floor(idx / LEVELS_PER_WORLD);
          worldContainers[worldIdx].grid.appendChild(button);

          levelButtonNodes.push({
            button: button,
            levelId: levelId,
            levelCharacter: levelCharacter,
            preview: preview,
            badge: badge,
            lastState: "",
            worldIdx: worldIdx,
          });
        });

        var currentWorldIdx = Math.floor(game.levelIndex / LEVELS_PER_WORLD);
        if (worldContainers[currentWorldIdx]) {
          worldContainers[currentWorldIdx].details.open = true;
        }
      }

      for (var i = 0; i < items.length; i += 1) {
        var item = items[i];
        var node = levelButtonNodes[i];
        var itemState = [item.id, item.locked ? 1 : 0, item.current ? 1 : 0, item.bestMoves].join(":");

        if (node.lastState === itemState) {
          continue;
        }
        node.lastState = itemState;

        node.button.className = "level-btn" + (item.locked ? " locked" : "") + (item.current ? " current" : "");
        node.button.disabled = !!item.locked;

        node.levelId.textContent = "Lv " + item.id;
        node.levelCharacter.textContent = item.character ? characterDisplayName(item.character) : "-";

        var cacheKey = item.id + ":" + (item.locked ? 1 : 0) + ":" + (item.current ? 1 : 0);
        if (!miniMapCache[cacheKey]) {
          drawMiniLevelMap(node.preview, item.map, item.locked, item.current);
          miniMapCache[cacheKey] = true;
        } else if (needsFullBuild) {
          drawMiniLevelMap(node.preview, item.map, item.locked, item.current);
        }

        if (item.locked) {
          node.badge.textContent = t("levelLocked");
        } else if (item.bestMoves > 0) {
          node.badge.textContent = "BEST " + item.bestMoves;
        } else {
          node.badge.textContent = t("levelOpen");
        }
      }

      setText(
        levelSelectSummary,
        t("unlocked", {
          unlocked: game.unlockedLevelIndex + 1,
          total: game.levels.length,
        })
      );
    }

    var tutorialIcon = byId("tutorialIcon");
    var tutorialHint = byId("tutorialHint");

    function tutorialSteps() {
      return [
        { title: t("tutorial1Title"), body: t("tutorial1Body"), icon: t("tutorial1Icon") || "🎮", hint: t("tutorial1Hint") || "" },
        { title: t("tutorial2Title"), body: t("tutorial2Body"), icon: t("tutorial2Icon") || "↩️", hint: t("tutorial2Hint") || "" },
        { title: t("tutorial3Title"), body: t("tutorial3Body"), icon: t("tutorial3Icon") || "🍬", hint: t("tutorial3Hint") || "" },
        { title: t("tutorial4Title"), body: t("tutorial4Body"), icon: t("tutorial4Icon") || "🌀", hint: t("tutorial4Hint") || "" },
        { title: t("tutorial5Title"), body: t("tutorial5Body"), icon: t("tutorial5Icon") || "🚪", hint: t("tutorial5Hint") || "" },
      ];
    }

    function renderTutorialStep() {
      var steps = tutorialSteps();
      var safeIndex = clamp(tutorialStepIndex, 0, steps.length - 1);
      var stepData = steps[safeIndex];

      setText(
        tutorialProgress,
        t("tutorialProgress", { step: safeIndex + 1, total: steps.length })
      );
      if (tutorialIcon) { setText(tutorialIcon, stepData.icon || ""); }
      setText(tutorialTitle, stepData.title);
      setText(tutorialBody, stepData.body);
      if (tutorialHint) { setText(tutorialHint, stepData.hint || ""); }
      setText(tutorialNextBtn, safeIndex === steps.length - 1 ? t("tutorialStart") : t("tutorialNext"));
    }

    function showTutorial(force) {
      if (!force && game.settings.tutorialCompleted) {
        tutorialVisible = false;
        tutorialOverlay.classList.add("hidden");
        return;
      }

      tutorialStepIndex = 0;
      tutorialVisible = true;
      tutorialOverlay.classList.remove("hidden");
      renderTutorialStep();
      trapFocusIn(tutorialOverlay);
    }

    function closeTutorial(markCompleted) {
      tutorialVisible = false;
      tutorialOverlay.classList.add("hidden");
      releaseFocusTrap();
      if (markCompleted && !game.settings.tutorialCompleted) {
        game.updateSettings({ tutorialCompleted: true });
      }
    }

    function setupTutorialBindings() {
      setupButton(tutorialSkipBtn, function onTutorialSkip() {
        closeTutorial(true);
      });

      setupButton(tutorialNextBtn, function onTutorialNext() {
        var steps = tutorialSteps();
        if (tutorialStepIndex < steps.length - 1) {
          tutorialStepIndex += 1;
          renderTutorialStep();
        } else {
          closeTutorial(true);
          showToast(t("tutorialDone"));
        }
      });
    }

    // 캐릭터 프리뷰: character-preview.js 모듈 사용
    var _drawCharPreview = global.WormGameCharacterPreview;

    function drawCharacterPreview(length, stageCharacter) {
      var displayLength = manualCharLength > 0 ? manualCharLength : length;
      _drawCharPreview(characterPreviewCanvas, displayLength, renderer);
      var safeLength = Math.max(1, Number(displayLength) || 1);
      setText(characterPanelName, characterDisplayNameByNumber(safeLength));
      var stageName = stageCharacter ? characterDisplayName(stageCharacter) : "-";
      setText(
        characterPanelMeta,
        t("characterFormMeta", { form: safeLength, length: safeLength }) +
          " · " +
          shapeNameByNumber(safeLength) +
          " · " +
          stageName
      );
      if (charLenValue) {
        setText(charLenValue, String(safeLength));
      }
    }

    // 캐릭터 길이 수동 조절 +/- 버튼
    // 캔버스 + 숫자 라벨만 갱신 (이름/메타/HUD는 건드리지 않음)
    function refreshCharPreviewOnly(len) {
      _drawCharPreview(characterPreviewCanvas, len, renderer);
      if (charLenValue) {
        setText(charLenValue, String(len));
      }
    }

    function adjustCharLength(delta) {
      var currentGameLen = game.getCurrentSnakeLength();
      var current = manualCharLength > 0 ? manualCharLength : currentGameLen;
      var next = Math.max(1, Math.min(20, current + delta));
      manualCharLength = next;
      refreshCharPreviewOnly(next);
    }

    if (charLenMinus) {
      charLenMinus.addEventListener("click", function (e) {
        e.stopPropagation();
        adjustCharLength(-1);
      });
    }
    if (charLenPlus) {
      charLenPlus.addEventListener("click", function (e) {
        e.stopPropagation();
        adjustCharLength(1);
      });
    }

    // 리플레이 디버그 UI: replay-ui.js 모듈 사용
    var replayUI = global.WormGameReplayUI({
      game: game,
      t: t,
      setText: setText,
      directionLabel: directionLabel,
      replayCanvas: replayCanvas,
      replayStepRange: replayStepRange,
      replayStepPrevBtn: replayStepPrevBtn,
      replayStepNextBtn: replayStepNextBtn,
      replayStepLatestBtn: replayStepLatestBtn,
      replayStepLabel: replayStepLabel,
      replayMeta: replayMeta,
    });

    function updateReplayDebugUI(forceLatest) {
      replayUI.update(forceLatest);
    }

    function updateUI(forceLevelRerender) {
      var state = game.state;
      var theme = game.getCurrentTheme();
      var best = game.getBestMoveForCurrentLevel();
      var itemProgress = game.getItemProgress();
      var metrics = game.getCurrentLevelMetrics();
      var perf = game.getPerfSnapshot();
      var character = game.getCurrentCharacter ? game.getCurrentCharacter() : null;
      var powers = game.getPowerState ? game.getPowerState() : { starMoves: 0 };
      var currentLength = game.getCurrentSnakeLength();
      var formCode = characterDisplayNameByNumber(currentLength);
      var stateLabel = game.getStateLabel();
      if (state === GAME_STATE.PLAYING && powers.starMoves > 0) {
        stateLabel += " | " + t("statusStar", { turns: powers.starMoves });
      }

      setText(hudLevel, game.getLevelLabel());
      setText(hudMoves, String(game.moveCount));
      setText(hudState, stateLabel);
      setText(hudLength, String(currentLength));
      setText(hudItems, itemProgress.collected + " / " + itemProgress.total);
      setText(hudTheme, theme.name);
      setText(hudBest, best > 0 ? best + t("bestSuffix") : "-");
      setText(hudUnlocked, game.unlockedLevelIndex + 1 + " / " + game.levels.length);
      setText(hudDifficulty, metrics ? t("difficultyStar", { score: metrics.score }) : "-");
      setText(hudInputLag, t("inputLag", { ms: Math.round(perf.lastInputLatencyMs || 0) }));
      setText(hudCharacter, formCode);
      setText(hudWorld, worldStageCode(game.currentLevel));
      drawCharacterPreview(currentLength, character);

      var currentLevelNumber = game.currentLevel ? game.currentLevel.id : game.levelIndex + 1;
      if (levelJumpRange) {
        levelJumpRange.min = "1";
        levelJumpRange.max = String(game.levels.length);
        if (document.activeElement !== levelJumpRange) {
          levelJumpRange.value = String(currentLevelNumber);
        }
      }
      if (levelAdjustValue) {
        setText(levelAdjustValue, currentLevelNumber + " / " + game.levels.length);
      }
      if (levelPrevStepBtn) {
        levelPrevStepBtn.disabled = currentLevelNumber <= 1;
      }
      if (levelNextStepBtn) {
        levelNextStepBtn.disabled = currentLevelNumber >= game.levels.length;
      }

      if (state === GAME_STATE.TITLE) {
        if (game.unlockedLevelIndex > 0) {
          setText(startBtn, t("continueWithLevel", { level: game.unlockedLevelIndex + 1 }));
        } else {
          setText(startBtn, t("startGame"));
        }
      } else if (state === GAME_STATE.GAME_COMPLETE) {
        setText(startBtn, t("restartFromBeginning"));
      } else {
        setText(startBtn, t("continueLabel"));
      }

      startBtn.disabled = !(state === GAME_STATE.TITLE || state === GAME_STATE.GAME_COMPLETE);
      levelSelectBtn.disabled = state === GAME_STATE.PLAYING;
      nextBtn.disabled = currentLevelNumber >= game.levels.length;
      undoBtn.disabled = state !== GAME_STATE.PLAYING || game.history.length === 0;

      pauseBtn.disabled = !(state === GAME_STATE.PLAYING || state === GAME_STATE.PAUSED);
      setText(pauseBtn, state === GAME_STATE.PAUSED ? t("resumeBtn") : t("pauseBtn"));
      setText(levelSelectBtn, t("levelSelectBtn"));

      var wasPaused = !pauseMenu.classList.contains("hidden");
      pauseMenu.classList.toggle("hidden", state !== GAME_STATE.PAUSED);
      var isPaused = state === GAME_STATE.PAUSED;

      var showClearOverlay = state === GAME_STATE.LEVEL_COMPLETE || state === GAME_STATE.GAME_COMPLETE;
      if (clearOverlay) {
        var wasClearVisible = !clearOverlay.classList.contains("hidden");
        clearOverlay.classList.toggle("hidden", !showClearOverlay);
        if (showClearOverlay) {
          var isGameComplete = state === GAME_STATE.GAME_COMPLETE;
          var best = game.getBestMoveForCurrentLevel();
          setText(clearTitle, isGameComplete ? t("gameCompleteTitle") : t("clearTitle"));
          setText(clearSubtitle, t("clearSubtitle", {
            moves: game.moveCount,
            best: best || game.moveCount,
            collected: game.getItemProgress().collected,
            total: game.getItemProgress().total,
          }));
          setText(clearNextBtn, isGameComplete ? t("restartFromBeginning") : t("clearNext"));
          setText(clearRestartBtn, t("clearRestart"));
          setText(clearTitleBtn, t("clearToTitle"));
          clearNextBtn.disabled = false;
          if (!wasClearVisible) {
            trapFocusIn(clearOverlay);
          }
        } else if (wasClearVisible) {
          releaseFocusTrap();
        }
      }

      if (isPaused && !wasPaused) {
        trapFocusIn(pauseMenu);
      } else if (!isPaused && wasPaused) {
        releaseFocusTrap();
      }

      levelSelectPanel.style.display =
        state === GAME_STATE.TITLE ||
        state === GAME_STATE.LEVEL_SELECT ||
        state === GAME_STATE.GAME_COMPLETE
          ? "grid"
          : "none";

      if (state !== GAME_STATE.TITLE && state !== GAME_STATE.LEVEL_SELECT) {
        if (tutorialVisible) {
          tutorialOverlay.classList.add("hidden");
          tutorialVisible = false;
        }
      } else if (!game.settings.tutorialCompleted && !tutorialVisible) {
        showTutorial(false);
      }

      renderLevelButtons(forceLevelRerender);
      syncSettingControls(false);
      updateReplayDebugUI(false);
    }

    function handleGameEvents() {
      var events = game.drainEvents();
      if (events.length === 0) {
        return;
      }
      uiDirty = true;

      for (var i = 0; i < events.length; i += 1) {
        var event = events[i];

        if (event.type === "state") {
          if (event.payload && event.payload.state === GAME_STATE.PLAYING) {
            showLevelStartToast();
          }
          continue;
        }

        if (event.type === "restart") {
          showLevelStartToast();
          continue;
        }

        if (event.type === "move") {
          audio.playStep();
          continue;
        }

        if (event.type === "blocked") {
          audio.playBlocked();
          if (performance.now() - lastBlockedToastAt > GAMEPLAY.BLOCKED_TOAST_COOLDOWN_MS) {
            showToast(t("blockedToast"), "warning");
            lastBlockedToastAt = performance.now();
          }
          continue;
        }

        if (event.type === "undo") {
          audio.playUndo();
          continue;
        }

        if (event.type === "level_clear") {
          audio.playClear();
          showToast(
            t("levelClearToast", {
              moves: event.payload.moveCount,
              collected: event.payload.collectedItems,
              total: event.payload.totalItems,
            }),
            "success"
          );
          updateReplayDebugUI(true);
          continue;
        }

        if (event.type === "item_collected") {
          // VFX: 아이템 수집 파티클
          var itemVfxColor = "#ffdf00";
          var itemVfxCount = 8;
          if (event.payload.kind === "super_jelly") {
            itemVfxColor = "#ff9e38";
            itemVfxCount = 12;
          } else if (event.payload.kind === "star") {
            itemVfxColor = "#49d8ff";
            itemVfxCount = 14;
          }
          if (renderer.spawnItemParticles && event.payload.x != null) {
            renderer.spawnItemParticles(event.payload.x, event.payload.y, itemVfxColor, itemVfxCount);
          }

          if (event.payload.kind === "super_jelly") {
            audio.playBigItem();
            showToast(
              t("itemToastSuper", {
                length: event.payload.length,
                collected: event.payload.collected,
                total: event.payload.total,
              })
            );
          } else if (event.payload.kind === "star") {
            audio.playPower();
            showToast(
              t("itemToastStar", {
                turns: event.payload.starTurns || 0,
              })
            );
          } else {
            audio.playItem();
            showToast(
              t("itemToast", {
                length: event.payload.length,
                collected: event.payload.collected,
                total: event.payload.total,
              })
            );
          }
          continue;
        }

        if (event.type === "portal_used") {
          audio.playPortal();
          // VFX: 포털 워프 플래시
          if (renderer.triggerPortalFlash && event.payload.to) {
            renderer.triggerPortalFlash(
              event.payload.to.x,
              event.payload.to.y,
              "#37e5ff",
              performance.now()
            );
          }
          showToast(
            t("portalToast", {
              fromX: event.payload.from.x,
              fromY: event.payload.from.y,
              toX: event.payload.to.x,
              toY: event.payload.to.y,
            })
          );
          continue;
        }

        if (event.type === "power_end") {
          showToast(t("starEndToast"));
          continue;
        }

        if (event.type === "game_complete") {
          audio.playComplete();
          showToast(t("gameCompleteToast"), "success");
          updateReplayDebugUI(true);
          continue;
        }

        if (event.type === "deadlock") {
          showToast(t("deadlockToast"), "error");
          continue;
        }

        if (event.type === "storage_error") {
          showToast(currentLanguage() === "en" ? "Save failed: storage unavailable" : "저장 실패: 저장소를 사용할 수 없습니다", "error");
          continue;
        }
      }
    }

    function resizeCanvasToPanel() {
      var panelRect = canvasPanel.getBoundingClientRect();
      var maxW = Math.max(220, panelRect.width - 8);
      var maxH = Math.max(220, panelRect.height - 8);

      var scale = Math.min(maxW / constants.CANVAS_WIDTH, maxH / constants.CANVAS_HEIGHT);
      var desktopCompact = global.matchMedia && global.matchMedia("(min-width: 1101px)").matches;
      if (desktopCompact) {
        var screenCap = game.state === GAME_STATE.PLAYING ? 1.62 : 1.15;
        scale = Math.min(scale, screenCap);
      } else {
        scale = Math.min(scale, 1);
      }
      scale = Math.max(0.2, scale);

      var displayWidth = Math.floor(constants.CANVAS_WIDTH * scale);
      var displayHeight = Math.floor(constants.CANVAS_HEIGHT * scale);

      canvas.style.width = displayWidth + "px";
      canvas.style.height = displayHeight + "px";

      var dpr = Math.min(global.devicePixelRatio || 1, GAMEPLAY.MAX_DEVICE_PIXEL_RATIO);
      var pixelWidth = Math.max(1, Math.floor(displayWidth * dpr));
      var pixelHeight = Math.max(1, Math.floor(displayHeight * dpr));
      renderer.resizeViewport(pixelWidth, pixelHeight);
    }

    function processHeldMove(timestamp) {
      if (!heldMoveAction) {
        return;
      }

      if (game.state !== GAME_STATE.PLAYING) {
        heldMoveAction = null;
        heldMoveNextAt = 0;
        return;
      }

      if (timestamp < heldMoveNextAt) {
        return;
      }

      var repeats = 0;
      while (timestamp >= heldMoveNextAt && repeats < 3) {
        game.handleAction(heldMoveAction, { inputAtMs: timestamp });
        heldMoveNextAt += GAMEPLAY.HOLD_REPEAT_MS;
        repeats += 1;
      }
    }

    // 게임패드 입력: gamepad.js 모듈 사용 (아래 초기화 블록에서 인스턴스 생성)

    function attemptReplayCopy() {
      var payload = game.getReplayExport();
      if (!payload) {
        showToast(t("noReplayToast"));
        return;
      }

      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard
          .writeText(payload)
          .then(function onCopied() {
            showToast(t("copiedToast"));
          })
          .catch(function onCopyFail() {
            showToast(t("copyFailToast"));
          });
        return;
      }

      showToast(t("noClipboardToast"));
    }

    function confirmRestart() {
      if (global.confirm(t("confirmRestart"))) {
        game.restartLevel();
        uiDirty = true;
      }
    }

    // 게임패드 모듈 초기화 (confirmRestart 정의 후 가능)
    gamepadHandler = global.WormGameGamepad({
      game: game,
      audio: audio,
      onDirtyUI: function () {
        uiDirty = true;
      },
      onConfirmRestart: confirmRestart,
    });

    function confirmNewGame() {
      var message = game.settings.resetProgressOnNewGame
        ? t("confirmNewGameReset")
        : t("confirmNewGame");

      if (global.confirm(message)) {
        if (game.settings.resetProgressOnNewGame) {
          game.clearProgress();
        }
        game.startGame(true);
        updateUI(true);
      }
    }

    function jumpToLevel(levelNumber) {
      var parsed = Math.round(Number(levelNumber));
      if (!Number.isFinite(parsed)) {
        showToast(t("levelAdjustInvalid"));
        return false;
      }

      var safeLevel = clamp(parsed, 1, game.levels.length);
      var moved = game.selectLevel(safeLevel - 1, {
        ignoreLock: true,
        unlockThrough: true,
      });

      if (!moved) {
        showToast(t("levelAdjustInvalid"));
        return false;
      }

      showToast(t("levelAdjustToast", { level: safeLevel }));
      updateUI(true);
      resizeCanvasToPanel();
      return true;
    }

    function adjustLevelBy(delta) {
      if (delta > 0) {
        var movedNext = game.nextLevel({ force: true });
        if (movedNext) {
          showToast(t("levelAdjustToast", { level: game.currentLevel ? game.currentLevel.id : game.levelIndex + 1 }));
          updateUI(true);
          resizeCanvasToPanel();
        }
        return movedNext;
      }
      if (delta < 0) {
        var movedPrev = game.prevLevel({ force: true });
        if (movedPrev) {
          showToast(t("levelAdjustToast", { level: game.currentLevel ? game.currentLevel.id : game.levelIndex + 1 }));
          updateUI(true);
          resizeCanvasToPanel();
        }
        return movedPrev;
      }
      return false;
    }

    function setupDpadDrag() {
      if (!mobilePad || !padDragHandle || !padDragHandle.addEventListener) {
        return;
      }

      padDragHandle.addEventListener("pointerdown", function onPointerDown(event) {
        if (event.button !== undefined && event.button !== 0) {
          return;
        }

        var rect = mobilePad.getBoundingClientRect();
        dpadDragState = {
          id: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height,
        };
        padDragHandle.setPointerCapture(event.pointerId);
        event.preventDefault();
      });

      padDragHandle.addEventListener("pointermove", function onPointerMove(event) {
        if (!dpadDragState || event.pointerId !== dpadDragState.id) {
          return;
        }

        var dx = event.clientX - dpadDragState.startX;
        var dy = event.clientY - dpadDragState.startY;
        var maxX = Math.max(0, global.innerWidth - dpadDragState.width);
        var maxY = Math.max(0, global.innerHeight - dpadDragState.height);
        var x = clamp(dpadDragState.left + dx, 0, maxX);
        var y = clamp(dpadDragState.top + dy, 0, maxY);

        mobilePad.style.left = Math.round(x) + "px";
        mobilePad.style.top = Math.round(y) + "px";
        mobilePad.style.right = "auto";
        mobilePad.style.bottom = "auto";
      });

      function endDrag(event) {
        if (!dpadDragState || event.pointerId !== dpadDragState.id) {
          return;
        }

        var rect = mobilePad.getBoundingClientRect();
        game.updateSettings({
          dpadPosition: {
            x: Math.round(rect.left),
            y: Math.round(rect.top),
          },
        });

        dpadDragState = null;
        showToast(t("dpadSaved"));
      }

      padDragHandle.addEventListener("pointerup", endDrag);
      padDragHandle.addEventListener("pointercancel", endDrag);

      padDragHandle.addEventListener("dblclick", function onResetPadPos(event) {
        event.preventDefault();
        game.updateSettings({ dpadPosition: { x: null, y: null } });
        applyDpadPosition();
        showToast(t("dpadReset"));
      });
    }

    setupButton(startBtn, function onStart() {
      audio.unlock();
      if (game.state === GAME_STATE.GAME_COMPLETE) {
        game.startGame(true);
      } else {
        game.startGame(false);
      }
      updateUI(true);
      resizeCanvasToPanel();
    });

    setupButton(levelSelectBtn, function onOpenLevelSelect() {
      audio.unlock();
      if (game.state === GAME_STATE.LEVEL_SELECT) {
        game.closeLevelSelect();
      } else if (!game.openLevelSelect()) {
        showToast(t("blockedLevelSelect"));
      }
      updateUI(true);
      resizeCanvasToPanel();
    });

    setupButton(pauseBtn, function onPause() {
      audio.unlock();
      game.togglePause();
      uiDirty = true;
    });

    setupButton(resumeBtn, function onResume() {
      audio.unlock();
      game.togglePause();
      uiDirty = true;
    });

    setupButton(restartBtn, function onRestart() {
      audio.unlock();
      confirmRestart();
    });

    setupButton(exitTitleBtn, function onExitTitle() {
      audio.unlock();
      game.exitToTitle();
      updateUI(true);
      resizeCanvasToPanel();
    });

    setupButton(clearNextBtn, function onClearNext() {
      audio.unlock();
      if (game.state === GAME_STATE.GAME_COMPLETE) {
        game.startGame(true);
        updateUI(true);
        resizeCanvasToPanel();
      } else {
        adjustLevelBy(1);
      }
    });

    setupButton(clearRestartBtn, function onClearRestart() {
      audio.unlock();
      game.restartLevel();
      uiDirty = true;
    });

    setupButton(clearTitleBtn, function onClearTitle() {
      audio.unlock();
      game.exitToTitle();
      updateUI(true);
      resizeCanvasToPanel();
    });

    setupButton(nextBtn, function onNext() {
      audio.unlock();
      adjustLevelBy(1);
    });

    setupButton(undoBtn, function onUndo() {
      audio.unlock();
      game.undo();
      uiDirty = true;
    });

    setupButton(newGameBtn, function onNewGame() {
      audio.unlock();
      confirmNewGame();
    });

    setupButton(copyReplayBtn, function onCopyReplay() {
      audio.unlock();
      attemptReplayCopy();
    });

    setupButton(levelPrevStepBtn, function onLevelStepDown() {
      audio.unlock();
      adjustLevelBy(-1);
    });

    setupButton(levelNextStepBtn, function onLevelStepUp() {
      audio.unlock();
      adjustLevelBy(1);
    });

    if (levelJumpRange) {
      levelJumpRange.addEventListener("input", function onLevelRangeInput() {
        var parsed = clamp(Math.round(Number(levelJumpRange.value) || 1), 1, game.levels.length);
        if (levelAdjustValue) {
          setText(levelAdjustValue, parsed + " / " + game.levels.length);
        }
      });

      levelJumpRange.addEventListener("change", function onLevelRangeChange() {
        audio.unlock();
        jumpToLevel(levelJumpRange.value);
      });

      levelJumpRange.addEventListener("wheel", function onLevelRangeWheel(event) {
        event.preventDefault();
        if (event.deltaY > 0) {
          adjustLevelBy(1);
        } else if (event.deltaY < 0) {
          adjustLevelBy(-1);
        }
      });
    }

    setupButton(replayStepPrevBtn, function onReplayPrev() {
      replayUI.prevStep();
    });

    setupButton(replayStepNextBtn, function onReplayNext() {
      replayUI.nextStep();
    });

    setupButton(replayStepLatestBtn, function onReplayLatest() {
      replayUI.goLatest();
    });

    replayStepRange.addEventListener("input", function onReplayRangeInput() {
      replayUI.setStepFromRange();
    });

    var dpadButtons = Array.prototype.slice.call(document.querySelectorAll("[data-direction]"));
    dpadButtons.forEach(function bindPad(button) {
      var direction = button.getAttribute("data-direction");
      setupPadButton(button, function onPadPress() {
        audio.unlock();
        game.tryMove(direction, performance.now());
        uiDirty = true;
      });
    });

    document.addEventListener("keydown", function onKeyDown(event) {
      if (tutorialVisible) {
        if (event.key === "Escape") {
          event.preventDefault();
          closeTutorial(true);
          return;
        }
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          tutorialNextBtn.click();
        }
        return;
      }

      var key = event.key || "";
      var action = game.getActionFromKey(key);
      if (!action) {
        return;
      }

      event.preventDefault();
      audio.unlock();
      var inputAt = performance.now();

      if (isMoveAction(action)) {
        if (!event.repeat || heldMoveAction !== action) {
          heldMoveAction = action;
          heldMoveNextAt = inputAt + GAMEPLAY.HOLD_INITIAL_DELAY_MS;
          game.handleAction(action, { inputAtMs: inputAt });
          uiDirty = true;
          resizeCanvasToPanel();
        }
        return;
      }

      if (event.repeat) {
        return;
      }

      game.handleAction(action, { inputAtMs: inputAt });
      uiDirty = true;
      resizeCanvasToPanel();
    });

    document.addEventListener("keyup", function onKeyUp(event) {
      var key = event.key || "";
      var action = game.getActionFromKey(key);
      if (!isMoveAction(action)) {
        return;
      }
      if (action === heldMoveAction) {
        heldMoveAction = null;
        heldMoveNextAt = 0;
      }
    });

    document.addEventListener("visibilitychange", function onVisibilityChange() {
      if (document.hidden && game.state === GAME_STATE.PLAYING) {
        game.togglePause();
        showToast(t("autoPausedToast"));
        uiDirty = true;
      }
    });

    global.addEventListener("gamepadconnected", function onGamepadConnected() {
      if (gamepadHandler && !gamepadHandler.isConnected()) {
        showToast(t("gamepadConnected"));
      }
      if (gamepadHandler) { gamepadHandler.onConnected(); }
    });

    global.addEventListener("gamepaddisconnected", function onGamepadDisconnected() {
      if (gamepadHandler) { gamepadHandler.onDisconnected(); }
      showToast(t("gamepadDisconnected"));
    });

    setupSettingsBindings();
    setupTutorialBindings();
    setupDpadDrag();

    var motionQuery = global.matchMedia
      ? global.matchMedia("(prefers-reduced-motion: reduce)")
      : null;
    if (motionQuery && motionQuery.matches && !game.settings.reduceMotion) {
      game.updateSettings({ reduceMotion: true });
    }

    game.loadLevel(game.levelIndex);
    game.setState(GAME_STATE.TITLE);

    updateStaticTexts();
    syncSettingControls(true);
    updateUI(true);
    showTutorial(false);

    function onResize() {
      resizeCanvasToPanel();
      applyDpadPosition();
      uiDirty = true;
    }

    global.addEventListener("resize", onResize);
    global.addEventListener("orientationchange", onResize);
    resizeCanvasToPanel();

    var accumulator = 0;
    var lastTimestamp = performance.now();

    function frame(timestamp) {
      var delta = Math.min(1000, timestamp - lastTimestamp);
      lastTimestamp = timestamp;

      accumulator += delta;
      var step = GAMEPLAY.FRAME_STEP_MS;
      var iterations = 0;

      while (accumulator >= step && iterations < GAMEPLAY.FRAME_STEP_CAP) {
        game.update(step, timestamp);
        accumulator -= step;
        iterations += 1;
      }

      processHeldMove(timestamp);
      if (gamepadHandler) { gamepadHandler.process(timestamp); }
      renderer.draw(game, timestamp);
      handleGameEvents();
      if (uiDirty) {
        updateUI(false);
        uiDirty = false;
      }
      global.requestAnimationFrame(frame);
    }

    global.requestAnimationFrame(frame);

    global.__wormGame = game;
    global.__wormRenderer = renderer;
    global.__wormAudio = audio;
    global.__wormApp = appRoot;
  });
})(window);
