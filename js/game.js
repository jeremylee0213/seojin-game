/**
 * game.js — 게임 코어 로직 (상태머신, 이동, 아이템, 포털, undo, 리플레이)
 *
 * @module  WormPuzzleGame
 * @depends WormGameConstants (TILE, GAME_STATE, ACTION, GAMEPLAY, ...)
 * @depends WormGameLevels   (LEVELS)
 * @depends WormGameSnake    (Snake)
 * @depends WormGameI18N     (i18n — 선택적, getStateOverlayData에서 사용)
 * @exports global.WormPuzzleGame
 *
 * ES Module 전환 시:
 *   import { TILE, GAME_STATE, ... } from './constants.js'
 *   import { LEVELS } from './levels.js'
 *   import { Snake } from './snake.js'
 */
(function attachGame(global) {
  "use strict";

  var constants = global.WormGameConstants;
  var LEVELS = global.WormGameLevels.LEVELS;
  var Snake = global.WormGameSnake;

  var TILE = constants.TILE;
  var TILE_META = constants.TILE_META;
  var GAME_STATE = constants.GAME_STATE;
  var STATE_TRANSITIONS = constants.STATE_TRANSITIONS;
  var DIRECTIONS = constants.DIRECTIONS;
  var ACTION = constants.ACTION;
  var ACTION_TO_DIRECTION = constants.ACTION_TO_DIRECTION;
  var DEFAULT_KEY_BINDINGS = constants.DEFAULT_KEY_BINDINGS;
  var STORAGE_KEYS = constants.STORAGE_KEYS;
  var STORAGE_VERSION = constants.STORAGE_VERSION;
  var DEFAULT_SETTINGS = constants.DEFAULT_SETTINGS;
  var GAMEPLAY = constants.GAMEPLAY;
  var THEMES = constants.THEMES;
  var GRID_COLS = constants.GRID_COLS;
  var GRID_ROWS = constants.GRID_ROWS;

  var clamp = constants.clamp;

  function deepClone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function mergeSettings(base, incoming) {
    var merged = deepClone(base);
    if (!incoming || typeof incoming !== "object") {
      return merged;
    }

    if (Object.prototype.hasOwnProperty.call(incoming, "soundEnabled")) {
      merged.soundEnabled = !!incoming.soundEnabled;
    }
    if (Object.prototype.hasOwnProperty.call(incoming, "bgmEnabled")) {
      merged.bgmEnabled = !!incoming.bgmEnabled;
    }
    if (Object.prototype.hasOwnProperty.call(incoming, "bgmTrack")) {
      var track = String(incoming.bgmTrack || "");
      if (track === "arcade" || track === "chill") {
        merged.bgmTrack = track;
      } else {
        merged.bgmTrack = "retro";
      }
    }
    if (Object.prototype.hasOwnProperty.call(incoming, "vibrationEnabled")) {
      merged.vibrationEnabled = !!incoming.vibrationEnabled;
    }
    if (Object.prototype.hasOwnProperty.call(incoming, "highContrast")) {
      merged.highContrast = !!incoming.highContrast;
    }
    if (Object.prototype.hasOwnProperty.call(incoming, "colorBlindAssist")) {
      merged.colorBlindAssist = !!incoming.colorBlindAssist;
    }
    if (Object.prototype.hasOwnProperty.call(incoming, "reduceMotion")) {
      merged.reduceMotion = !!incoming.reduceMotion;
    }
    if (Object.prototype.hasOwnProperty.call(incoming, "handedness")) {
      merged.handedness = incoming.handedness === "left" ? "left" : "right";
    }
    if (Object.prototype.hasOwnProperty.call(incoming, "resetProgressOnNewGame")) {
      merged.resetProgressOnNewGame = !!incoming.resetProgressOnNewGame;
    }
    if (Object.prototype.hasOwnProperty.call(incoming, "showPerfOverlay")) {
      merged.showPerfOverlay = !!incoming.showPerfOverlay;
    }
    if (Object.prototype.hasOwnProperty.call(incoming, "showMoveHints")) {
      merged.showMoveHints = !!incoming.showMoveHints;
    }
    if (Object.prototype.hasOwnProperty.call(incoming, "language")) {
      merged.language = incoming.language === "en" ? "en" : "ko";
    }
    if (Object.prototype.hasOwnProperty.call(incoming, "tutorialCompleted")) {
      merged.tutorialCompleted = !!incoming.tutorialCompleted;
    }
    if (Object.prototype.hasOwnProperty.call(incoming, "mobilePerformanceMode")) {
      var mode = incoming.mobilePerformanceMode;
      if (mode === "battery" || mode === "quality") {
        merged.mobilePerformanceMode = mode;
      } else {
        merged.mobilePerformanceMode = "auto";
      }
    }
    if (Object.prototype.hasOwnProperty.call(incoming, "masterVolume")) {
      merged.masterVolume = clamp(Number(incoming.masterVolume) || 0, 0, 1);
    }
    if (Object.prototype.hasOwnProperty.call(incoming, "sfxVolume")) {
      merged.sfxVolume = clamp(Number(incoming.sfxVolume) || 0, 0, 1);
    }
    if (Object.prototype.hasOwnProperty.call(incoming, "replayDebugEnabled")) {
      merged.replayDebugEnabled = !!incoming.replayDebugEnabled;
    }

    if (incoming.dpadPosition && typeof incoming.dpadPosition === "object") {
      var x = incoming.dpadPosition.x;
      var y = incoming.dpadPosition.y;
      var parsedX = x === null || x === undefined || x === "" ? null : Number(x);
      var parsedY = y === null || y === undefined || y === "" ? null : Number(y);
      merged.dpadPosition = {
        x: Number.isFinite(parsedX) ? parsedX : null,
        y: Number.isFinite(parsedY) ? parsedY : null,
      };
    }

    var sourceCustom = incoming.customBindings || {};
    var keys = Object.keys(merged.customBindings);
    for (var i = 0; i < keys.length; i += 1) {
      var key = keys[i];
      var token = sourceCustom[key];
      if (typeof token === "string") {
        merged.customBindings[key] = token.trim().toLowerCase();
      }
    }

    return merged;
  }

  function nowMs() {
    return global.performance && global.performance.now
      ? global.performance.now()
      : Date.now();
  }

  var normalizeKeyToken = constants.normalizeKeyToken;

  function isWalkableTileType(tileType) {
    var meta = TILE_META[tileType];
    return !!(meta && meta.walkable);
  }

  var tileKey = constants.pointKey;

  function Game() {
    this.levels = LEVELS;
    this.state = GAME_STATE.TITLE;

    this.levelIndex = 0;
    this.unlockedLevelIndex = 0;
    this.currentLevel = null;
    this.snake = null;

    this.moveCount = 0;
    this.totalMoveCount = 0;
    this.history = [];

    this.animationTimeMs = 0;
    this.moveAnimation = null;
    this.feedback = null;

    this.bestMoves = {};
    this.progressClears = 0;
    this.replayLog = null;

    this.lastInputAt = {};
    this.lastInputLatencyMs = 0;

    this.eventQueue = [];
    this.deadlockHintUntil = 0;
    this.levelCollectedItems = 0;
    this.levelTotalItems = 0;
    this.totalItemsCollected = 0;
    this.levelStartSegments = null;
    this.levelStartTiles = null;
    this.replayArchive = {};
    this.historyCheckpoints = [];
    this.discardedHistoryCount = 0;
    this.starMovesRemaining = 0;
    this.portalLinks = {};

    this.settings = mergeSettings(DEFAULT_SETTINGS, this.loadSettingsData());
    this.progressData = this.loadProgressData();

    this.unlockedLevelIndex = clamp(
      this.progressData.unlockedLevelIndex,
      0,
      this.levels.length - 1
    );
    this.levelIndex = this.unlockedLevelIndex;
    this.bestMoves = this.progressData.bestMoves || {};
    this.totalMoveCount = this.progressData.totalMoves || 0;
    this.progressClears = this.progressData.clears || 0;
    this.totalItemsCollected = this.progressData.totalItems || 0;

    this.keyMap = this.buildKeyMap();
  }

  Game.prototype.emit = function emit(type, payload) {
    this.eventQueue.push({ type: type, payload: payload || null });
  };

  Game.prototype.drainEvents = function drainEvents() {
    var items = this.eventQueue.slice();
    this.eventQueue.length = 0;
    return items;
  };

  Game.prototype.buildKeyMap = function buildKeyMap() {
    var map = {};
    var actionKeys = Object.keys(DEFAULT_KEY_BINDINGS);

    function register(token, action) {
      if (!token) {
        return;
      }
      map[token] = action;
    }

    for (var i = 0; i < actionKeys.length; i += 1) {
      var action = actionKeys[i];
      var defaults = DEFAULT_KEY_BINDINGS[action];
      for (var j = 0; j < defaults.length; j += 1) {
        register(defaults[j], action);
      }

      var customToken = this.settings.customBindings[action];
      if (customToken) {
        register(customToken, action);
      }
    }

    return map;
  };

  Game.prototype.getBindingToken = function getBindingToken(action) {
    return this.settings.customBindings[action] || "";
  };

  Game.prototype.setBindingToken = function setBindingToken(action, rawToken) {
    var token = normalizeKeyToken(rawToken);
    if (!Object.prototype.hasOwnProperty.call(this.settings.customBindings, action)) {
      return false;
    }

    this.settings.customBindings[action] = token;
    this.keyMap = this.buildKeyMap();
    this.saveSettingsData();
    return true;
  };

  Game.prototype.clearBindingToken = function clearBindingToken(action) {
    return this.setBindingToken(action, "");
  };

  Game.prototype.loadProgressData = function loadProgressData() {
    var fallback = {
      version: STORAGE_VERSION,
      unlockedLevelIndex: 0,
      bestMoves: {},
      totalMoves: 0,
      clears: 0,
      totalItems: 0,
    };

    try {
      var raw = global.localStorage.getItem(STORAGE_KEYS.PROGRESS);
      if (!raw) {
        raw = global.localStorage.getItem(STORAGE_KEYS.PROGRESS_BACKUP);
      }
      if (!raw) {
        var legacyRaw = global.localStorage.getItem(STORAGE_KEYS.LEGACY_PROGRESS_LEVEL);
        if (legacyRaw !== null) {
          var legacyValue = Number.parseInt(legacyRaw, 10);
          if (!Number.isNaN(legacyValue)) {
            fallback.unlockedLevelIndex = clamp(
              legacyValue,
              0,
              this.levels.length - 1
            );
          }
        }
        return fallback;
      }

      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") {
        return fallback;
      }

      if (parsed.version !== STORAGE_VERSION) {
        // Lightweight migration path. Unknown fields are dropped.
      }

      fallback.unlockedLevelIndex = clamp(
        Number(parsed.unlockedLevelIndex) || 0,
        0,
        this.levels.length - 1
      );
      fallback.bestMoves = parsed.bestMoves || {};
      fallback.totalMoves = Math.max(0, Number(parsed.totalMoves) || 0);
      fallback.clears = Math.max(0, Number(parsed.clears) || 0);
      fallback.totalItems = Math.max(0, Number(parsed.totalItems) || 0);
      return fallback;
    } catch (_error) {
      try {
        var backupRaw = global.localStorage.getItem(STORAGE_KEYS.PROGRESS_BACKUP);
        if (backupRaw) {
          var backupParsed = JSON.parse(backupRaw);
          if (backupParsed && typeof backupParsed === "object") {
            fallback.unlockedLevelIndex = clamp(
              Number(backupParsed.unlockedLevelIndex) || 0,
              0,
              this.levels.length - 1
            );
            fallback.bestMoves = backupParsed.bestMoves || {};
            fallback.totalMoves = Math.max(0, Number(backupParsed.totalMoves) || 0);
            fallback.clears = Math.max(0, Number(backupParsed.clears) || 0);
            fallback.totalItems = Math.max(0, Number(backupParsed.totalItems) || 0);
          }
        }
      } catch (_backupError) {
        // keep fallback
      }
      return fallback;
    }
  };

  Game.prototype.saveProgressData = function saveProgressData() {
    this.progressData = {
      version: STORAGE_VERSION,
      unlockedLevelIndex: this.unlockedLevelIndex,
      bestMoves: this.bestMoves,
      totalMoves: this.totalMoveCount,
      clears: this.progressClears,
      totalItems: this.totalItemsCollected,
    };

    try {
      global.localStorage.setItem(
        STORAGE_KEYS.PROGRESS,
        JSON.stringify(this.progressData)
      );
      global.localStorage.setItem(
        STORAGE_KEYS.PROGRESS_BACKUP,
        JSON.stringify(this.progressData)
      );
    } catch (_error) {
      this.emit("storage_error", { operation: "save_progress" });
    }
  };

  Game.prototype.loadSettingsData = function loadSettingsData() {
    try {
      var raw = global.localStorage.getItem(STORAGE_KEYS.SETTINGS);
      if (!raw) {
        raw = global.localStorage.getItem(STORAGE_KEYS.SETTINGS_BACKUP);
      }
      if (!raw) {
        return null;
      }
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") {
        return null;
      }
      return parsed;
    } catch (_error) {
      try {
        var backupRaw = global.localStorage.getItem(STORAGE_KEYS.SETTINGS_BACKUP);
        if (!backupRaw) {
          return null;
        }
        var backupParsed = JSON.parse(backupRaw);
        if (!backupParsed || typeof backupParsed !== "object") {
          return null;
        }
        return backupParsed;
      } catch (_backupError) {
        return null;
      }
    }
  };

  Game.prototype.saveSettingsData = function saveSettingsData() {
    try {
      global.localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(this.settings));
      global.localStorage.setItem(
        STORAGE_KEYS.SETTINGS_BACKUP,
        JSON.stringify(this.settings)
      );
    } catch (_error) {
      this.emit("storage_error", { operation: "save_settings" });
    }
  };

  Game.prototype.updateSettings = function updateSettings(patch) {
    this.settings = mergeSettings(this.settings, patch);
    this.keyMap = this.buildKeyMap();
    this.saveSettingsData();
    this.emit("settings_changed", { settings: this.settings });
  };

  Game.prototype.clearProgress = function clearProgress() {
    this.unlockedLevelIndex = 0;
    this.bestMoves = {};
    this.totalMoveCount = 0;
    this.progressClears = 0;
    this.totalItemsCollected = 0;
    this.saveProgressData();
  };

  Game.prototype.isTransitionAllowed = function isTransitionAllowed(next) {
    var allowed = STATE_TRANSITIONS[this.state] || [];
    return allowed.indexOf(next) !== -1 || next === this.state;
  };

  Game.prototype.setState = function setState(next) {
    if (!this.isTransitionAllowed(next)) {
      return false;
    }

    this.state = next;
    return true;
  };

  Game.prototype.startGame = function startGame(fromBeginning) {
    if (fromBeginning && this.settings.resetProgressOnNewGame) {
      this.clearProgress();
    }

    if (fromBeginning) {
      this.levelIndex = 0;
    } else {
      this.levelIndex = this.unlockedLevelIndex;
    }

    this.loadLevel(this.levelIndex);
    this.setState(GAME_STATE.PLAYING);
    this.emit("state", { state: this.state });
  };

  Game.prototype.openLevelSelect = function openLevelSelect() {
    if (
      this.state === GAME_STATE.TITLE ||
      this.state === GAME_STATE.PAUSED ||
      this.state === GAME_STATE.LEVEL_COMPLETE ||
      this.state === GAME_STATE.GAME_COMPLETE
    ) {
      this.setState(GAME_STATE.LEVEL_SELECT);
      return true;
    }
    return false;
  };

  Game.prototype.closeLevelSelect = function closeLevelSelect() {
    if (this.state !== GAME_STATE.LEVEL_SELECT) {
      return false;
    }
    this.setState(GAME_STATE.TITLE);
    return true;
  };

  Game.prototype.selectLevel = function selectLevel(index, options) {
    var opts = options || {};
    var normalized = clamp(index, 0, this.levels.length - 1);
    var ignoreLock = !!opts.ignoreLock;

    if (!ignoreLock && normalized > this.unlockedLevelIndex) {
      return false;
    }

    if (ignoreLock && normalized > this.unlockedLevelIndex && opts.unlockThrough) {
      this.unlockedLevelIndex = normalized;
    }

    this.loadLevel(normalized);
    this.setState(GAME_STATE.PLAYING);
    this.emit("state", { state: this.state });
    this.saveProgressData();
    return true;
  };

  Game.prototype.loadLevel = function loadLevel(index) {
    var normalized = clamp(index, 0, this.levels.length - 1);
    this.levelIndex = normalized;
    var baseLevel = this.levels[normalized];
    var clonedTiles = baseLevel.tiles.map(function copyRow(row) {
      return row.slice();
    });
    this.currentLevel = {
      id: baseLevel.id,
      world: baseLevel.world || Math.ceil(baseLevel.id / 10),
      stage: baseLevel.stage || ((baseLevel.id - 1) % 10) + 1,
      title: baseLevel.title,
      snakeLength: baseLevel.snakeLength,
      theme: baseLevel.theme,
      character: baseLevel.character || null,
      metrics: baseLevel.metrics || null,
      spawn: { x: baseLevel.spawn.x, y: baseLevel.spawn.y },
      tiles: clonedTiles,
    };

    this.snake = new Snake(
      this.currentLevel.spawn,
      this.currentLevel.snakeLength,
      this.currentLevel.tiles
    );

    this.moveCount = 0;
    this.history = [];
    this.historyCheckpoints = [];
    this.discardedHistoryCount = 0;
    this.moveAnimation = null;
    this.feedback = null;
    this.deadlockHintUntil = 0;
    this.levelCollectedItems = 0;
    this.levelTotalItems = this.countItemsInCurrentLevel();
    this.starMovesRemaining = 0;
    this.portalLinks = this.buildPortalLinks();

    this.replayLog = {
      levelId: this.currentLevel.id,
      startedAt: Date.now(),
      moves: [],
    };

    this.levelStartSegments = this.snake.cloneSegments();
    this.levelStartTiles = this.currentLevel.tiles.map(function copyRow(row) {
      return row.slice();
    });
  };

  Game.prototype.buildPortalLinks = function buildPortalLinks() {
    if (!this.currentLevel) {
      return {};
    }

    var firstA = null;
    var firstB = null;

    for (var y = 0; y < GRID_ROWS; y += 1) {
      for (var x = 0; x < GRID_COLS; x += 1) {
        var tile = this.currentLevel.tiles[y][x];
        if (tile === TILE.PORTAL_A && !firstA) {
          firstA = { x: x, y: y };
        } else if (tile === TILE.PORTAL_B && !firstB) {
          firstB = { x: x, y: y };
        }
      }
    }

    var links = {};
    if (firstA && firstB) {
      links[tileKey(firstA.x, firstA.y)] = { x: firstB.x, y: firstB.y };
      links[tileKey(firstB.x, firstB.y)] = { x: firstA.x, y: firstA.y };
    }
    return links;
  };

  Game.prototype.getPortalDestination = function getPortalDestination(x, y) {
    return this.portalLinks[tileKey(x, y)] || null;
  };

  Game.prototype.isStarActive = function isStarActive() {
    return this.starMovesRemaining > 0;
  };

  Game.prototype.canEnterTileType = function canEnterTileType(tileType) {
    if (tileType === TILE.WALL) {
      return false;
    }
    if (tileType === TILE.OBSTACLE && !this.isStarActive()) {
      return false;
    }
    return true;
  };

  Game.prototype.countItemsInCurrentLevel = function countItemsInCurrentLevel() {
    if (!this.currentLevel) {
      return 0;
    }

    var total = 0;
    for (var y = 0; y < GRID_ROWS; y += 1) {
      for (var x = 0; x < GRID_COLS; x += 1) {
        var tile = this.currentLevel.tiles[y][x];
        if (tile === TILE.ITEM || tile === TILE.BIG_ITEM) {
          total += 1;
        }
      }
    }
    return total;
  };

  Game.prototype.pushHistoryDelta = function pushHistoryDelta(delta) {
    this.history.push(delta);
    if (this.moveCount > 0 && this.moveCount % 20 === 0) {
      this.historyCheckpoints.push({
        moveCount: this.moveCount,
        snake: this.snake.getSnapshot(),
        collected: this.levelCollectedItems,
      });
      if (this.historyCheckpoints.length > 12) {
        this.historyCheckpoints.shift();
      }
    }

    if (this.history.length > GAMEPLAY.HISTORY_LIMIT) {
      this.discardedHistoryCount += 1;
      this.history.shift();
    }
  };

  Game.prototype.isInsideBoard = function isInsideBoard(x, y) {
    return x >= 0 && y >= 0 && x < GRID_COLS && y < GRID_ROWS;
  };

  Game.prototype.getTile = function getTile(x, y) {
    if (!this.currentLevel || !this.isInsideBoard(x, y)) {
      return TILE.WALL;
    }
    return this.currentLevel.tiles[y][x];
  };

  Game.prototype.isWalkableTile = function isWalkableTile(x, y) {
    if (!this.currentLevel || !this.isInsideBoard(x, y)) {
      return false;
    }
    return this.canEnterTileType(this.currentLevel.tiles[y][x]);
  };

  Game.prototype.canMoveTo = function canMoveTo(x, y) {
    if (!this.currentLevel || !this.isInsideBoard(x, y)) {
      return false;
    }

    var tile = this.currentLevel.tiles[y][x];
    return this.canEnterTileType(tile);
  };

  Game.prototype.getMoveCandidate = function getMoveCandidate(directionName) {
    var direction = DIRECTIONS[directionName];
    if (!direction) {
      return null;
    }
    var head = this.snake.getHead();
    return {
      x: head.x + direction.x,
      y: head.y + direction.y,
    };
  };

  Game.prototype.hasAnyValidMove = function hasAnyValidMove() {
    var directionNames = Object.keys(DIRECTIONS);
    for (var i = 0; i < directionNames.length; i += 1) {
      var next = this.getMoveCandidate(directionNames[i]);
      if (this.canMoveTo(next.x, next.y)) {
        return true;
      }
    }
    return false;
  };

  Game.prototype.recordReplayMove = function recordReplayMove(directionName, inputAtMs) {
    if (!this.replayLog) {
      return;
    }

    this.replayLog.moves.push({
      direction: directionName,
      atMs: Math.max(0, Math.round(nowMs() - inputAtMs)),
      moveIndex: this.moveCount,
    });
  };

  Game.prototype.storeReplayArchive = function storeReplayArchive() {
    if (!this.replayLog) {
      return;
    }

    this.replayArchive[this.currentLevel.id] = {
      levelId: this.currentLevel.id,
      moveCount: this.moveCount,
      moves: this.replayLog.moves.slice(),
      startSegments: this.levelStartSegments
        ? this.levelStartSegments.map(function copySegment(seg) {
            return { x: seg.x, y: seg.y };
          })
        : [],
      startTiles: this.levelStartTiles
        ? this.levelStartTiles.map(function copyRow(row) {
            return row.slice();
          })
        : [],
    };
  };

  Game.prototype.setBlockedFeedback = function setBlockedFeedback(candidate, reason) {
    this.feedback = {
      type: "blocked",
      tile: { x: candidate.x, y: candidate.y },
      reason: reason,
      startedAt: this.animationTimeMs,
      until: this.animationTimeMs + GAMEPLAY.BLOCKED_FEEDBACK_MS,
      shakeUntil: this.animationTimeMs + GAMEPLAY.SHAKE_DURATION_MS,
    };
    this.emit("blocked", { reason: reason, tile: candidate });

    if (this.settings.vibrationEnabled && global.navigator && navigator.vibrate) {
      navigator.vibrate(18);
    }
  };

  Game.prototype.startMoveAnimation = function startMoveAnimation(fromSegments, toSegments) {
    var duration = this.settings.reduceMotion
      ? 0
      : GAMEPLAY.MOVE_ANIMATION_MS;

    this.moveAnimation = {
      fromSegments: fromSegments,
      toSegments: toSegments,
      startAt: this.animationTimeMs,
      duration: duration,
    };
  };

  Game.prototype.tryMove = function tryMove(directionName, inputAtMs) {
    if (this.state !== GAME_STATE.PLAYING) {
      return false;
    }

    if (!this.snake) {
      return false;
    }

    if (this.moveAnimation && this.moveAnimation.duration > 0) {
      var elapsed = this.animationTimeMs - this.moveAnimation.startAt;
      if (elapsed < this.moveAnimation.duration * 0.7) {
        return false;
      }
    }

    var candidate = this.getMoveCandidate(directionName);
    if (!candidate) {
      return false;
    }

    var candidateTile = this.getTile(candidate.x, candidate.y);
    if (!this.canEnterTileType(candidateTile)) {
      this.setBlockedFeedback(
        candidate,
        candidateTile === TILE.OBSTACLE ? "obstacle" : "wall"
      );
      return false;
    }

    var beforeSegments = this.snake.cloneSegments();
    var tail = beforeSegments[beforeSegments.length - 1];

    var delta = {
      moveCountBefore: this.moveCount,
      previousDirection: this.snake.direction,
      tail: { x: tail.x, y: tail.y },
      inputAtMs: inputAtMs,
      direction: directionName,
      growth: 0,
      consumedItem: null,
      totalItemsBefore: this.totalItemsCollected,
      levelItemsBefore: this.levelCollectedItems,
      starMovesBefore: this.starMovesRemaining,
      portalJump: null,
    };
    this.pushHistoryDelta(delta);

    this.snake.move(directionName);

    var itemResult = this.handleItemCollection(candidate, candidateTile, tail, delta);

    this.handlePortalWarp(candidate, candidateTile, delta);

    this.tickStarPower(itemResult.activatedStar);

    this.moveCount += 1;
    this.totalMoveCount += 1;

    var afterSegments = this.snake.cloneSegments();
    this.startMoveAnimation(beforeSegments, afterSegments);

    this.recordReplayMove(directionName, inputAtMs || nowMs());
    this.lastInputLatencyMs = Math.max(0, this.animationTimeMs - (inputAtMs || this.animationTimeMs));

    this.emit("move", {
      direction: directionName,
      moveCount: this.moveCount,
      starMoves: this.starMovesRemaining,
    });

    this.checkPostMoveState();

    this.saveProgressData();
    return true;
  };

  /**
   * 아이템 수집 처리 서브 메서드.
   * 젤리/슈퍼젤리/스타 아이템을 수집하고 delta에 기록한다.
   */
  Game.prototype.handleItemCollection = function handleItemCollection(candidate, candidateTile, tail, delta) {
    var growth = 0;
    var collectedType = "";
    var activatedStar = false;

    if (candidateTile === TILE.ITEM) {
      this.currentLevel.tiles[candidate.y][candidate.x] = TILE.EMPTY;
      this.snake.growByTailPosition(tail);
      growth = 1;
      collectedType = "jelly";
      delta.consumedItem = { x: candidate.x, y: candidate.y, tile: candidateTile };
      this.levelCollectedItems += 1;
      this.totalItemsCollected += 1;
    } else if (candidateTile === TILE.BIG_ITEM) {
      this.currentLevel.tiles[candidate.y][candidate.x] = TILE.EMPTY;
      this.snake.growByTailPosition(tail);
      this.snake.growByTailPosition(tail);
      growth = 2;
      collectedType = "super_jelly";
      delta.consumedItem = { x: candidate.x, y: candidate.y, tile: candidateTile };
      this.levelCollectedItems += 1;
      this.totalItemsCollected += 1;
    } else if (candidateTile === TILE.STAR_ITEM) {
      this.currentLevel.tiles[candidate.y][candidate.x] = TILE.EMPTY;
      this.starMovesRemaining = GAMEPLAY.STAR_POWER_MOVES;
      collectedType = "star";
      activatedStar = true;
      delta.consumedItem = { x: candidate.x, y: candidate.y, tile: candidateTile };
      this.emit("power_start", {
        kind: "star",
        turns: this.starMovesRemaining,
      });
    }

    if (growth > 0) {
      delta.growth = growth;
      this.emit("item_collected", {
        kind: collectedType,
        growth: growth,
        x: candidate.x,
        y: candidate.y,
        length: this.snake.segments.length,
        collected: this.levelCollectedItems,
        total: this.levelTotalItems,
      });
    } else if (collectedType === "star") {
      this.emit("item_collected", {
        kind: collectedType,
        growth: 0,
        x: candidate.x,
        y: candidate.y,
        length: this.snake.segments.length,
        collected: this.levelCollectedItems,
        total: this.levelTotalItems,
        starTurns: this.starMovesRemaining,
      });
    }

    return { growth: growth, collectedType: collectedType, activatedStar: activatedStar };
  };

  /**
   * 포털 워프 처리 서브 메서드.
   * 포털 타일 위에 있으면 반대편 포털로 이동시킨다.
   */
  Game.prototype.handlePortalWarp = function handlePortalWarp(candidate, candidateTile, delta) {
    if (candidateTile !== TILE.PORTAL_A && candidateTile !== TILE.PORTAL_B) {
      return;
    }
    var portalDestination = this.getPortalDestination(candidate.x, candidate.y);
    if (!portalDestination) {
      return;
    }
    var destinationTile = this.getTile(portalDestination.x, portalDestination.y);
    if (!this.canEnterTileType(destinationTile)) {
      return;
    }
    this.snake.segments[0].x = portalDestination.x;
    this.snake.segments[0].y = portalDestination.y;
    delta.portalJump = {
      from: { x: candidate.x, y: candidate.y },
      to: { x: portalDestination.x, y: portalDestination.y },
    };
    this.emit("portal_used", delta.portalJump);
  };

  /**
   * 스타 파워 턴 차감 서브 메서드.
   * 이미 이번 턴에 스타를 활성화했으면 차감하지 않는다.
   */
  Game.prototype.tickStarPower = function tickStarPower(justActivated) {
    if (this.starMovesRemaining > 0 && !justActivated) {
      this.starMovesRemaining -= 1;
      if (this.starMovesRemaining <= 0) {
        this.starMovesRemaining = 0;
        this.emit("power_end", { kind: "star" });
      }
    }
  };

  /**
   * 이동 후 상태 확인 서브 메서드.
   * 출구 도달 시 레벨 클리어, 유효한 이동이 없으면 데드락 힌트 발동.
   */
  Game.prototype.checkPostMoveState = function checkPostMoveState() {
    var headAfterMove = this.snake.getHead();
    var headTile = this.getTile(headAfterMove.x, headAfterMove.y);
    if (headTile === TILE.EXIT) {
      this.handleLevelClear();
    } else if (!this.hasAnyValidMove()) {
      this.deadlockHintUntil = this.animationTimeMs + GAMEPLAY.DEADLOCK_HINT_MS;
      this.emit("deadlock", null);
    }
  };

  Game.prototype.handleLevelClear = function handleLevelClear() {
    var levelId = this.currentLevel.id;
    var previousBest = this.bestMoves[levelId] || 0;
    var best = previousBest;
    if (!best || this.moveCount < best) {
      this.bestMoves[levelId] = this.moveCount;
      best = this.moveCount;
    }

    this.storeReplayArchive();

    this.progressClears += 1;

    var lastLevelIndex = this.levels.length - 1;
    if (this.levelIndex >= lastLevelIndex) {
      this.unlockedLevelIndex = lastLevelIndex;
      this.saveProgressData();
      this.setState(GAME_STATE.GAME_COMPLETE);
      this.emit("game_complete", {
        moveCount: this.moveCount,
        totalMoves: this.totalMoveCount,
      });
      return;
    }

    this.unlockedLevelIndex = Math.max(this.unlockedLevelIndex, this.levelIndex + 1);
    this.saveProgressData();
    this.setState(GAME_STATE.LEVEL_COMPLETE);
    this.emit("level_clear", {
      levelId: levelId,
      moveCount: this.moveCount,
      bestMoves: this.bestMoves[levelId],
      collectedItems: this.levelCollectedItems,
      totalItems: this.levelTotalItems,
      previousBest: previousBest,
    });
  };

  Game.prototype.undo = function undo() {
    if (this.state !== GAME_STATE.PLAYING) {
      return false;
    }

    var delta = this.history.pop();
    if (!delta) {
      return false;
    }

    var current = this.snake.cloneSegments();
    var restored = [];
    var growth = Math.max(0, Number(delta.growth) || 0);
    var restoreEnd = Math.max(1, current.length - growth);

    // 포털 점프가 있었으면 헤드를 원래 이동 목적지(포털 입구)로 되돌림
    var effectiveSegments = current;
    if (delta.portalJump) {
      effectiveSegments = current.slice();
      effectiveSegments[0] = { x: delta.portalJump.from.x, y: delta.portalJump.from.y };
    }

    for (var i = 1; i < restoreEnd; i += 1) {
      restored.push({ x: effectiveSegments[i].x, y: effectiveSegments[i].y });
    }
    if (delta.tail) {
      restored.push({ x: delta.tail.x, y: delta.tail.y });
    }

    if (restored.length === 0) {
      // Keep at least one segment so render/move paths never operate on an empty snake.
      var fallbackHead = delta.tail || current[0];
      if (fallbackHead) {
        restored.push({ x: fallbackHead.x, y: fallbackHead.y });
      }
    }

    if (delta.consumedItem) {
      this.currentLevel.tiles[delta.consumedItem.y][delta.consumedItem.x] =
        delta.consumedItem.tile || TILE.ITEM;
      this.levelCollectedItems = delta.levelItemsBefore;
      this.totalItemsCollected = delta.totalItemsBefore;
    }

    this.starMovesRemaining = Math.max(0, Number(delta.starMovesBefore) || 0);
    this.snake.segments = restored;
    this.snake.direction = delta.previousDirection;
    this.moveCount = delta.moveCountBefore;
    this.startMoveAnimation(current, restored);

    this.emit("undo", { moveCount: this.moveCount });
    return true;
  };

  Game.prototype.restartLevel = function restartLevel() {
    if (!this.currentLevel) {
      return false;
    }

    if (this.replayLog && this.replayLog.moves.length > 0) {
      this.storeReplayArchive();
    }

    this.loadLevel(this.levelIndex);
    if (this.state !== GAME_STATE.TITLE) {
      this.setState(GAME_STATE.PLAYING);
    }
    this.emit("restart", { levelId: this.currentLevel.id });
    return true;
  };

  Game.prototype.nextLevel = function nextLevel(options) {
    var opts = options || {};
    var force = !!opts.force;
    if (!force && this.state !== GAME_STATE.LEVEL_COMPLETE) {
      return false;
    }

    var target = clamp(this.levelIndex + 1, 0, this.levels.length - 1);
    if (target === this.levelIndex) {
      return false;
    }

    return this.selectLevel(target, {
      ignoreLock: true,
      unlockThrough: true,
    });
  };

  Game.prototype.prevLevel = function prevLevel(options) {
    var opts = options || {};
    var force = !!opts.force;
    if (!force && this.state !== GAME_STATE.LEVEL_COMPLETE) {
      return false;
    }

    var target = clamp(this.levelIndex - 1, 0, this.levels.length - 1);
    if (target === this.levelIndex) {
      return false;
    }

    return this.selectLevel(target, {
      ignoreLock: true,
      unlockThrough: false,
    });
  };

  Game.prototype.exitToTitle = function exitToTitle() {
    if (this.state === GAME_STATE.PLAYING) {
      return false;
    }

    if (this.replayLog && this.replayLog.moves.length > 0) {
      this.storeReplayArchive();
    }

    this.loadLevel(this.unlockedLevelIndex);
    this.setState(GAME_STATE.TITLE);
    this.emit("state", { state: this.state });
    return true;
  };

  Game.prototype.togglePause = function togglePause() {
    if (this.state === GAME_STATE.PLAYING) {
      this.setState(GAME_STATE.PAUSED);
      this.emit("pause", { paused: true });
      return true;
    }

    if (this.state === GAME_STATE.PAUSED) {
      this.setState(GAME_STATE.PLAYING);
      this.emit("pause", { paused: false });
      return true;
    }

    return false;
  };

  Game.prototype.getActionFromKey = function getActionFromKey(rawKey) {
    var token = normalizeKeyToken(rawKey);
    return this.keyMap[token] || null;
  };

  Game.prototype.shouldDebounce = function shouldDebounce(action, atMs) {
    var key = action;
    var previous = this.lastInputAt[key] || 0;
    if (atMs - previous < GAMEPLAY.INPUT_DEBOUNCE_MS) {
      return true;
    }
    this.lastInputAt[key] = atMs;
    return false;
  };

  Game.prototype.handleAction = function handleAction(action, meta) {
    var inputAtMs = meta && meta.inputAtMs ? meta.inputAtMs : nowMs();

    if (action === ACTION.MOVE_UP) {
      return this.tryMove(ACTION_TO_DIRECTION[action], inputAtMs);
    }
    if (action === ACTION.MOVE_DOWN) {
      return this.tryMove(ACTION_TO_DIRECTION[action], inputAtMs);
    }
    if (action === ACTION.MOVE_LEFT) {
      return this.tryMove(ACTION_TO_DIRECTION[action], inputAtMs);
    }
    if (action === ACTION.MOVE_RIGHT) {
      return this.tryMove(ACTION_TO_DIRECTION[action], inputAtMs);
    }

    if (action === ACTION.UNDO) {
      return this.undo();
    }
    if (action === ACTION.RESTART) {
      return this.restartLevel();
    }
    if (action === ACTION.PAUSE) {
      return this.togglePause();
    }
    if (action === ACTION.NEXT) {
      return this.nextLevel({ force: true });
    }
    if (action === ACTION.LEVEL_SELECT) {
      return this.openLevelSelect();
    }

    if (action === ACTION.START) {
      if (this.state === GAME_STATE.TITLE) {
        this.startGame(false);
        return true;
      }
      if (this.state === GAME_STATE.LEVEL_SELECT) {
        this.closeLevelSelect();
        return true;
      }
      if (this.state === GAME_STATE.LEVEL_COMPLETE) {
        return this.nextLevel();
      }
      if (this.state === GAME_STATE.GAME_COMPLETE) {
        this.startGame(true);
        return true;
      }
      if (this.state === GAME_STATE.PAUSED) {
        return this.togglePause();
      }
    }

    return false;
  };

  Game.prototype.handleKey = function handleKey(rawKey, keyDownMeta) {
    if (!rawKey) {
      return false;
    }

    var action = this.getActionFromKey(rawKey);
    if (!action) {
      return false;
    }

    var atMs = (keyDownMeta && keyDownMeta.inputAtMs) || nowMs();
    var isMoveAction =
      action === ACTION.MOVE_UP ||
      action === ACTION.MOVE_DOWN ||
      action === ACTION.MOVE_LEFT ||
      action === ACTION.MOVE_RIGHT;

    if (isMoveAction && this.shouldDebounce(action, atMs)) {
      return false;
    }

    return this.handleAction(action, { inputAtMs: atMs });
  };

  Game.prototype.consumeFeedback = function consumeFeedback(timeMs) {
    if (!this.feedback) {
      return null;
    }

    if (timeMs > this.feedback.until) {
      this.feedback = null;
      return null;
    }

    return this.feedback;
  };

  Game.prototype.getRenderSnake = function getRenderSnake(timeMs) {
    if (!this.snake) {
      return null;
    }

    if (!this.moveAnimation || this.moveAnimation.duration <= 0) {
      return {
        direction: this.snake.direction,
        segments: this.snake.cloneSegments(),
      };
    }

    var elapsed = timeMs - this.moveAnimation.startAt;
    var t = clamp(elapsed / this.moveAnimation.duration, 0, 1);

    if (t >= 1) {
      return {
        direction: this.snake.direction,
        segments: this.snake.cloneSegments(),
      };
    }

    var fromSegments = this.moveAnimation.fromSegments;
    var toSegments = this.moveAnimation.toSegments;
    var fromLen = fromSegments.length;
    var toLen = toSegments.length;

    if (fromLen === 0 && toLen === 0) {
      return {
        direction: this.snake.direction,
        segments: this.snake.cloneSegments(),
      };
    }

    var count = Math.max(fromLen, toLen);
    var segments = [];
    for (var i = 0; i < count; i += 1) {
      var from = fromLen > 0 ? fromSegments[Math.min(i, fromLen - 1)] : null;
      var to = toLen > 0 ? toSegments[Math.min(i, toLen - 1)] : null;

      if (!from && !to) {
        continue;
      }
      if (!from) {
        from = to;
      }
      if (!to) {
        to = from;
      }

      if (!from || !to) {
        continue;
      }

      segments.push({
        x: from.x + (to.x - from.x) * t,
        y: from.y + (to.y - from.y) * t,
      });
    }

    if (segments.length === 0) {
      return {
        direction: this.snake.direction,
        segments: this.snake.cloneSegments(),
      };
    }

    return {
      direction: this.snake.direction,
      segments: segments,
    };
  };

  Game.prototype.getScreenShakeOffset = function getScreenShakeOffset(timeMs) {
    if (!this.feedback || !this.feedback.shakeUntil) {
      return { x: 0, y: 0 };
    }

    if (timeMs > this.feedback.shakeUntil || this.settings.reduceMotion) {
      return { x: 0, y: 0 };
    }

    var remaining = this.feedback.shakeUntil - timeMs;
    var ratio = clamp(remaining / GAMEPLAY.SHAKE_DURATION_MS, 0, 1);
    var amplitude = GAMEPLAY.SHAKE_AMPLITUDE * ratio;
    return {
      x: Math.sin(timeMs * 0.18) * amplitude,
      y: Math.cos(timeMs * 0.23) * amplitude * 0.4,
    };
  };

  Game.prototype.update = function update(_dtMs, nowTimeMs) {
    this.animationTimeMs = nowTimeMs || 0;

    if (this.moveAnimation && this.moveAnimation.duration > 0) {
      if (this.animationTimeMs - this.moveAnimation.startAt > this.moveAnimation.duration) {
        this.moveAnimation = null;
      }
    }
  };

  Game.prototype.getCurrentTheme = function getCurrentTheme() {
    if (!this.currentLevel) {
      return THEMES[0];
    }

    var index = clamp(this.currentLevel.theme, 0, THEMES.length - 1);
    var base = THEMES[index];

    if (!this.settings.highContrast) {
      return base;
    }

    return {
      name: base.name + " HC",
      background: "#101010",
      floorA: "#1a1a1a",
      floorB: "#232323",
      wall: "#f2f2f2",
      mortar: "#000000",
      obstacle: "#ffd400",
      obstacleAccent: "#171717",
      snakeHead: "#00ffaa",
      snakeBody: "#00d1ff",
      snakeBodyAlt: "#33b8ff",
      snakeTail: "#0097c9",
      eyeWhite: "#ffffff",
      eyePupil: "#000000",
      exitCore: "#fff200",
      exitGlow: "#ff8a00",
      itemCore: "#fff200",
      itemGlow: "#ff56b5",
      itemBigCore: "#ff9a00",
      itemBigGlow: "#ff4f4f",
      itemStarCore: "#ffffff",
      itemStarGlow: "#00d1ff",
      portalA: "#00f3ff",
      portalB: "#ff57d0",
      overlay: "rgba(0, 0, 0, 0.82)",
      text: "#ffffff",
      hud: "#ffffff",
    };
  };

  Game.prototype.getLevelLabel = function getLevelLabel() {
    if (!this.currentLevel) {
      return "-";
    }
    return this.currentLevel.id + " / " + this.levels.length;
  };

  Game.prototype.getBestMoveForCurrentLevel = function getBestMoveForCurrentLevel() {
    if (!this.currentLevel) {
      return 0;
    }
    return this.bestMoves[this.currentLevel.id] || 0;
  };

  Game.prototype.getStateLabel = function getStateLabel() {
    var isEn = this.settings.language === "en";
    if (this.state === GAME_STATE.TITLE) {
      return isEn ? "Title" : "타이틀";
    }
    if (this.state === GAME_STATE.LEVEL_SELECT) {
      return isEn ? "Level Select" : "레벨 선택";
    }
    if (this.state === GAME_STATE.PLAYING) {
      return isEn ? "Playing" : "플레이 중";
    }
    if (this.state === GAME_STATE.PAUSED) {
      return isEn ? "Paused" : "일시정지";
    }
    if (this.state === GAME_STATE.LEVEL_COMPLETE) {
      return isEn ? "Level Clear" : "레벨 클리어";
    }
    if (this.state === GAME_STATE.GAME_COMPLETE) {
      return isEn ? "Game Complete" : "게임 완료";
    }
    return "";
  };

  Game.prototype.getStateOverlayData = function getStateOverlayData() {
    var levelName = this.currentLevel ? this.currentLevel.title : "";
    var best = this.getBestMoveForCurrentLevel();
    var lang = this.settings.language === "en" ? "en" : "ko";
    var i18n = global.WormGameI18N || {};
    var dict = i18n[lang] || i18n.ko || {};
    function ot(key, fallback) { return dict[key] || fallback || key; }

    if (this.state === GAME_STATE.TITLE) {
      return {
        title: "Mushroom Worm Quest",
        subtitle: ot("overlayTitleSub", "젤리를 모아 지렁이 친구를 출구로 안내하세요"),
        detail: ot("overlayTitleDetail", "Enter: 시작 | L: 레벨 선택 | Z: Undo"),
        extra: ot("overlayTitleExtra", "젤리 +1, 슈퍼젤리 +2, 스타: 통과"),
      };
    }

    if (this.state === GAME_STATE.LEVEL_SELECT) {
      return {
        title: ot("overlaySelectTitle", "레벨 선택"),
        subtitle: ot("overlaySelectSub", "해금된 레벨만 선택할 수 있습니다"),
        detail: ot("overlaySelectDetail", "원하는 스테이지 버튼을 누르면 바로 시작"),
        extra: ot("overlaySelectExtra", "현재 해금: ") + (this.unlockedLevelIndex + 1) + ot("overlaySelectUnit", " 단계"),
      };
    }

    if (this.state === GAME_STATE.PAUSED) {
      return {
        title: ot("overlayPausedTitle", "일시정지"),
        subtitle: levelName,
        detail: ot("overlayPausedDetail", "P 또는 Enter: 재개"),
        extra: ot("overlayPausedExtra", "메뉴 버튼으로 재시작/타이틀 이동 가능"),
      };
    }

    if (this.state === GAME_STATE.LEVEL_COMPLETE) {
      var delta = best ? this.moveCount - best : 0;
      return {
        title: ot("overlayClearTitle", "레벨 클리어"),
        subtitle:
          ot("overlayClearMoves", "이동 ") + this.moveCount +
          ot("overlayClearBest", "회 | 베스트 ") + (best || this.moveCount) +
          ot("overlayClearJelly", "회 | 젤리 ") + this.levelCollectedItems + "/" + this.levelTotalItems,
        detail: delta <= 0
          ? ot("overlayClearNewBest", "베스트 동률/갱신!")
          : ot("overlayClearOverBest", "베스트 대비 +") + delta + ot("overlayClearOverUnit", "회"),
        extra: ot("overlayClearExtra", "N 또는 다음 레벨 버튼"),
      };
    }

    if (this.state === GAME_STATE.GAME_COMPLETE) {
      return {
        title: "ALL CLEAR",
        subtitle:
          ot("overlayCompleteTotal", "누적 이동 ") + this.totalMoveCount +
          ot("overlayCompleteJelly", "회 | 젤리 ") + this.totalItemsCollected +
          ot("overlayCompleteClears", "개 | 총 클리어 ") + this.progressClears +
          ot("overlayCompleteUnit", "회"),
        detail: ot("overlayCompleteDetail", "Enter: 처음부터 | 레벨 선택으로 재도전"),
        extra: ot("overlayCompleteExtra", "모든 레벨 완주를 달성했습니다"),
      };
    }

    return null;
  };

  Game.prototype.getDeadlockHintVisible = function getDeadlockHintVisible(timeMs) {
    return timeMs <= this.deadlockHintUntil;
  };

  Game.prototype.getReplayExport = function getReplayExport() {
    if (!this.replayLog) {
      return "";
    }

    return JSON.stringify(
      {
        levelId: this.replayLog.levelId,
        startedAt: this.replayLog.startedAt,
        moveCount: this.moveCount,
        collectedItems: this.levelCollectedItems,
        moves: this.replayLog.moves,
      },
      null,
      2
    );
  };

  Game.prototype.getReplayArchive = function getReplayArchive() {
    var levelId = this.currentLevel ? this.currentLevel.id : 0;
    return this.replayArchive[levelId] || null;
  };

  Game.prototype.getReplayDebugState = function getReplayDebugState(stepIndex) {
    var replay = this.getReplayArchive();
    if (!replay) {
      return null;
    }

    var steps = replay.moves;
    var capped = clamp(stepIndex || 0, 0, steps.length);
    var segments = replay.startSegments.map(function copySegment(seg) {
      return { x: seg.x, y: seg.y };
    });
    var tiles = replay.startTiles.map(function copyRow(row) {
      return row.slice();
    });
    var starMoves = 0;

    function findPortalDestination(x, y) {
      var source = tiles[y][x];
      var targetTile = source === TILE.PORTAL_A ? TILE.PORTAL_B : TILE.PORTAL_A;
      for (var py = 0; py < GRID_ROWS; py += 1) {
        for (var px = 0; px < GRID_COLS; px += 1) {
          if (tiles[py][px] === targetTile) {
            return { x: px, y: py };
          }
        }
      }
      return null;
    }

    for (var i = 0; i < capped; i += 1) {
      var directionName = steps[i].direction;
      var direction = DIRECTIONS[directionName];
      if (!direction) {
        continue;
      }
      var head = segments[0];
      var nx = head.x + direction.x;
      var ny = head.y + direction.y;
      if (!this.isInsideBoard(nx, ny)) {
        continue;
      }
      var nextTile = tiles[ny][nx];
      if (nextTile === TILE.WALL) {
        continue;
      }
      if (nextTile === TILE.OBSTACLE && starMoves <= 0) {
        continue;
      }
      var tail = segments[segments.length - 1];

      segments.unshift({ x: nx, y: ny });
      segments.pop();

      var growth = 0;
      var activatedStar = false;
      if (nextTile === TILE.ITEM) {
        tiles[ny][nx] = TILE.EMPTY;
        growth = 1;
      } else if (nextTile === TILE.BIG_ITEM) {
        tiles[ny][nx] = TILE.EMPTY;
        growth = 2;
      } else if (nextTile === TILE.STAR_ITEM) {
        tiles[ny][nx] = TILE.EMPTY;
        starMoves = GAMEPLAY.STAR_POWER_MOVES;
        activatedStar = true;
      }

      for (var g = 0; g < growth; g += 1) {
        segments.push({ x: tail.x, y: tail.y });
      }

      if (nextTile === TILE.PORTAL_A || nextTile === TILE.PORTAL_B) {
        var destination = findPortalDestination(nx, ny);
        if (destination) {
          segments[0].x = destination.x;
          segments[0].y = destination.y;
        }
      }

      if (starMoves > 0 && !activatedStar) {
        starMoves -= 1;
      }
    }

    var direction = capped > 0 ? steps[capped - 1].direction : null;

    return {
      totalSteps: steps.length,
      step: capped,
      direction: direction,
      starMoves: starMoves,
      segments: segments,
    };
  };

  Game.prototype.getCurrentSnakeLength = function getCurrentSnakeLength() {
    if (!this.snake) {
      return 0;
    }
    return this.snake.segments.length;
  };

  Game.prototype.getPowerState = function getPowerState() {
    return {
      starMoves: this.starMovesRemaining,
    };
  };

  Game.prototype.getCurrentCharacter = function getCurrentCharacter() {
    if (!this.currentLevel) {
      return null;
    }
    return this.currentLevel.character || null;
  };

  Game.prototype.getItemProgress = function getItemProgress() {
    return {
      collected: this.levelCollectedItems,
      total: this.levelTotalItems,
    };
  };

  Game.prototype.getValidMoveDirections = function getValidMoveDirections() {
    if (!this.snake || this.state !== GAME_STATE.PLAYING) {
      return [];
    }

    var result = [];
    var names = Object.keys(DIRECTIONS);
    for (var i = 0; i < names.length; i += 1) {
      var dir = names[i];
      var next = this.getMoveCandidate(dir);
      if (next && this.canMoveTo(next.x, next.y)) {
        result.push(dir);
      }
    }
    return result;
  };

  Game.prototype.getCurrentLevelMetrics = function getCurrentLevelMetrics() {
    if (!this.currentLevel || !this.currentLevel.metrics) {
      return null;
    }
    return this.currentLevel.metrics;
  };

  Game.prototype.getLevelSelectItems = function getLevelSelectItems() {
    var items = [];

    for (var i = 0; i < this.levels.length; i += 1) {
      var level = this.levels[i];
      items.push({
        index: i,
        id: level.id,
        world: level.world || Math.ceil(level.id / 10),
        stage: level.stage || ((level.id - 1) % 10) + 1,
        title: level.title,
        locked: i > this.unlockedLevelIndex,
        bestMoves: this.bestMoves[level.id] || 0,
        current: i === this.levelIndex,
        difficulty: level.metrics ? level.metrics.score : 1,
        character: level.character || null,
        map: level.tiles,
      });
    }

    return items;
  };

  Game.prototype.getPerfSnapshot = function getPerfSnapshot() {
    return {
      lastInputLatencyMs: this.lastInputLatencyMs,
      historySize: this.history.length,
      discardedHistoryCount: this.discardedHistoryCount,
    };
  };

  global.WormPuzzleGame = Game;
})(window);
