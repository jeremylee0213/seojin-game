/**
 * constants.js — 게임 상수 및 유틸리티
 *
 * @module  WormGameConstants
 * @depends (없음 — 의존성 없는 루트 모듈)
 * @exports global.WormGameConstants
 *
 * ES Module 전환 시: export { TILE, TILE_SIZE, ... }
 */
(function attachConstants(global) {
  "use strict";

  var TILE_SIZE = 40;
  var GRID_COLS = 20;
  var GRID_ROWS = 15;
  var CANVAS_WIDTH = GRID_COLS * TILE_SIZE;
  var CANVAS_HEIGHT = GRID_ROWS * TILE_SIZE;

  var TILE = Object.freeze({
    EMPTY: 0,
    WALL: 1,
    EXIT: 2,
    OBSTACLE: 3,
    SPAWN: 4,
    ITEM: 5,
    BIG_ITEM: 6,
    STAR_ITEM: 7,
    PORTAL_A: 8,
    PORTAL_B: 9,
  });

  var TILE_META = Object.freeze({
    0: Object.freeze({ id: TILE.EMPTY, walkable: true, name: "empty" }),
    1: Object.freeze({ id: TILE.WALL, walkable: false, name: "wall" }),
    2: Object.freeze({ id: TILE.EXIT, walkable: true, name: "exit" }),
    3: Object.freeze({ id: TILE.OBSTACLE, walkable: false, name: "obstacle" }),
    4: Object.freeze({ id: TILE.SPAWN, walkable: true, name: "spawn" }),
    5: Object.freeze({ id: TILE.ITEM, walkable: true, name: "item" }),
    6: Object.freeze({ id: TILE.BIG_ITEM, walkable: true, name: "big_item" }),
    7: Object.freeze({ id: TILE.STAR_ITEM, walkable: true, name: "star_item" }),
    8: Object.freeze({ id: TILE.PORTAL_A, walkable: true, name: "portal_a" }),
    9: Object.freeze({ id: TILE.PORTAL_B, walkable: true, name: "portal_b" }),
  });

  var GAME_STATE = Object.freeze({
    TITLE: "title",
    LEVEL_SELECT: "level_select",
    PLAYING: "playing",
    PAUSED: "paused",
    LEVEL_COMPLETE: "level_complete",
    GAME_COMPLETE: "game_complete",
  });

  var STATE_TRANSITIONS = Object.freeze({
    title: Object.freeze(["level_select", "playing"]),
    level_select: Object.freeze(["title", "playing"]),
    playing: Object.freeze(["paused", "level_complete", "game_complete", "title"]),
    paused: Object.freeze(["playing", "title", "level_select"]),
    level_complete: Object.freeze(["playing", "title", "level_select"]),
    game_complete: Object.freeze(["playing", "title", "level_select"]),
  });

  var DIRECTIONS = Object.freeze({
    up: Object.freeze({ x: 0, y: -1, name: "up" }),
    down: Object.freeze({ x: 0, y: 1, name: "down" }),
    left: Object.freeze({ x: -1, y: 0, name: "left" }),
    right: Object.freeze({ x: 1, y: 0, name: "right" }),
  });

  var ACTION = Object.freeze({
    MOVE_UP: "move_up",
    MOVE_DOWN: "move_down",
    MOVE_LEFT: "move_left",
    MOVE_RIGHT: "move_right",
    UNDO: "undo",
    RESTART: "restart",
    PAUSE: "pause",
    NEXT: "next",
    START: "start",
    LEVEL_SELECT: "level_select",
  });

  var ACTION_TO_DIRECTION = Object.freeze({
    move_up: "up",
    move_down: "down",
    move_left: "left",
    move_right: "right",
  });

  var DEFAULT_KEY_BINDINGS = Object.freeze({
    move_up: Object.freeze(["arrowup", "w"]),
    move_down: Object.freeze(["arrowdown", "s"]),
    move_left: Object.freeze(["arrowleft", "a"]),
    move_right: Object.freeze(["arrowright", "d"]),
    undo: Object.freeze(["z"]),
    restart: Object.freeze(["r"]),
    pause: Object.freeze(["p", "escape"]),
    next: Object.freeze(["n"]),
    start: Object.freeze(["enter", " "]),
    level_select: Object.freeze(["l"]),
  });

  var STORAGE_KEYS = Object.freeze({
    PROGRESS: "wormPuzzleProgress",
    PROGRESS_BACKUP: "wormPuzzleProgressBackup",
    SETTINGS: "wormPuzzleSettings",
    SETTINGS_BACKUP: "wormPuzzleSettingsBackup",
    LEGACY_PROGRESS_LEVEL: "wormPuzzleProgressLevel",
  });

  var STORAGE_VERSION = 3;

  var DEFAULT_SETTINGS = Object.freeze({
    soundEnabled: true,
    bgmEnabled: true,
    bgmTrack: "retro",
    vibrationEnabled: true,
    highContrast: false,
    colorBlindAssist: false,
    reduceMotion: false,
    handedness: "right",
    resetProgressOnNewGame: false,
    showPerfOverlay: false,
    showMoveHints: false,
    language: "ko",
    tutorialCompleted: false,
    mobilePerformanceMode: "auto",
    masterVolume: 0.8,
    sfxVolume: 0.8,
    dpadPosition: Object.freeze({ x: null, y: null }),
    replayDebugEnabled: false,
    customBindings: Object.freeze({
      move_up: "",
      move_down: "",
      move_left: "",
      move_right: "",
      undo: "",
      restart: "",
      pause: "",
      next: "",
      level_select: "",
    }),
  });

  var GAMEPLAY = Object.freeze({
    MOVE_ANIMATION_MS: 120,
    BLOCKED_FEEDBACK_MS: 260,
    DEADLOCK_HINT_MS: 2500,
    EXIT_POPUP_DELAY_MS: 250,
    INPUT_DEBOUNCE_MS: 80,
    HOLD_INITIAL_DELAY_MS: 180,
    HOLD_REPEAT_MS: 110,
    BLOCKED_TOAST_COOLDOWN_MS: 700,
    MOVE_HINT_FLASH_MS: 360,
    GAMEPAD_REPEAT_MS: 120,
    GAMEPAD_DEADZONE: 0.35,
    HISTORY_LIMIT: 300,
    MAX_DEVICE_PIXEL_RATIO: 2,
    SHAKE_AMPLITUDE: 8,
    SHAKE_DURATION_MS: 180,
    STAR_POWER_MOVES: 8,
    FRAME_STEP_MS: 1000 / 60,
    FRAME_STEP_CAP: 5,
  });

  var THEMES = Object.freeze([
    Object.freeze({
      name: "Mushroom Plains",
      background: "#67c6ff",
      floorA: "#c0edff",
      floorB: "#afdeff",
      wall: "#cf5142",
      mortar: "#f6d6cb",
      obstacle: "#1f4d9c",
      obstacleAccent: "#cfe4ff",
      snakeHead: "#ffdf4d",
      snakeBody: "#ffb530",
      snakeBodyAlt: "#ff9931",
      snakeTail: "#ef7d21",
      eyeWhite: "#ffffff",
      eyePupil: "#15264f",
      exitCore: "#9fffe3",
      exitGlow: "#31e399",
      itemCore: "#ffe96f",
      itemGlow: "#ff6798",
      overlay: "rgba(10, 26, 75, 0.64)",
      text: "#ffffff",
      hud: "#ffffff",
    }),
    Object.freeze({
      name: "Pipe Garden",
      background: "#68db8a",
      floorA: "#d7ffe1",
      floorB: "#c7f8d5",
      wall: "#2e9a44",
      mortar: "#effff3",
      obstacle: "#ea6a35",
      obstacleAccent: "#ffe6d5",
      snakeHead: "#ffd95a",
      snakeBody: "#ffbc45",
      snakeBodyAlt: "#ffa838",
      snakeTail: "#f18e2d",
      eyeWhite: "#ffffff",
      eyePupil: "#1a2c52",
      exitCore: "#fffab8",
      exitGlow: "#ffd53d",
      itemCore: "#fff06f",
      itemGlow: "#ff6db8",
      overlay: "rgba(9, 62, 37, 0.6)",
      text: "#ffffff",
      hud: "#ffffff",
    }),
    Object.freeze({
      name: "Brick Castle",
      background: "#7f87b5",
      floorA: "#d4d8ef",
      floorB: "#c3c8e3",
      wall: "#7a3f34",
      mortar: "#ddc6bf",
      obstacle: "#3b4159",
      obstacleAccent: "#cfd5eb",
      snakeHead: "#ffce4e",
      snakeBody: "#f5a83a",
      snakeBodyAlt: "#e48d2e",
      snakeTail: "#cf7726",
      eyeWhite: "#ffffff",
      eyePupil: "#1b2445",
      exitCore: "#c2ff9f",
      exitGlow: "#77e63c",
      itemCore: "#fff06a",
      itemGlow: "#ff6ec9",
      overlay: "rgba(32, 24, 47, 0.64)",
      text: "#ffffff",
      hud: "#ffffff",
    }),
    Object.freeze({
      name: "Coin Carnival",
      background: "#ffb05e",
      floorA: "#ffe3b5",
      floorB: "#ffd597",
      wall: "#d5592c",
      mortar: "#ffd7c1",
      obstacle: "#4754c9",
      obstacleAccent: "#dde3ff",
      snakeHead: "#fff058",
      snakeBody: "#ffca2f",
      snakeBodyAlt: "#ffb424",
      snakeTail: "#ef9b1e",
      eyeWhite: "#ffffff",
      eyePupil: "#132451",
      exitCore: "#c0ffe0",
      exitGlow: "#33e39a",
      itemCore: "#fff16a",
      itemGlow: "#ff67ba",
      overlay: "rgba(86, 36, 16, 0.58)",
      text: "#ffffff",
      hud: "#ffffff",
    }),
    Object.freeze({
      name: "Night Raceway",
      background: "#7a82ff",
      floorA: "#dbe0ff",
      floorB: "#c9d0ff",
      wall: "#3b4dbc",
      mortar: "#e9eeff",
      obstacle: "#ff6f54",
      obstacleAccent: "#ffe3dc",
      snakeHead: "#ffe44f",
      snakeBody: "#ffc436",
      snakeBodyAlt: "#ffac2f",
      snakeTail: "#f39027",
      eyeWhite: "#ffffff",
      eyePupil: "#182651",
      exitCore: "#afffe1",
      exitGlow: "#2ee2a0",
      itemCore: "#fff26f",
      itemGlow: "#ff70bf",
      overlay: "rgba(20, 30, 83, 0.62)",
      text: "#ffffff",
      hud: "#ffffff",
    }),
    Object.freeze({
      name: "Rainbow Star Road",
      background: "#ff79bf",
      floorA: "#ffe0f2",
      floorB: "#ffd2ea",
      wall: "#ed438d",
      mortar: "#ffeaf5",
      obstacle: "#2f79ff",
      obstacleAccent: "#dce8ff",
      snakeHead: "#ffe84d",
      snakeBody: "#ffc632",
      snakeBodyAlt: "#ffb023",
      snakeTail: "#f08f20",
      eyeWhite: "#ffffff",
      eyePupil: "#212453",
      exitCore: "#c9ff9d",
      exitGlow: "#7aef39",
      itemCore: "#fff26f",
      itemGlow: "#ff6ccc",
      overlay: "rgba(73, 11, 54, 0.63)",
      text: "#ffffff",
      hud: "#ffffff",
    }),
  ]);

  function isWalkableTile(tileType) {
    var meta = TILE_META[tileType];
    return !!(meta && meta.walkable);
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function normalizeKeyToken(rawKey) {
    if (!rawKey) {
      return "";
    }
    return rawKey.length === 1 ? rawKey.toLowerCase() : rawKey.toLowerCase();
  }

  function pointKey(x, y) {
    return x + "," + y;
  }

  global.WormGameConstants = Object.freeze({
    TILE_SIZE: TILE_SIZE,
    GRID_COLS: GRID_COLS,
    GRID_ROWS: GRID_ROWS,
    CANVAS_WIDTH: CANVAS_WIDTH,
    CANVAS_HEIGHT: CANVAS_HEIGHT,
    TILE: TILE,
    TILE_META: TILE_META,
    GAME_STATE: GAME_STATE,
    STATE_TRANSITIONS: STATE_TRANSITIONS,
    DIRECTIONS: DIRECTIONS,
    ACTION: ACTION,
    ACTION_TO_DIRECTION: ACTION_TO_DIRECTION,
    DEFAULT_KEY_BINDINGS: DEFAULT_KEY_BINDINGS,
    STORAGE_KEYS: STORAGE_KEYS,
    STORAGE_VERSION: STORAGE_VERSION,
    DEFAULT_SETTINGS: DEFAULT_SETTINGS,
    GAMEPLAY: GAMEPLAY,
    THEMES: THEMES,
    isWalkableTile: isWalkableTile,
    clamp: clamp,
    normalizeKeyToken: normalizeKeyToken,
    pointKey: pointKey,
  });
})(window);
