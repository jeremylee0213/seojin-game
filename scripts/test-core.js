#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");
const FILES = [
  "js/constants.js",
  "js/levels.js",
  "js/snake.js",
  "js/game.js",
];

function loadRuntime(storageSeed) {
  const storage = { ...storageSeed };

  const sandbox = {
    window: {},
    localStorage: {
      getItem(key) {
        return Object.prototype.hasOwnProperty.call(storage, key) ? storage[key] : null;
      },
      setItem(key, value) {
        storage[key] = String(value);
      },
      removeItem(key) {
        delete storage[key];
      },
    },
    navigator: { vibrate() {} },
    performance: { now: () => Date.now() },
  };
  sandbox.window = sandbox;

  for (const file of FILES) {
    const code = fs.readFileSync(path.join(ROOT, file), "utf8");
    vm.runInNewContext(code, sandbox, { filename: file });
  }

  return { sandbox, storage };
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function pointKey(x, y) {
  return `${x},${y}`;
}

function isWalkableTile(tile, TILE) {
  return tile !== TILE.WALL && tile !== TILE.OBSTACLE;
}

function findPathToTargets(level, constants, targets) {
  const TILE = constants.TILE;
  const dirs = [
    { name: "up", x: 0, y: -1 },
    { name: "down", x: 0, y: 1 },
    { name: "left", x: -1, y: 0 },
    { name: "right", x: 1, y: 0 },
  ];

  const queue = [{ x: level.spawn.x, y: level.spawn.y }];
  const prev = new Map();
  const seen = new Set([pointKey(level.spawn.x, level.spawn.y)]);
  let found = null;

  while (queue.length > 0) {
    const node = queue.shift();
    const tile = level.tiles[node.y][node.x];
    if (targets.has(tile) && !(node.x === level.spawn.x && node.y === level.spawn.y)) {
      found = node;
      break;
    }

    for (const d of dirs) {
      const nx = node.x + d.x;
      const ny = node.y + d.y;
      if (nx < 0 || ny < 0 || nx >= constants.GRID_COLS || ny >= constants.GRID_ROWS) {
        continue;
      }
      const nextTile = level.tiles[ny][nx];
      if (!isWalkableTile(nextTile, TILE)) {
        continue;
      }
      const key = pointKey(nx, ny);
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      prev.set(key, { from: pointKey(node.x, node.y), dir: d.name });
      queue.push({ x: nx, y: ny });
    }
  }

  if (!found) {
    return null;
  }

  const moves = [];
  let cursor = pointKey(found.x, found.y);
  while (cursor !== pointKey(level.spawn.x, level.spawn.y)) {
    const step = prev.get(cursor);
    if (!step) {
      return null;
    }
    moves.push(step.dir);
    cursor = step.from;
  }
  moves.reverse();

  return {
    moves,
    target: { x: found.x, y: found.y, tile: level.tiles[found.y][found.x] },
  };
}

function runMoves(game, moves) {
  for (const dir of moves) {
    game.update(0, game.animationTimeMs + 220);
    const moved = game.tryMove(dir, Date.now());
    assert(moved, `move ${dir} should be valid`);
  }
}

function testStateTransition() {
  const { sandbox } = loadRuntime({});
  const game = new sandbox.WormPuzzleGame();
  game.loadLevel(0);

  assert(game.state === "title", "initial state must be title");
  game.startGame(false);
  assert(game.state === "playing", "startGame should move to playing");

  game.togglePause();
  assert(game.state === "paused", "togglePause should move to paused");

  game.togglePause();
  assert(game.state === "playing", "togglePause should return to playing");
}

function testUndoDelta() {
  const { sandbox } = loadRuntime({});
  const game = new sandbox.WormPuzzleGame();
  game.loadLevel(0);
  game.startGame(true);

  const before = game.snake.cloneSegments();
  const moved = game.tryMove("right", Date.now());
  assert(moved, "first move should be valid");

  const after = game.snake.cloneSegments();
  assert(before[0].x !== after[0].x || before[0].y !== after[0].y, "head must move");

  const undone = game.undo();
  assert(undone, "undo should succeed");

  const restored = game.snake.cloneSegments();
  assert(
    JSON.stringify(restored) === JSON.stringify(before),
    "undo should restore exact previous segments"
  );
}

function testStorageMigration() {
  const key = "wormPuzzleProgressLevel";
  const { sandbox } = loadRuntime({ [key]: "4" });
  const game = new sandbox.WormPuzzleGame();
  assert(game.unlockedLevelIndex === 4, "legacy progress should migrate into unlocked level");
}

function testKeyBindingChange() {
  const { sandbox } = loadRuntime({});
  const game = new sandbox.WormPuzzleGame();
  game.setBindingToken("undo", "u");
  const action = game.getActionFromKey("u");
  assert(action === "undo", "custom binding should map to action");
}

function testItemGrowthAndUndo() {
  const { sandbox } = loadRuntime({});
  const game = new sandbox.WormPuzzleGame();
  const TILE = sandbox.WormGameConstants.TILE;

  game.loadLevel(0);
  game.startGame(true);

  const pathResult = findPathToTargets(
    game.currentLevel,
    sandbox.WormGameConstants,
    new Set([TILE.ITEM, TILE.BIG_ITEM])
  );
  assert(pathResult, "a reachable growth item must exist");

  const initialLength = game.getCurrentSnakeLength();
  const expectedGrowth = pathResult.target.tile === TILE.BIG_ITEM ? 2 : 1;
  runMoves(game, pathResult.moves);

  const afterLength = game.getCurrentSnakeLength();
  const itemProgress = game.getItemProgress();
  assert(
    afterLength === initialLength + expectedGrowth,
    "eating growth item should increase snake length by expected amount"
  );
  assert(itemProgress.collected >= 1, "item progress should increase after collection");

  // Growth move creates a temporary segment length mismatch in animation.
  // Rendering state query must remain stable and never throw.
  const renderSnake = game.getRenderSnake(game.animationTimeMs + 30);
  assert(renderSnake && renderSnake.segments.length >= afterLength, "render snake should be available after growth");

  const undone = game.undo();
  assert(undone, "undo after item collection should succeed");
  assert(
    game.getCurrentSnakeLength() === initialLength,
    "undo should restore snake length before item collection"
  );
  assert(
    game.getTile(pathResult.target.x, pathResult.target.y) === pathResult.target.tile,
    "undo should restore consumed item tile"
  );
}

function testStarAndPortal() {
  const { sandbox } = loadRuntime({});
  const C = sandbox.WormGameConstants;
  const TILE = C.TILE;
  const game = new sandbox.WormPuzzleGame();

  // World 4 Stage 1 should include star items from generator rules.
  game.loadLevel(30);
  game.setState("playing");

  const starPath = findPathToTargets(game.currentLevel, C, new Set([TILE.STAR_ITEM]));
  assert(starPath, "a reachable star item must exist");
  runMoves(game, starPath.moves);

  const powers = game.getPowerState();
  assert(powers.starMoves > 0, "collecting a star item should activate star power");

  // World 3 Stage 2 should include a portal pair from generator rules.
  game.loadLevel(21);
  game.setState("playing");

  const portalPath = findPathToTargets(game.currentLevel, C, new Set([TILE.PORTAL_A]));
  assert(portalPath, "a reachable portal must exist");

  const portalOrigin = { x: portalPath.target.x, y: portalPath.target.y };
  runMoves(game, portalPath.moves);
  const head = game.snake.getHead();

  assert(
    !(head.x === portalOrigin.x && head.y === portalOrigin.y),
    "entering portal should move head to linked portal"
  );
}

// ── Snake unit tests ──

function testSnakeBasics() {
  const { sandbox } = loadRuntime({});
  const C = sandbox.WormGameConstants;
  const Snake = sandbox.WormGameSnake;

  // Build a simple walkable 5x5 floor
  const tiles = [];
  for (let y = 0; y < C.GRID_ROWS; y++) {
    const row = [];
    for (let x = 0; x < C.GRID_COLS; x++) {
      row.push(C.TILE.EMPTY);
    }
    tiles.push(row);
  }

  const snake = new Snake({ x: 5, y: 5 }, 3, tiles);
  assert(snake.segments.length === 3, "snake should have 3 segments");
  assert(snake.getHead().x === 5 && snake.getHead().y === 5, "head at spawn");

  // occupies
  assert(snake.occupies(5, 5, false), "occupies head");
  assert(!snake.occupies(0, 0, false), "does not occupy random tile");

  // snapshot round-trip
  const snap = snake.getSnapshot();
  snake.move("right");
  assert(snake.getHead().x === 6, "head moved right");
  snake.restoreSnapshot(snap);
  assert(snake.getHead().x === 5, "snapshot restored head");

  // growByTailPosition
  const lenBefore = snake.segments.length;
  snake.growByTailPosition(null);
  assert(snake.segments.length === lenBefore + 1, "grow adds one segment");
}

// ── handleItemCollection sub-method test ──

function testHandleItemCollectionDirect() {
  const { sandbox } = loadRuntime({});
  const C = sandbox.WormGameConstants;
  const TILE = C.TILE;
  const game = new sandbox.WormPuzzleGame();

  game.loadLevel(0);
  game.setState("playing");

  // Place a jelly manually at a known walkable spot
  const head = game.snake.getHead();
  const testX = head.x + 1;
  const testY = head.y;
  game.currentLevel.tiles[testY][testX] = TILE.ITEM;
  game.levelTotalItems = game.countItemsInCurrentLevel();

  const tail = game.snake.segments[game.snake.segments.length - 1];
  const delta = {
    growth: 0,
    consumedItem: null,
    totalItemsBefore: game.totalItemsCollected,
    levelItemsBefore: game.levelCollectedItems,
  };

  const result = game.handleItemCollection(
    { x: testX, y: testY }, TILE.ITEM, { x: tail.x, y: tail.y }, delta
  );

  assert(result.growth === 1, "jelly gives growth=1");
  assert(result.collectedType === "jelly", "type should be jelly");
  assert(!result.activatedStar, "no star activation");
  assert(delta.growth === 1, "delta.growth updated");
  assert(game.currentLevel.tiles[testY][testX] === TILE.EMPTY, "tile cleared after collection");
}

// ── tickStarPower sub-method test ──

function testTickStarPower() {
  const { sandbox } = loadRuntime({});
  const game = new sandbox.WormPuzzleGame();
  game.loadLevel(0);
  game.setState("playing");

  // Simulate star activation
  game.starMovesRemaining = 3;

  // justActivated = true → should not decrement
  game.tickStarPower(true);
  assert(game.starMovesRemaining === 3, "star not decremented on activation turn");

  // justActivated = false → should decrement
  game.tickStarPower(false);
  assert(game.starMovesRemaining === 2, "star decremented by 1");

  game.tickStarPower(false);
  assert(game.starMovesRemaining === 1, "star decremented to 1");

  // Drain events before checking power_end
  game.drainEvents();
  game.tickStarPower(false);
  assert(game.starMovesRemaining === 0, "star expired");

  const events = game.drainEvents();
  const powerEnd = events.find(e => e.type === "power_end");
  assert(powerEnd, "power_end event should be emitted");
}

// ── checkPostMoveState sub-method test ──

function testCheckPostMoveState() {
  const { sandbox } = loadRuntime({});
  const C = sandbox.WormGameConstants;
  const game = new sandbox.WormPuzzleGame();
  game.loadLevel(0);
  game.setState("playing");

  // Place head on exit to trigger level clear
  const exitPos = findTilePosition(game.currentLevel.tiles, C.TILE.EXIT, C);
  if (exitPos) {
    game.snake.segments[0].x = exitPos.x;
    game.snake.segments[0].y = exitPos.y;
    game.drainEvents(); // clear any existing events
    game.checkPostMoveState();
    const events = game.drainEvents();
    const hasClear = events.some(e => e.type === "level_clear" || e.type === "game_complete");
    assert(hasClear, "checkPostMoveState should trigger level_clear when on exit");
  }
}

function findTilePosition(tiles, tileType, constants) {
  for (let y = 0; y < constants.GRID_ROWS; y++) {
    for (let x = 0; x < constants.GRID_COLS; x++) {
      if (tiles[y][x] === tileType) {
        return { x, y };
      }
    }
  }
  return null;
}

// ── Portal undo round-trip test ──

function testPortalUndoRoundTrip() {
  const { sandbox } = loadRuntime({});
  const C = sandbox.WormGameConstants;
  const TILE = C.TILE;
  const game = new sandbox.WormPuzzleGame();

  // Find a level with portals
  game.loadLevel(21);
  game.setState("playing");

  const portalPath = findPathToTargets(game.currentLevel, C, new Set([TILE.PORTAL_A]));
  if (!portalPath) {
    // If level 21 has no portal, try a few others
    for (let lvl = 20; lvl < 40; lvl++) {
      game.loadLevel(lvl);
      game.setState("playing");
      const pp = findPathToTargets(game.currentLevel, C, new Set([TILE.PORTAL_A]));
      if (pp) {
        // Found one; run the test on this level
        const segBefore = game.snake.cloneSegments();

        // Move to just before the portal (all but last move)
        if (pp.moves.length > 1) {
          runMoves(game, pp.moves.slice(0, -1));
        }

        const segBeforePortal = game.snake.cloneSegments();
        const lastDir = pp.moves[pp.moves.length - 1];
        game.update(0, game.animationTimeMs + 220);
        game.tryMove(lastDir, Date.now());

        // After portal, head should differ from portal entrance
        const headAfter = game.snake.getHead();
        assert(
          !(headAfter.x === pp.target.x && headAfter.y === pp.target.y),
          "portal should warp head"
        );

        // Undo should restore to pre-portal state
        game.undo();
        const segAfterUndo = game.snake.cloneSegments();
        assert(
          JSON.stringify(segAfterUndo) === JSON.stringify(segBeforePortal),
          "undo after portal should restore pre-portal segments"
        );
        return;
      }
    }
    // Skip if no portal level found
    console.log("  (portal undo test skipped — no portal level found)");
    return;
  }

  // Run moves to portal
  const segBefore = game.snake.cloneSegments();
  if (portalPath.moves.length > 1) {
    runMoves(game, portalPath.moves.slice(0, -1));
  }
  const segBeforePortal = game.snake.cloneSegments();
  const lastDir = portalPath.moves[portalPath.moves.length - 1];
  game.update(0, game.animationTimeMs + 220);
  game.tryMove(lastDir, Date.now());

  game.undo();
  const segAfterUndo = game.snake.cloneSegments();
  assert(
    JSON.stringify(segAfterUndo) === JSON.stringify(segBeforePortal),
    "undo after portal warp restores exact pre-portal segments"
  );
}

// ── handleAction dispatch test ──

function testHandleActionDispatch() {
  const { sandbox } = loadRuntime({});
  const game = new sandbox.WormPuzzleGame();
  game.loadLevel(0);
  game.startGame(true);

  const C = sandbox.WormGameConstants;
  const moved = game.handleAction(C.ACTION.MOVE_RIGHT, { inputAtMs: Date.now() });
  assert(moved, "handleAction MOVE_RIGHT should succeed");
  assert(game.moveCount === 1, "moveCount should be 1 after one move");

  const undone = game.handleAction(C.ACTION.UNDO, {});
  assert(undone, "handleAction UNDO should succeed");
  assert(game.moveCount === 0, "moveCount should be 0 after undo");
}

// ── Multiple undo test ──

function testMultipleUndo() {
  const { sandbox } = loadRuntime({});
  const game = new sandbox.WormPuzzleGame();
  game.loadLevel(0);
  game.startGame(true);

  const initial = game.snake.cloneSegments();

  // Make 5 moves
  const directions = ["right", "right", "down", "down", "right"];
  let madeCount = 0;
  for (const dir of directions) {
    game.update(0, game.animationTimeMs + 220);
    if (game.tryMove(dir, Date.now())) {
      madeCount++;
    }
  }

  assert(madeCount >= 3, "at least 3 moves should succeed");

  // Undo all moves
  for (let i = 0; i < madeCount; i++) {
    const undone = game.undo();
    assert(undone, `undo #${i + 1} should succeed`);
  }

  assert(game.moveCount === 0, "moveCount should be 0 after full undo");
  const restored = game.snake.cloneSegments();
  assert(
    JSON.stringify(restored) === JSON.stringify(initial),
    "full undo should restore exact initial state"
  );
}

// ── Event queue test ──

function testEventQueue() {
  const { sandbox } = loadRuntime({});
  const game = new sandbox.WormPuzzleGame();

  game.emit("test_event", { foo: 1 });
  game.emit("test_event2", null);

  const events = game.drainEvents();
  assert(events.length === 2, "should have 2 events");
  assert(events[0].type === "test_event", "first event type");
  assert(events[0].payload.foo === 1, "first event payload");
  assert(events[1].type === "test_event2", "second event type");

  // Drain again should be empty
  const empty = game.drainEvents();
  assert(empty.length === 0, "second drain should be empty");
}

// ── Blocked move feedback test ──

function testBlockedMoveFeedback() {
  const { sandbox } = loadRuntime({});
  const C = sandbox.WormGameConstants;
  const game = new sandbox.WormPuzzleGame();
  game.loadLevel(0);
  game.startGame(true);

  // Try to move into a wall
  const head = game.snake.getHead();
  // Find a direction that is blocked
  const dirs = ["up", "down", "left", "right"];
  let blocked = false;
  for (const dir of dirs) {
    const d = C.DIRECTIONS[dir];
    const nx = head.x + d.x;
    const ny = head.y + d.y;
    const tile = game.getTile(nx, ny);
    if (tile === C.TILE.WALL || tile === C.TILE.OBSTACLE) {
      game.update(0, game.animationTimeMs + 220);
      const result = game.tryMove(dir, Date.now());
      assert(!result, "move into wall should fail");
      assert(game.feedback !== null, "feedback should be set for blocked move");
      assert(game.feedback.type === "blocked", "feedback type should be blocked");
      blocked = true;
      break;
    }
  }

  if (!blocked) {
    console.log("  (blocked move test skipped — no adjacent wall)");
  }
}

// ── Settings merge test ──

function testSettingsMerge() {
  const { sandbox } = loadRuntime({});
  const game = new sandbox.WormPuzzleGame();

  // Default language is ko
  assert(game.settings.language === "ko", "default language should be ko");

  game.updateSettings({ language: "en" });
  assert(game.settings.language === "en", "language should update to en");

  // Invalid language should default to ko
  game.updateSettings({ language: "fr" });
  assert(game.settings.language === "ko", "invalid language should default to ko");

  // Volume clamping
  game.updateSettings({ masterVolume: 1.5 });
  assert(game.settings.masterVolume === 1, "volume should be clamped to 1");
  game.updateSettings({ masterVolume: -0.5 });
  assert(game.settings.masterVolume === 0, "volume should be clamped to 0");
}

// ── Level select items test ──

function testLevelSelectItems() {
  const { sandbox } = loadRuntime({});
  const game = new sandbox.WormPuzzleGame();

  const items = game.getLevelSelectItems();
  assert(items.length === game.levels.length, "should return all levels");
  assert(items[0].locked === false, "first level should be unlocked");
  assert(items[0].index === 0, "first item index should be 0");
  if (items.length > 1) {
    assert(items[1].locked === true, "second level should be locked initially");
  }
}

// ── Restart level test ──

function testRestartLevel() {
  const { sandbox } = loadRuntime({});
  const game = new sandbox.WormPuzzleGame();
  game.loadLevel(0);
  game.startGame(true);

  // Make some moves
  game.update(0, game.animationTimeMs + 220);
  game.tryMove("right", Date.now());
  assert(game.moveCount === 1, "should have 1 move before restart");

  game.restartLevel();
  assert(game.moveCount === 0, "moveCount should reset after restart");
  assert(game.history.length === 0, "history should be empty after restart");
}

// ── Runner ──

let passed = 0;
let failed = 0;
const tests = [
  ["State Transition", testStateTransition],
  ["Undo Delta", testUndoDelta],
  ["Storage Migration", testStorageMigration],
  ["Key Binding Change", testKeyBindingChange],
  ["Item Growth & Undo", testItemGrowthAndUndo],
  ["Star & Portal", testStarAndPortal],
  ["Snake Basics", testSnakeBasics],
  ["handleItemCollection Direct", testHandleItemCollectionDirect],
  ["tickStarPower", testTickStarPower],
  ["checkPostMoveState", testCheckPostMoveState],
  ["Portal Undo Round-Trip", testPortalUndoRoundTrip],
  ["handleAction Dispatch", testHandleActionDispatch],
  ["Multiple Undo", testMultipleUndo],
  ["Event Queue", testEventQueue],
  ["Blocked Move Feedback", testBlockedMoveFeedback],
  ["Settings Merge", testSettingsMerge],
  ["Level Select Items", testLevelSelectItems],
  ["Restart Level", testRestartLevel],
];

for (const [name, fn] of tests) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    console.error(`  ✗ ${name}: ${err.message}`);
  }
}

console.log(`\n${passed + failed} tests, ${passed} passed, ${failed} failed.`);
if (failed > 0) {
  process.exit(1);
}
