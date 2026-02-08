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
];

function loadRuntime() {
  const sandbox = {
    window: {},
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  };
  sandbox.window = sandbox;

  for (const file of FILES) {
    const code = fs.readFileSync(path.join(ROOT, file), "utf8");
    vm.runInNewContext(code, sandbox, { filename: file });
  }

  return sandbox;
}

function key(segments) {
  return segments.map((s) => `${s.x},${s.y}`).join("|");
}

function stateKey(segments, starMoves) {
  return `${key(segments)};${starMoves}`;
}

function findExit(level, C) {
  for (let y = 0; y < C.GRID_ROWS; y += 1) {
    for (let x = 0; x < C.GRID_COLS; x += 1) {
      if (level.tiles[y][x] === C.TILE.EXIT) {
        return { x, y };
      }
    }
  }
  return null;
}

function isWalkable(level, C, x, y) {
  if (x < 0 || y < 0 || x >= C.GRID_COLS || y >= C.GRID_ROWS) {
    return false;
  }
  const tile = level.tiles[y][x];
  return tile !== C.TILE.WALL && tile !== C.TILE.OBSTACLE;
}

function occupies(segments, x, y, ignoreTail) {
  const end = ignoreTail ? segments.length - 1 : segments.length;
  for (let i = 0; i < end; i += 1) {
    if (segments[i].x === x && segments[i].y === y) {
      return true;
    }
  }
  return false;
}

function solveLevel(level, C, Snake, maxStates = 350000) {
  const snake = new Snake(level.spawn, level.snakeLength, level.tiles);
  const start = snake.cloneSegments();
  const exit = findExit(level, C);
  const queue = [{ segments: start, steps: 0, starMoves: 0 }];
  const seen = new Set([stateKey(start, 0)]);
  let head = 0;
  const portalA = [];
  const portalB = [];

  for (let y = 0; y < C.GRID_ROWS; y += 1) {
    for (let x = 0; x < C.GRID_COLS; x += 1) {
      if (level.tiles[y][x] === C.TILE.PORTAL_A) {
        portalA.push({ x, y });
      } else if (level.tiles[y][x] === C.TILE.PORTAL_B) {
        portalB.push({ x, y });
      }
    }
  }

  const directionNames = ["up", "down", "left", "right"];

  while (head < queue.length) {
    const node = queue[head++];
    const headPos = node.segments[0];
    if (headPos.x === exit.x && headPos.y === exit.y) {
      return { solved: true, steps: node.steps, explored: seen.size };
    }

    if (seen.size > maxStates) {
      return { solved: false, timeout: true, explored: seen.size };
    }

    for (const directionName of directionNames) {
      const d = C.DIRECTIONS[directionName];
      const nx = headPos.x + d.x;
      const ny = headPos.y + d.y;
      const tile = level.tiles[ny] && level.tiles[ny][nx];
      if (tile === undefined || tile === C.TILE.WALL) {
        continue;
      }

      const starActive = node.starMoves > 0;
      if (tile === C.TILE.OBSTACLE && !starActive) {
        continue;
      }
      const nextSegments = [{ x: nx, y: ny }];
      for (let i = 0; i < node.segments.length - 1; i += 1) {
        nextSegments.push(node.segments[i]);
      }

      let nextStarMoves = node.starMoves;
      if (tile === C.TILE.STAR_ITEM) {
        nextStarMoves = C.GAMEPLAY.STAR_POWER_MOVES;
      } else if (nextStarMoves > 0) {
        nextStarMoves -= 1;
      }

      if (tile === C.TILE.PORTAL_A && portalB.length > 0) {
        const target = portalB[0];
        nextSegments[0] = { x: target.x, y: target.y };
      } else if (tile === C.TILE.PORTAL_B && portalA.length > 0) {
        const target = portalA[0];
        nextSegments[0] = { x: target.x, y: target.y };
      }

      const nextKey = stateKey(nextSegments, nextStarMoves);
      if (seen.has(nextKey)) {
        continue;
      }
      seen.add(nextKey);
      queue.push({ segments: nextSegments, steps: node.steps + 1, starMoves: nextStarMoves });
    }
  }

  return { solved: false, timeout: false, explored: seen.size };
}

function validateMap(level, C) {
  if (level.tiles.length !== C.GRID_ROWS) {
    throw new Error(`Level ${level.id}: invalid row count`);
  }
  for (let y = 0; y < C.GRID_ROWS; y += 1) {
    if (level.tiles[y].length !== C.GRID_COLS) {
      throw new Error(`Level ${level.id}: invalid col count at row ${y}`);
    }
  }
}

function run() {
  const runtime = loadRuntime();
  const C = runtime.WormGameConstants;
  const levels = runtime.WormGameLevels.LEVELS;
  const Snake = runtime.WormGameSnake;

  let failed = false;

  for (const level of levels) {
    validateMap(level, C);
    const result = solveLevel(level, C, Snake);
    if (!result.solved) {
      failed = true;
      console.error(
        `FAIL level ${level.id}: unsolved explored=${result.explored} timeout=${Boolean(
          result.timeout
        )}`
      );
      continue;
    }

    console.log(
      `OK level ${level.id}: solved in ${result.steps} moves (explored ${result.explored})`
    );
  }

  if (failed) {
    process.exit(1);
  }

  console.log(`Validation complete. ${levels.length} levels checked.`);
}

run();
