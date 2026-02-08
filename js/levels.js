/**
 * levels.js — 레벨 데이터 100개 + 월드 메타 정보
 *
 * @module  WormGameLevels
 * @depends WormGameConstants (TILE, GRID_COLS, GRID_ROWS)
 * @exports global.WormGameLevels  { LEVELS, TOTAL_LEVELS, WORLD_TITLES }
 *
 * ES Module 전환 시: import { TILE, GRID_COLS, GRID_ROWS } from './constants.js'
 */
(function attachLevels(global) {
  "use strict";

  var constants = global.WormGameConstants;
  var TILE = constants.TILE;
  var GRID_COLS = constants.GRID_COLS;
  var GRID_ROWS = constants.GRID_ROWS;

  var STAGE_TITLES = [
    "Warm-Up Lanes",
    "Bouncy S-Curves",
    "Branch Explorer",
    "Puzzle Rooms",
    "Tunnel Twists",
    "Crossroad Choice",
    "Spiral Surprise",
    "Long Adventure",
    "Dead-End Dodge",
    "World Challenge",
  ];

  var WORLD_TITLES = [
    "Sunny Start",
    "Candy Garden",
    "Warp Woods",
    "Star City",
    "Twisty Canyon",
    "Maze Factory",
    "Glow Castle",
    "Comet Road",
    "Trickster Land",
    "Grand Finale",
  ];

  var CHARACTER_MOODS = [
    "Brave",
    "Curious",
    "Cheerful",
    "Calm",
    "Quick",
    "Bold",
    "Focused",
    "Bright",
    "Smart",
    "Playful",
  ];

  var CHARACTER_PALETTES = [
    ["#ffda45", "#ffab2f", "#ff5a7f"],
    ["#66e07f", "#3bbf64", "#39a8ff"],
    ["#7cc2ff", "#3f91ff", "#ffd54c"],
    ["#ff9f5c", "#f4723c", "#5c7dff"],
    ["#be90ff", "#8b5ae2", "#7df29d"],
    ["#ff78ca", "#ea4ea9", "#69d5ff"],
  ];

  var BASE_STAGE_DEFS = [
    {
      snakeLength: 1,
      map: [
        "####################",
        "#S....I............#",
        "#..................#",
        "#..######..........#",
        "#..#....#..........#",
        "#..#....#..........#",
        "#..#....######.....#",
        "#..#...............#",
        "#..######..........#",
        "#..................#",
        "#..........######..#",
        "#..........#....#..#",
        "#..........#....#E.#",
        "#..................#",
        "####################",
      ],
    },
    {
      snakeLength: 2,
      map: [
        "####################",
        "#S.I..#####........#",
        "#.###.#...#.######.#",
        "#...#.#.#.#.#....#.#",
        "###.#.#.#.#.#.##.#.#",
        "#...#...#...#.#..#.#",
        "#.###########.#.##.#",
        "#...........#.#....#",
        "#.#########.#.######",
        "#.#.......#.#......#",
        "#.#.#####.#.######.#",
        "#.#.....#.#....#...#",
        "#.#####.#.####.#.E.#",
        "#.......#......#...#",
        "####################",
      ],
    },
    {
      snakeLength: 3,
      map: [
        "####################",
        "#S....I............#",
        "#.######.#########.#",
        "#.#....#.....#.....#",
        "#.#.##.#####.#.###.#",
        "#.#.#......#.#...#.#",
        "#...#.####.#.###.#.#",
        "###.#.#..#.#...#.#.#",
        "#...#.#..#.###.#.#.#",
        "#.###.##.#.....#.#.#",
        "#.....#..#######.#.#",
        "#.#####........#.#.#",
        "#.#.....######.#.#E#",
        "#...####......#....#",
        "####################",
      ],
    },
    {
      snakeLength: 4,
      map: [
        "####################",
        "#S....I........#...#",
        "#.###########..#.#.#",
        "#.#.........#..#.#.#",
        "#.#.#######.#..#.#.#",
        "#.#.#.....#.#..#.#.#",
        "#...#.XXX.#.#..#.#.#",
        "###.#.XXX.#.#..#.#.#",
        "#...#.XXX.#.#....#.#",
        "#.###.....#.######.#",
        "#...#######........#",
        "#.#########.######.#",
        "#.......#..........#",
        "#.#####.#.########E#",
        "####################",
      ],
    },
    {
      snakeLength: 4,
      map: [
        "####################",
        "#S..#....I.........#",
        "#..#.#.##########..#",
        "#..#.#...........#.#",
        "#.##.###########.#.#",
        "#....#.........#.#.#",
        "####.#.#######.#.#.#",
        "#....#.#.....#.#.#.#",
        "#.####.#.###.#.#.#.#",
        "#.#....#...#.#.#.#.#",
        "#.#.######.#.#.#.#.#",
        "#.#......#.#.#...#.#",
        "#.######.#.#.#####.#",
        "#........#.....E...#",
        "####################",
      ],
    },
    {
      snakeLength: 4,
      map: [
        "####################",
        "#S....I............#",
        "#.#########.######.#",
        "#.#.......#.#....#.#",
        "#.#.#####.#.#.##.#.#",
        "#.#.#...#.#.#.#..#.#",
        "#...#.#.#...#.#.##.#",
        "#####.#.#####.#....#",
        "#.....#.....#.#.####",
        "#.#########.#.#....#",
        "#.#.......#.#.##.#.#",
        "#.#.#####.#.#....#.#",
        "#.#.....#.#.######.#",
        "#.#####.#.#......E.#",
        "####################",
      ],
    },
    {
      snakeLength: 5,
      map: [
        "####################",
        "#S....I............#",
        "#.################.#",
        "#.#..............#.#",
        "#.#.############.#.#",
        "#.#.#..........#.#.#",
        "#.#.#.########.#.#.#",
        "#.#.#.#......#.#.#.#",
        "#.#.#.#.####.#.#.#.#",
        "#.#.#.#....#.#.#.#.#",
        "#.#.#.####.#.#.#.#.#",
        "#.#.#......#.#.#.#.#",
        "#.#.########.#.#.#.#",
        "#.................E#",
        "####################",
      ],
    },
    {
      snakeLength: 6,
      map: [
        "####################",
        "#S....#....I.......#",
        "#.##.#.#.#########.#",
        "#....#.#.......#...#",
        "#.####.#####.#.#.#.#",
        "#......#...#.#.#.#.#",
        "#.######.#.#.#.#.#.#",
        "#.#....#.#.#.#.#.#.#",
        "#.#.##.#.#.#.#.#.#.#",
        "#.#....#.#.#.#.#.#.#",
        "#.######.#.#.#.#.#.#",
        "#........#.#.#.#.#.#",
        "#.########.#.#.#.#.#",
        "#...............E..#",
        "####################",
      ],
    },
    {
      snakeLength: 5,
      map: [
        "####################",
        "#S...I...#.........#",
        "#.#####.#.#.#####..#",
        "#.#...#.#.#.#...#..#",
        "#.#.#.#.#.#.#.#.#..#",
        "#...#...#...#.#.#..#",
        "###.#########.#.#..#",
        "#...#.......#.#.#..#",
        "#.###.#####.#.#.#..#",
        "#.#...#...#.#.#.#..#",
        "#.#.###.#.#.#.#.#..#",
        "#.#.....#.#.#...#..#",
        "#.#######.#.#####..#",
        "#...............E..#",
        "####################",
      ],
    },
    {
      snakeLength: 7,
      map: [
        "####################",
        "#S....#....I.......#",
        "#.##.#.#.#########.#",
        "#....#.#.......#...#",
        "#.####.#####.#.#.#.#",
        "#......#...#.#.#.#.#",
        "#.######.#.#.#.#.#.#",
        "#.#....#.#.#.#.#.#.#",
        "#.#.##.#.#.#.#.#.#.#",
        "#.#....#.#.#.#.#.#.#",
        "#.######.#.#.#.#.#.#",
        "#........#.#.#.#.#.#",
        "#.########.#.#.#.#.#",
        "#...............E..#",
        "####################",
      ],
    },
  ];

  function createRng(seed) {
    var state = (seed >>> 0) || 1;
    return function rand() {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state / 4294967296;
    };
  }

  function pointKey(x, y) {
    return x + "," + y;
  }

  function cloneGrid(grid) {
    return grid.map(function cloneRow(row) {
      return row.slice();
    });
  }

  function toGrid(mapRows) {
    return mapRows.map(function mapRow(row) {
      return row.split("");
    });
  }

  function toRows(grid) {
    return grid.map(function joinRow(row) {
      return row.join("");
    });
  }

  function mirrorHorizontal(rows) {
    return rows.map(function reverseRow(row) {
      return row.split("").reverse().join("");
    });
  }

  function mirrorVertical(rows) {
    return rows.slice().reverse();
  }

  function rotate180(rows) {
    return mirrorVertical(mirrorHorizontal(rows));
  }

  function chooseTransform(world, stage) {
    void world;
    void stage;
    return "identity";
  }

  function transformMap(rows, mode) {
    if (mode === "hflip") {
      return mirrorHorizontal(rows);
    }
    if (mode === "vflip") {
      return mirrorVertical(rows);
    }
    if (mode === "rot180") {
      return rotate180(rows);
    }
    return rows.slice();
  }

  function isInside(x, y) {
    return x >= 0 && y >= 0 && x < GRID_COLS && y < GRID_ROWS;
  }

  function isInterior(x, y) {
    return x > 0 && y > 0 && x < GRID_COLS - 1 && y < GRID_ROWS - 1;
  }

  function isCharWalkable(char) {
    return char !== "#" && char !== "X";
  }

  function findChar(grid, target) {
    for (var y = 0; y < GRID_ROWS; y += 1) {
      for (var x = 0; x < GRID_COLS; x += 1) {
        if (grid[y][x] === target) {
          return { x: x, y: y };
        }
      }
    }
    return null;
  }

  function bfsPath(grid, start, goal) {
    if (!start || !goal) {
      return [];
    }

    var queue = [{ x: start.x, y: start.y }];
    var head = 0;
    var prev = {};
    var seen = {};
    seen[pointKey(start.x, start.y)] = true;

    var dirs = [
      { x: 1, y: 0 },
      { x: -1, y: 0 },
      { x: 0, y: 1 },
      { x: 0, y: -1 },
    ];

    while (head < queue.length) {
      var node = queue[head++];
      if (node.x === goal.x && node.y === goal.y) {
        var path = [];
        var cursorKey = pointKey(goal.x, goal.y);
        while (cursorKey) {
          var parts = cursorKey.split(",");
          path.push({ x: Number(parts[0]), y: Number(parts[1]) });
          cursorKey = prev[cursorKey] || "";
        }
        path.reverse();
        return path;
      }

      for (var i = 0; i < dirs.length; i += 1) {
        var nx = node.x + dirs[i].x;
        var ny = node.y + dirs[i].y;
        if (!isInside(nx, ny)) {
          continue;
        }
        if (!isCharWalkable(grid[ny][nx])) {
          continue;
        }

        var key = pointKey(nx, ny);
        if (seen[key]) {
          continue;
        }
        seen[key] = true;
        prev[key] = pointKey(node.x, node.y);
        queue.push({ x: nx, y: ny });
      }
    }

    return [];
  }

  function buildKeySet(points) {
    var set = {};
    for (var i = 0; i < points.length; i += 1) {
      set[pointKey(points[i].x, points[i].y)] = true;
    }
    return set;
  }

  function collectCells(grid, predicate) {
    var result = [];
    for (var y = 0; y < GRID_ROWS; y += 1) {
      for (var x = 0; x < GRID_COLS; x += 1) {
        if (predicate(grid[y][x], x, y)) {
          result.push({ x: x, y: y });
        }
      }
    }
    return result;
  }

  function shuffleInPlace(items, rand) {
    for (var i = items.length - 1; i > 0; i -= 1) {
      var j = Math.floor(rand() * (i + 1));
      var temp = items[i];
      items[i] = items[j];
      items[j] = temp;
    }
    return items;
  }

  function manhattan(a, b) {
    return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  }

  function carveBranches(grid, safePath, world, stage, rand) {
    var dirs = [
      { x: 1, y: 0 },
      { x: -1, y: 0 },
      { x: 0, y: 1 },
      { x: 0, y: -1 },
    ];

    var branchCount = 1 + Math.floor(world / 2) + Math.floor(stage / 4);
    if (world >= 7) {
      branchCount += 2;
    }
    if (world >= 9) {
      branchCount += 2;
    }

    var maxLen = 3;
    if (world >= 6) {
      maxLen = 5;
    }
    if (world >= 8) {
      maxLen = 6;
    }
    var attempts = branchCount * 14;

    for (var n = 0; n < attempts && branchCount > 0; n += 1) {
      if (safePath.length < 6) {
        return;
      }

      var origin = safePath[2 + Math.floor(rand() * (safePath.length - 4))];
      var dir = dirs[Math.floor(rand() * dirs.length)];
      var nx = origin.x + dir.x;
      var ny = origin.y + dir.y;

      if (!isInterior(nx, ny) || grid[ny][nx] !== "#") {
        continue;
      }

      var len = 1 + Math.floor(rand() * maxLen);
      var carved = 0;
      for (var step = 0; step < len; step += 1) {
        if (!isInterior(nx, ny) || grid[ny][nx] !== "#") {
          break;
        }
        grid[ny][nx] = ".";
        carved += 1;
        nx += dir.x;
        ny += dir.y;
      }

      if (carved > 0) {
        branchCount -= 1;
      }
    }
  }

  function placeSymbols(grid, symbol, count, candidates, rand) {
    var pool = shuffleInPlace(candidates.slice(), rand);
    var placed = 0;

    while (pool.length > 0 && placed < count) {
      var cell = pool.pop();
      if (grid[cell.y][cell.x] !== ".") {
        continue;
      }
      grid[cell.y][cell.x] = symbol;
      placed += 1;
    }

    return placed;
  }

  function placePortalPair(grid, candidates, rand, spawn, exit) {
    if (candidates.length < 2) {
      return false;
    }

    var filtered = candidates.filter(function keepPortalCandidate(cell) {
      return manhattan(cell, spawn) >= 6 && manhattan(cell, exit) >= 6;
    });
    if (filtered.length < 2) {
      filtered = candidates.slice();
    }

    var bestA = null;
    var bestB = null;
    var bestDist = -1;

    var sample = shuffleInPlace(filtered.slice(), rand).slice(0, 24);

    for (var i = 0; i < sample.length; i += 1) {
      for (var j = i + 1; j < sample.length; j += 1) {
        var a = sample[i];
        var b = sample[j];
        var d = manhattan(a, b);
        if (d > bestDist) {
          bestDist = d;
          bestA = a;
          bestB = b;
        }
      }
    }

    if (!bestA || !bestB || bestDist < 8) {
      return false;
    }

    if (grid[bestA.y][bestA.x] !== "." || grid[bestB.y][bestB.x] !== ".") {
      return false;
    }

    grid[bestA.y][bestA.x] = "P";
    grid[bestB.y][bestB.x] = "Q";
    return true;
  }

  function enhanceMap(baseRows, world, stage) {
    var rand = createRng(world * 100003 + stage * 17011 + 97);
    var transformed = transformMap(baseRows, chooseTransform(world, stage));
    var grid = toGrid(transformed);

    var spawn = findChar(grid, "S");
    var exit = findChar(grid, "E");
    var safePath = bfsPath(grid, spawn, exit);
    if (!safePath.length) {
      return transformed;
    }

    carveBranches(grid, safePath, world, stage, rand);

    safePath = bfsPath(grid, spawn, exit);
    if (!safePath.length) {
      return transformed;
    }

    var safeSet = buildKeySet(safePath);

    var sideOpen = collectCells(grid, function bySide(char, x, y) {
      if (char !== ".") {
        return false;
      }
      if (safeSet[pointKey(x, y)]) {
        return false;
      }
      if (manhattan({ x: x, y: y }, spawn) <= 2) {
        return false;
      }
      if (manhattan({ x: x, y: y }, exit) <= 2) {
        return false;
      }
      return true;
    });

    // Add decoy blockers away from guaranteed route so each world feels less repetitive.
    var obstacleBudget = Math.max(0, world - 3) + Math.floor(stage / 3);
    if (world >= 7) {
      obstacleBudget += 2 + Math.floor(stage / 2);
    }
    if (world >= 9) {
      obstacleBudget += 2;
    }
    placeSymbols(grid, "X", obstacleBudget, sideOpen, rand);

    sideOpen = collectCells(grid, function refreshSide(char, x, y) {
      if (char !== ".") {
        return false;
      }
      if (safeSet[pointKey(x, y)]) {
        return false;
      }
      if (manhattan({ x: x, y: y }, spawn) <= 2) {
        return false;
      }
      if (manhattan({ x: x, y: y }, exit) <= 2) {
        return false;
      }
      return true;
    });

    var usePortal = false;
    if (world >= 2 && stage % 2 === 0) {
      usePortal = true;
    }
    if (world >= 5) {
      usePortal = true;
    }
    if (stage === 10) {
      usePortal = true;
    }

    if (usePortal) {
      placePortalPair(grid, sideOpen, rand, spawn, exit);
    }

    sideOpen = collectCells(grid, function afterPortal(char, x, y) {
      if (char !== ".") {
        return false;
      }
      if (safeSet[pointKey(x, y)]) {
        return false;
      }
      if (manhattan({ x: x, y: y }, spawn) <= 2) {
        return false;
      }
      if (manhattan({ x: x, y: y }, exit) <= 2) {
        return false;
      }
      return true;
    });

    var normalGrowth = Math.min(16, 5 + world + Math.floor(stage / 2));
    var bigGrowth = world >= 2 ? Math.min(5, 1 + Math.floor((world + stage) / 5)) : 0;
    var starCount = 0;
    if (world >= 3) {
      starCount = 1;
    }
    if (world >= 6) {
      starCount = 2;
    }
    if (world >= 9) {
      starCount = 3;
    }

    placeSymbols(grid, "I", normalGrowth, sideOpen, rand);
    placeSymbols(grid, "G", bigGrowth, sideOpen, rand);
    placeSymbols(grid, "T", starCount, sideOpen, rand);

    return toRows(grid);
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
      var t = Math.floor(safe / 10);
      var o = safe % 10;
      return o ? tens[t] + underTen[o] : tens[t];
    }
    if (safe === 100) {
      return "백";
    }
    return safe + "번";
  }

  function numberblockName(number) {
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
    var base = numberWord(number);
    var extra = alias[number] || "";
    if (number === 8) {
      return base + " (" + extra + ")";
    }
    return extra ? base + " (" + extra + ")" : base;
  }

  function createCharacter(number, world, stage) {
    var palette = CHARACTER_PALETTES[(number - 1) % CHARACTER_PALETTES.length];
    var mood = CHARACTER_MOODS[(number - 1) % CHARACTER_MOODS.length];
    var name = numberblockName(number);

    return {
      number: number,
      id: "num-" + number,
      name: name,
      displayName: name + " · " + number + "번",
      title: name,
      shapeHint: number === 1 ? "Circle" : number === 8 ? "Octoblock" : "Block",
      mood: mood,
      world: world,
      stage: stage,
      primary: palette[0],
      secondary: palette[1],
      accent: palette[2],
    };
  }

  function buildLevelDef(world, stage) {
    var id = (world - 1) * 10 + stage;
    var base = BASE_STAGE_DEFS[stage - 1];
    var map = enhanceMap(base.map, world, stage);

    return {
      id: id,
      world: world,
      stage: stage,
      title:
        "W" + world + "-L" + stage + " " + WORLD_TITLES[world - 1] + " / " + STAGE_TITLES[stage - 1],
      snakeLength: world >= 9 ? 2 : 1,
      theme: (world - 1) % constants.THEMES.length,
      character: createCharacter(id, world, stage),
      map: map,
    };
  }

  var RAW_LEVELS = [];
  for (var world = 1; world <= 10; world += 1) {
    for (var stage = 1; stage <= 10; stage += 1) {
      RAW_LEVELS.push(buildLevelDef(world, stage));
    }
  }

  var CHARACTER_CATALOG = RAW_LEVELS.map(function mapCharacter(levelDef) {
    return levelDef.character;
  });

  function charToTile(char) {
    if (char === ".") {
      return TILE.EMPTY;
    }
    if (char === "#") {
      return TILE.WALL;
    }
    if (char === "E") {
      return TILE.EXIT;
    }
    if (char === "X") {
      return TILE.OBSTACLE;
    }
    if (char === "S") {
      return TILE.SPAWN;
    }
    if (char === "I") {
      return TILE.ITEM;
    }
    if (char === "G") {
      return TILE.BIG_ITEM;
    }
    if (char === "T") {
      return TILE.STAR_ITEM;
    }
    if (char === "P") {
      return TILE.PORTAL_A;
    }
    if (char === "Q") {
      return TILE.PORTAL_B;
    }
    throw new Error("Unknown map symbol: " + char);
  }

  function parseMap(levelDef) {
    if (!levelDef || !Array.isArray(levelDef.map)) {
      throw new Error("Invalid level definition.");
    }

    if (levelDef.map.length !== GRID_ROWS) {
      throw new Error("Level " + levelDef.id + " must have " + GRID_ROWS + " rows.");
    }

    var spawn = null;
    var exitCount = 0;
    var tiles = [];

    for (var y = 0; y < GRID_ROWS; y += 1) {
      var row = levelDef.map[y];
      if (row.length !== GRID_COLS) {
        throw new Error("Level " + levelDef.id + " row " + y + " must have " + GRID_COLS + " cols.");
      }

      var tileRow = [];
      for (var x = 0; x < GRID_COLS; x += 1) {
        var tile = charToTile(row.charAt(x));

        if (tile === TILE.SPAWN) {
          if (spawn) {
            throw new Error("Level " + levelDef.id + " has multiple spawn points.");
          }
          spawn = { x: x, y: y };
          tile = TILE.EMPTY;
        }

        if (tile === TILE.EXIT) {
          exitCount += 1;
        }

        tileRow.push(tile);
      }
      tiles.push(tileRow);
    }

    if (!spawn) {
      throw new Error("Level " + levelDef.id + " is missing a spawn point.");
    }
    if (exitCount === 0) {
      throw new Error("Level " + levelDef.id + " is missing an exit.");
    }

    return {
      id: levelDef.id,
      world: levelDef.world,
      stage: levelDef.stage,
      title: levelDef.title,
      snakeLength: levelDef.snakeLength,
      theme: levelDef.theme,
      character: levelDef.character,
      spawn: spawn,
      tiles: tiles,
      metrics: computeDifficultyMetrics(tiles),
    };
  }

  function isWalkable(tiles, x, y) {
    if (x < 0 || y < 0 || x >= GRID_COLS || y >= GRID_ROWS) {
      return false;
    }
    var tile = tiles[y][x];
    return tile !== TILE.WALL && tile !== TILE.OBSTACLE;
  }

  function computeDifficultyMetrics(tiles) {
    var walkable = 0;
    var deadEnds = 0;
    var junctions = 0;
    var pickups = 0;
    var portals = 0;
    var obstacles = 0;
    var exitCount = 0;

    var dirs = [
      { x: 1, y: 0 },
      { x: -1, y: 0 },
      { x: 0, y: 1 },
      { x: 0, y: -1 },
    ];

    for (var y = 0; y < GRID_ROWS; y += 1) {
      for (var x = 0; x < GRID_COLS; x += 1) {
        var tile = tiles[y][x];

        if (tile === TILE.OBSTACLE) {
          obstacles += 1;
        }

        if (!isWalkable(tiles, x, y)) {
          continue;
        }

        walkable += 1;
        if (tile === TILE.ITEM || tile === TILE.BIG_ITEM || tile === TILE.STAR_ITEM) {
          pickups += 1;
        }
        if (tile === TILE.PORTAL_A || tile === TILE.PORTAL_B) {
          portals += 1;
        }
        if (tile === TILE.EXIT) {
          exitCount += 1;
        }

        var connections = 0;
        for (var i = 0; i < dirs.length; i += 1) {
          if (isWalkable(tiles, x + dirs[i].x, y + dirs[i].y)) {
            connections += 1;
          }
        }

        if (connections <= 1) {
          deadEnds += 1;
        } else if (connections >= 3) {
          junctions += 1;
        }
      }
    }

    var density = walkable / (GRID_COLS * GRID_ROWS);
    var score = Math.round(
      1 +
        Math.min(
          9,
          deadEnds * 0.07 +
            junctions * 0.06 +
            pickups * 0.34 +
            portals * 0.75 +
            obstacles * 0.05 +
            (1 - density) * 5.5
        )
    );

    return {
      walkable: walkable,
      deadEnds: deadEnds,
      junctions: junctions,
      pickups: pickups,
      portals: portals,
      obstacles: obstacles,
      exits: exitCount,
      density: Number(density.toFixed(3)),
      score: score,
    };
  }

  var levelSource = Array.isArray(global.WormGameExternalLevels)
    ? global.WormGameExternalLevels
    : RAW_LEVELS;

  var LEVELS = levelSource.map(parseMap);

  global.WormGameLevels = Object.freeze({
    RAW_LEVELS: RAW_LEVELS,
    LEVELS: LEVELS,
    WORLD_TITLES: WORLD_TITLES,
    CHARACTER_CATALOG: CHARACTER_CATALOG,
    parseMap: parseMap,
    computeDifficultyMetrics: computeDifficultyMetrics,
  });
})(window);
