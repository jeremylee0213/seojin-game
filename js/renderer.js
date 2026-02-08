/**
 * renderer.js — Canvas 2D 렌더러 (타일맵, 스네이크, 오버레이, 파티클)
 *
 * @module  WormGameRenderer
 * @depends WormGameConstants (TILE, TILE_SIZE, GRID_COLS, GRID_ROWS, CANVAS_WIDTH, CANVAS_HEIGHT, GAME_STATE, ...)
 * @exports global.WormGameRenderer
 *
 * ES Module 전환 시: import { TILE, TILE_SIZE, ... } from './constants.js'
 */
(function attachRenderer(global) {
  "use strict";

  var constants = global.WormGameConstants;
  var TILE = constants.TILE;
  var TILE_SIZE = constants.TILE_SIZE;
  var GRID_COLS = constants.GRID_COLS;
  var GRID_ROWS = constants.GRID_ROWS;
  var DIRECTIONS = constants.DIRECTIONS;
  var GAME_STATE = constants.GAME_STATE;
  var CANVAS_WIDTH = constants.CANVAS_WIDTH;
  var CANVAS_HEIGHT = constants.CANVAS_HEIGHT;

  var clamp = constants.clamp;

  /**
   * Canvas 텍스트 자동 줄바꿈 유틸리티.
   * maxWidth를 초과하면 단어 단위로 줄을 나눠 그린다.
   * 한글은 글자 단위로 끊는다.
   */
  function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
    if (!text) {
      return;
    }
    var chars = text.split("");
    var line = "";
    var lines = [];

    for (var i = 0; i < chars.length; i += 1) {
      var testLine = line + chars[i];
      var metrics = ctx.measureText(testLine);
      if (metrics.width > maxWidth && line.length > 0) {
        lines.push(line);
        line = chars[i];
      } else {
        line = testLine;
      }
    }
    if (line.length > 0) {
      lines.push(line);
    }

    var startY = y - ((lines.length - 1) * lineHeight) / 2;
    for (var j = 0; j < lines.length; j += 1) {
      ctx.fillText(lines[j], x, startY + j * lineHeight);
    }
  }

  function drawRoundedRect(ctx, x, y, width, height, radius, fillStyle) {
    var r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + width - r, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + r);
    ctx.lineTo(x + width, y + height - r);
    ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    ctx.lineTo(x + r, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
    ctx.fillStyle = fillStyle;
    ctx.fill();
  }

  function drawRegularPolygon(ctx, cx, cy, radius, sides, rotation) {
    var count = Math.max(3, Math.floor(sides || 0));
    var start = Number.isFinite(rotation) ? rotation : 0;
    ctx.beginPath();
    for (var i = 0; i < count; i += 1) {
      var angle = start + (Math.PI * 2 * i) / count;
      var x = cx + Math.cos(angle) * radius;
      var y = cy + Math.sin(angle) * radius;
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.closePath();
  }

  function hslColor(h, s, l) {
    var hue = ((Math.round(h) % 360) + 360) % 360;
    return "hsl(" + hue + ", " + Math.round(s) + "%, " + Math.round(l) + "%)";
  }

  function isPrime(n) {
    if (n <= 1) {
      return false;
    }
    if (n <= 3) {
      return true;
    }
    if (n % 2 === 0 || n % 3 === 0) {
      return false;
    }
    for (var i = 5; i * i <= n; i += 6) {
      if (n % i === 0 || n % (i + 2) === 0) {
        return false;
      }
    }
    return true;
  }

  function createOffscreenCanvas(size) {
    var canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    return canvas;
  }

  function Renderer(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.wallCache = {};
    this.obstacleCache = {};
    this.itemCache = {};
    this.portalCache = {};
    this.viewportScaleX = 1;
    this.viewportScaleY = 1;
    this.lastMorphLength = 0;
    this.morphUntilMs = 0;

    this.perf = {
      frameMs: 0,
      fps: 0,
      frameCount: 0,
      aggregateMs: 0,
      lastMarkMs: 0,
    };

    this.tileDrawers = {};
    this.tileDrawers[TILE.WALL] = this.drawWallTile.bind(this);
    this.tileDrawers[TILE.OBSTACLE] = this.drawObstacleTile.bind(this);
    this.tileDrawers[TILE.EXIT] = this.drawExitTile.bind(this);
    this.tileDrawers[TILE.ITEM] = this.drawItemTile.bind(this);
    this.tileDrawers[TILE.BIG_ITEM] = this.drawBigItemTile.bind(this);
    this.tileDrawers[TILE.STAR_ITEM] = this.drawStarItemTile.bind(this);
    this.tileDrawers[TILE.PORTAL_A] = this.drawPortalTile.bind(this);
    this.tileDrawers[TILE.PORTAL_B] = this.drawPortalTile.bind(this);

    /** VFX 파티클 배열. { x, y, vx, vy, life, maxLife, color, size } */
    this.vfxParticles = [];
    /** 포털 워프 페이드 이펙트. { x, y, startMs, durationMs, color } */
    this.vfxPortalFlash = null;
  }

  Renderer.prototype.resizeViewport = function resizeViewport(pixelWidth, pixelHeight) {
    if (this.canvas.width !== pixelWidth) {
      this.canvas.width = pixelWidth;
    }
    if (this.canvas.height !== pixelHeight) {
      this.canvas.height = pixelHeight;
    }

    this.viewportScaleX = this.canvas.width / CANVAS_WIDTH;
    this.viewportScaleY = this.canvas.height / CANVAS_HEIGHT;
  };

  Renderer.prototype.withWorldTransform = function withWorldTransform(callback) {
    var ctx = this.ctx;
    ctx.save();
    ctx.setTransform(this.viewportScaleX, 0, 0, this.viewportScaleY, 0, 0);
    callback(ctx);
    ctx.restore();
  };

  Renderer.prototype.withScreenShake = function withScreenShake(offset, callback) {
    var ctx = this.ctx;
    ctx.save();
    ctx.translate(offset.x * this.viewportScaleX, offset.y * this.viewportScaleY);
    callback();
    ctx.restore();
  };

  Renderer.prototype.recordFrame = function recordFrame(startMs, nowMs) {
    this.perf.frameMs = nowMs - startMs;
    this.perf.frameCount += 1;
    this.perf.aggregateMs += this.perf.frameMs;

    if (!this.perf.lastMarkMs) {
      this.perf.lastMarkMs = nowMs;
      return;
    }

    var elapsed = nowMs - this.perf.lastMarkMs;
    if (elapsed >= 400) {
      this.perf.fps = Math.round((this.perf.frameCount * 1000) / elapsed);
      this.perf.frameCount = 0;
      this.perf.aggregateMs = 0;
      this.perf.lastMarkMs = nowMs;
    }
  };

  Renderer.prototype.getPerfSnapshot = function getPerfSnapshot() {
    return {
      fps: this.perf.fps,
      frameMs: this.perf.frameMs,
    };
  };

  Renderer.prototype.getWallTileTexture = function getWallTileTexture(theme) {
    if (this.wallCache[theme.name]) {
      return this.wallCache[theme.name];
    }

    var canvas = createOffscreenCanvas(TILE_SIZE);
    var ctx = canvas.getContext("2d");

    ctx.fillStyle = theme.wall;
    ctx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);

    // Offset brick rows for classic platformer readability.
    ctx.strokeStyle = theme.mortar;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, TILE_SIZE * 0.5);
    ctx.lineTo(TILE_SIZE, TILE_SIZE * 0.5);

    ctx.moveTo(TILE_SIZE * 0.5, 0);
    ctx.lineTo(TILE_SIZE * 0.5, TILE_SIZE * 0.5);

    ctx.moveTo(TILE_SIZE * 0.25, TILE_SIZE * 0.5);
    ctx.lineTo(TILE_SIZE * 0.25, TILE_SIZE);
    ctx.moveTo(TILE_SIZE * 0.75, TILE_SIZE * 0.5);
    ctx.lineTo(TILE_SIZE * 0.75, TILE_SIZE);
    ctx.stroke();

    ctx.fillStyle = "rgba(255,255,255,0.2)";
    drawRoundedRect(ctx, 4, 4, TILE_SIZE - 8, 8, 4, ctx.fillStyle);

    this.wallCache[theme.name] = canvas;
    return canvas;
  };

  Renderer.prototype.getObstacleTileTexture = function getObstacleTileTexture(theme) {
    if (this.obstacleCache[theme.name]) {
      return this.obstacleCache[theme.name];
    }

    var canvas = createOffscreenCanvas(TILE_SIZE);
    var ctx = canvas.getContext("2d");
    ctx.fillStyle = theme.obstacle;
    ctx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);

    ctx.strokeStyle = theme.obstacleAccent;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(8, 8);
    ctx.lineTo(TILE_SIZE - 8, TILE_SIZE - 8);
    ctx.moveTo(TILE_SIZE - 8, 8);
    ctx.lineTo(8, TILE_SIZE - 8);
    ctx.stroke();

    ctx.fillStyle = theme.obstacleAccent;
    ctx.beginPath();
    ctx.arc(TILE_SIZE / 2, TILE_SIZE / 2, 5, 0, Math.PI * 2);
    ctx.fill();

    this.obstacleCache[theme.name] = canvas;
    return canvas;
  };

  Renderer.prototype.getItemTileTexture = function getItemTileTexture(theme, variant) {
    var mode = variant || "normal";
    var key = theme.name + "::" + mode;
    if (this.itemCache[key]) {
      return this.itemCache[key];
    }

    var canvas = createOffscreenCanvas(TILE_SIZE);
    var ctx = canvas.getContext("2d");
    var cx = TILE_SIZE / 2;
    var cy = TILE_SIZE / 2;

    ctx.fillStyle = "rgba(255,255,255,0.22)";
    drawRoundedRect(ctx, 6, 6, TILE_SIZE - 12, TILE_SIZE - 12, 10, ctx.fillStyle);

    var core = theme.itemCore || "#ffe35d";
    var glow = theme.itemGlow || "#ff7ae6";
    if (mode === "big") {
      core = theme.itemBigCore || "#ff9b30";
      glow = theme.itemBigGlow || "#ff4f4f";
    } else if (mode === "star") {
      core = theme.itemStarCore || "#ffffff";
      glow = theme.itemStarGlow || "#40d4ff";
    }

    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(cx, cy, mode === "big" ? 10 : 8, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = glow;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx, cy - 14);
    ctx.lineTo(cx, cy + 14);
    ctx.moveTo(cx - 14, cy);
    ctx.lineTo(cx + 14, cy);
    ctx.moveTo(cx - 10, cy - 10);
    ctx.lineTo(cx + 10, cy + 10);
    ctx.moveTo(cx + 10, cy - 10);
    ctx.lineTo(cx - 10, cy + 10);
    ctx.stroke();

    if (mode === "big") {
      ctx.fillStyle = "rgba(30,40,90,0.85)";
      ctx.font = '700 11px "Trebuchet MS", sans-serif';
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("+2", cx, cy + 1);
    } else if (mode === "star") {
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.moveTo(cx, cy - 12);
      ctx.lineTo(cx + 3, cy - 3);
      ctx.lineTo(cx + 12, cy - 3);
      ctx.lineTo(cx + 5, cy + 2);
      ctx.lineTo(cx + 8, cy + 11);
      ctx.lineTo(cx, cy + 5);
      ctx.lineTo(cx - 8, cy + 11);
      ctx.lineTo(cx - 5, cy + 2);
      ctx.lineTo(cx - 12, cy - 3);
      ctx.lineTo(cx - 3, cy - 3);
      ctx.closePath();
      ctx.globalAlpha = 0.8;
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    this.itemCache[key] = canvas;
    return canvas;
  };

  Renderer.prototype.getPortalTileTexture = function getPortalTileTexture(theme, tile) {
    var variant = tile === TILE.PORTAL_A ? "a" : "b";
    var key = theme.name + "::portal::" + variant;
    if (this.portalCache[key]) {
      return this.portalCache[key];
    }

    var canvas = createOffscreenCanvas(TILE_SIZE);
    var ctx = canvas.getContext("2d");
    var cx = TILE_SIZE / 2;
    var cy = TILE_SIZE / 2;
    var color = variant === "a" ? theme.portalA || "#00ebff" : theme.portalB || "#ff66d2";

    ctx.fillStyle = "rgba(255,255,255,0.12)";
    drawRoundedRect(ctx, 6, 6, TILE_SIZE - 12, TILE_SIZE - 12, 10, ctx.fillStyle);

    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx, cy, 12, 0, Math.PI * 2);
    ctx.stroke();

    ctx.globalAlpha = 0.55;
    ctx.beginPath();
    ctx.arc(cx, cy, 7, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;

    this.portalCache[key] = canvas;
    return canvas;
  };

  Renderer.prototype.clear = function clear(theme) {
    this.withWorldTransform(function clearWorld(ctx) {
      ctx.fillStyle = theme.background;
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    });
  };

  Renderer.prototype.drawFloor = function drawFloor(theme) {
    this.withWorldTransform(function drawFloorWorld(ctx) {
      var useFlat = !!(this.runtimeSettings && this.runtimeSettings.flatFloor);
      for (var y = 0; y < GRID_ROWS; y += 1) {
        for (var x = 0; x < GRID_COLS; x += 1) {
          var px = x * TILE_SIZE;
          var py = y * TILE_SIZE;
          ctx.fillStyle = useFlat
            ? theme.floorA
            : (x + y) % 2 === 0
              ? theme.floorA
              : theme.floorB;
          ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
        }
      }
    }.bind(this));
  };

  Renderer.prototype.drawExit = function drawExit(ctx, tileX, tileY, theme, timeMs) {
    var x = tileX * TILE_SIZE;
    var y = tileY * TILE_SIZE;
    var cx = x + TILE_SIZE / 2;
    var cy = y + TILE_SIZE / 2;

    var pulse = 0.86 + 0.14 * Math.sin(timeMs * 0.0062);
    var outerRadius = TILE_SIZE * (0.28 + 0.07 * pulse);
    var innerRadius = TILE_SIZE * (0.16 + 0.05 * pulse);

    ctx.fillStyle = "rgba(0,0,0,0.26)";
    drawRoundedRect(ctx, x + 3, y + 3, TILE_SIZE - 6, TILE_SIZE - 6, 10, ctx.fillStyle);

    ctx.globalAlpha = 0.32 + pulse * 0.38;
    ctx.fillStyle = theme.exitGlow;
    ctx.beginPath();
    ctx.arc(cx, cy, outerRadius, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = 1;
    ctx.fillStyle = theme.exitCore;
    ctx.beginPath();
    ctx.arc(cx, cy, innerRadius, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "rgba(255,255,255,0.75)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - 5, cy - 7);
    ctx.lineTo(cx + 7, cy);
    ctx.lineTo(cx - 5, cy + 7);
    ctx.stroke();
  };

  Renderer.prototype.drawWallTile = function drawWallTile(ctx, x, y, _tile, _timeMs, theme) {
    var wallTexture = this.getWallTileTexture(theme);
    ctx.drawImage(wallTexture, x * TILE_SIZE, y * TILE_SIZE);
  };

  Renderer.prototype.drawObstacleTile = function drawObstacleTile(
    ctx,
    x,
    y,
    _tile,
    _timeMs,
    theme
  ) {
    var obstacleTexture = this.getObstacleTileTexture(theme);
    ctx.drawImage(obstacleTexture, x * TILE_SIZE, y * TILE_SIZE);
  };

  Renderer.prototype.drawExitTile = function drawExitTile(ctx, x, y, _tile, timeMs, theme) {
    this.drawExit(ctx, x, y, theme, timeMs);
  };

  Renderer.prototype.drawItemTile = function drawItemTile(ctx, x, y, _tile, timeMs, theme) {
    var itemTexture = this.getItemTileTexture(theme, "normal");
    var px = x * TILE_SIZE;
    var py = y * TILE_SIZE;
    var bob = Math.sin(timeMs * 0.008 + x * 0.2 + y * 0.2) * 2.2;
    ctx.drawImage(itemTexture, px, py + bob);
  };

  Renderer.prototype.drawBigItemTile = function drawBigItemTile(ctx, x, y, _tile, timeMs, theme) {
    var itemTexture = this.getItemTileTexture(theme, "big");
    var px = x * TILE_SIZE;
    var py = y * TILE_SIZE;
    var bob = Math.sin(timeMs * 0.007 + x * 0.15 + y * 0.19) * 2.8;
    ctx.drawImage(itemTexture, px, py + bob);
  };

  Renderer.prototype.drawStarItemTile = function drawStarItemTile(ctx, x, y, _tile, timeMs, theme) {
    var itemTexture = this.getItemTileTexture(theme, "star");
    var px = x * TILE_SIZE;
    var py = y * TILE_SIZE;
    var bob = Math.sin(timeMs * 0.009 + x * 0.22 + y * 0.22) * 3.2;
    ctx.drawImage(itemTexture, px, py + bob);
  };

  Renderer.prototype.drawPortalTile = function drawPortalTile(ctx, x, y, tile, timeMs, theme) {
    var texture = this.getPortalTileTexture(theme, tile);
    var px = x * TILE_SIZE;
    var py = y * TILE_SIZE;
    var pulse = 0.9 + Math.sin(timeMs * 0.01 + x * 0.2 + y * 0.1) * 0.06;
    var size = TILE_SIZE * pulse;
    var offset = (TILE_SIZE - size) / 2;
    ctx.drawImage(texture, px + offset, py + offset, size, size);
  };

  Renderer.prototype.drawPatternAssist = function drawPatternAssist(ctx, tile, x, y) {
    var px = x * TILE_SIZE;
    var py = y * TILE_SIZE;
    ctx.save();
    ctx.globalAlpha = 0.38;
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 1.5;

    if (tile === TILE.WALL) {
      for (var i = 0; i < TILE_SIZE; i += 8) {
        ctx.beginPath();
        ctx.moveTo(px + i, py);
        ctx.lineTo(px + i - TILE_SIZE, py + TILE_SIZE);
        ctx.stroke();
      }
    } else if (tile === TILE.OBSTACLE) {
      for (var j = 0; j < TILE_SIZE; j += 8) {
        ctx.beginPath();
        ctx.moveTo(px, py + j);
        ctx.lineTo(px + TILE_SIZE, py + j);
        ctx.stroke();
      }
    } else if (tile === TILE.EXIT) {
      ctx.beginPath();
      ctx.arc(px + TILE_SIZE / 2, py + TILE_SIZE / 2, 10, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(px + TILE_SIZE / 2, py + TILE_SIZE / 2, 5, 0, Math.PI * 2);
      ctx.stroke();
    } else if (tile === TILE.ITEM) {
      ctx.beginPath();
      ctx.moveTo(px + 6, py + TILE_SIZE / 2);
      ctx.lineTo(px + TILE_SIZE - 6, py + TILE_SIZE / 2);
      ctx.moveTo(px + TILE_SIZE / 2, py + 6);
      ctx.lineTo(px + TILE_SIZE / 2, py + TILE_SIZE - 6);
      ctx.stroke();
    } else if (tile === TILE.BIG_ITEM) {
      ctx.beginPath();
      ctx.rect(px + 8, py + 8, TILE_SIZE - 16, TILE_SIZE - 16);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(px + TILE_SIZE / 2, py + 10);
      ctx.lineTo(px + TILE_SIZE / 2, py + TILE_SIZE - 10);
      ctx.moveTo(px + 10, py + TILE_SIZE / 2);
      ctx.lineTo(px + TILE_SIZE - 10, py + TILE_SIZE / 2);
      ctx.stroke();
    } else if (tile === TILE.STAR_ITEM) {
      ctx.beginPath();
      ctx.moveTo(px + TILE_SIZE / 2, py + 8);
      ctx.lineTo(px + TILE_SIZE - 8, py + TILE_SIZE / 2);
      ctx.lineTo(px + TILE_SIZE / 2, py + TILE_SIZE - 8);
      ctx.lineTo(px + 8, py + TILE_SIZE / 2);
      ctx.closePath();
      ctx.stroke();
    } else if (tile === TILE.PORTAL_A || tile === TILE.PORTAL_B) {
      ctx.beginPath();
      ctx.arc(px + TILE_SIZE / 2, py + TILE_SIZE / 2, 12, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(px + TILE_SIZE / 2, py + TILE_SIZE / 2, 6, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  };

  Renderer.prototype.drawLevel = function drawLevel(level, theme, timeMs) {
    this.withWorldTransform(
      function drawWorld(ctx) {
        var tiles = level.tiles;
        var colorBlindAssist = !!(this.runtimeSettings && this.runtimeSettings.colorBlindAssist);
        for (var y = 0; y < GRID_ROWS; y += 1) {
          for (var x = 0; x < GRID_COLS; x += 1) {
            var tile = tiles[y][x];
            var drawer = this.tileDrawers[tile];
            if (drawer) {
              drawer(ctx, x, y, tile, timeMs, theme);
              if (colorBlindAssist) {
                this.drawPatternAssist(ctx, tile, x, y);
              }
            }
          }
        }
      }.bind(this)
    );
  };

  Renderer.prototype.getNumberblockStyle = function getNumberblockStyle(length) {
    var number = Math.max(1, Math.round(length || 1));
    var styles = {
      1: {
        body: "#ff2f3f",
        shade: "#dd1f2d",
        outline: "#7d0f1b",
        accent: "#ffd5da",
        circle: true,
        oneEye: true,
        visualScale: 2.15,
      },
      2: { body: "#ff8b1a", shade: "#e36a00", outline: "#7b3600", accent: "#ffe1bd", visualScale: 2.08 },
      3: { body: "#ffd31a", shade: "#e4b600", outline: "#705700", accent: "#fff2ac", visualScale: 2.05 },
      4: { body: "#2fd058", shade: "#20ad43", outline: "#165c28", accent: "#d3ffd8", visualScale: 2.0 },
      5: { body: "#00afff", shade: "#0090dc", outline: "#124c74", accent: "#d6f0ff", visualScale: 2.0 },
      6: { body: "#6a5cff", shade: "#5447dd", outline: "#2a2478", accent: "#dfdcff", visualScale: 2.0 },
      7: {
        body: "#ff3e7f",
        shade: "#ffb31a",
        outline: "#43245d",
        accent: "#ffe99a",
        rainbow: true,
        rainbowPalette: ["#ff304f", "#ff9f1a", "#ffd91a", "#33d05c", "#27b0ff", "#6b5dff", "#b35dff"],
        visualScale: 2.0,
      },
      8: {
        body: "#ff44b8",
        shade: "#dc2f99",
        outline: "#6f1d52",
        accent: "#ffd9f3",
        octagon: true,
        mask: "#233999",
        visualScale: 2.0,
      },
      9: { body: "#aab1bc", shade: "#9199a5", outline: "#3b4451", accent: "#ecf2ff", visualScale: 2.0 },
      10: { body: "#ffffff", shade: "#f3f3f3", outline: "#cf2338", accent: "#ff3347", ten: true, visualScale: 2.0 },
    };
    var selected = styles[number];

    if (!selected) {
      var decade = Math.min(10, Math.floor(number / 10));
      var ones = number % 10;
      var decadePalette = {
        1: { h: 2, s: 92, l: 57 },
        2: { h: 24, s: 90, l: 57 },
        3: { h: 56, s: 88, l: 56 },
        4: { h: 106, s: 72, l: 48 },
        5: { h: 168, s: 78, l: 46 },
        6: { h: 214, s: 90, l: 53 },
        7: { h: 252, s: 86, l: 59 },
        8: { h: 300, s: 80, l: 55 },
        9: { h: 336, s: 85, l: 58 },
        10: { h: 46, s: 96, l: 58 },
      };
      var tone = decadePalette[decade] || decadePalette[10];
      var hueShift = (ones - 5) * 7;
      var h = tone.h + hueShift;
      var patternList = ["stripe", "dot", "grid", "diag", "band"];
      var accessoryList = ["crown", "glasses", "badge", "antenna", "star", "mask", "cheek", "spark", "bolt", "scarf"];

      selected = {
        body: hslColor(h, tone.s, tone.l),
        shade: hslColor(h + 2, tone.s + 1, tone.l - 10),
        outline: hslColor(h + 1, Math.max(38, tone.s - 34), Math.max(18, tone.l - 34)),
        accent: hslColor(h + 30, Math.min(98, tone.s + 6), Math.min(84, tone.l + 19)),
        visualScale: 1.95,
        pattern: patternList[(number + decade + ones) % patternList.length],
        accessory: accessoryList[ones],
        showNumber: true,
      };

      if (number % 10 === 0) {
        selected.accessory = "crown";
        selected.pattern = "band";
      }
      if (isPrime(number)) {
        selected.accessory = "spark";
        selected.pattern = "diag";
      }
      if (number >= 50 && number % 2 === 0) {
        selected.pattern = "grid";
      }
      if (number === 64) {
        selected.pattern = "dot";
      }
      if (number === 88) {
        selected.octagon = true;
      }
      if (number === 100) {
        selected.body = "#ffe34e";
        selected.shade = "#f2c91c";
        selected.outline = "#a86f06";
        selected.accent = "#fff7b9";
        selected.pattern = "band";
        selected.accessory = "crown";
        selected.showNumber = true;
        selected.visualScale = 2.05;
      }
    }

    var finalVisualScale = Math.max(1, (selected.visualScale || 1) * 0.9);
    finalVisualScale = Math.min(1.95, finalVisualScale);

    return {
      number: number,
      body: selected.body,
      shade: selected.shade,
      outline: selected.outline,
      accent: selected.accent,
      circle: !!selected.circle,
      octagon: !!selected.octagon,
      oneEye: !!selected.oneEye,
      rainbow: !!selected.rainbow,
      rainbowPalette: selected.rainbowPalette || null,
      mask: selected.mask || "",
      pattern: selected.pattern || "",
      accessory: selected.accessory || "",
      visualScale: finalVisualScale,
      showNumber: selected.showNumber !== false,
      ten: !!selected.ten,
    };
  };

  Renderer.prototype.drawNumberblockSegment = function drawNumberblockSegment(
    ctx,
    segment,
    style,
    indexFromHead
  ) {
    var inset = style.circle ? 6 : style.octagon ? 5 : 4;
    var baseSize = TILE_SIZE - inset * 2;
    var scale = Math.max(1, style.visualScale || 1);
    var size = baseSize * scale;
    var centerX = segment.x * TILE_SIZE + TILE_SIZE / 2;
    var centerY = segment.y * TILE_SIZE + TILE_SIZE / 2;
    var x = centerX - size / 2;
    var y = centerY - size / 2;
    var fill = indexFromHead % 2 === 0 ? style.body : style.shade;
    if (style.rainbow && style.rainbowPalette && style.rainbowPalette.length > 0) {
      fill = style.rainbowPalette[indexFromHead % style.rainbowPalette.length];
    }

    if (style.circle) {
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = style.outline;
      ctx.lineWidth = Math.max(2, 1 + scale * 0.8);
      ctx.stroke();
    } else if (style.octagon) {
      ctx.fillStyle = fill;
      drawRegularPolygon(ctx, x + size / 2, y + size / 2, size / 2, 8, Math.PI / 8);
      ctx.fill();
      ctx.strokeStyle = style.outline;
      ctx.lineWidth = Math.max(2, 1 + scale * 0.8);
      ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,0.2)";
      drawRegularPolygon(ctx, x + size / 2, y + size * 0.35, size * 0.26, 8, Math.PI / 8);
      ctx.fill();
    } else {
      drawRoundedRect(ctx, x, y, size, size, 8, fill);
      ctx.strokeStyle = style.outline;
      ctx.lineWidth = Math.max(2, 1 + scale * 0.8);
      ctx.strokeRect(x + 1, y + 1, size - 2, size - 2);
      ctx.fillStyle = "rgba(255,255,255,0.22)";
      drawRoundedRect(ctx, x + 3, y + 3, size - 6, 8, 4, ctx.fillStyle);
      if (style.ten) {
        ctx.fillStyle = style.accent;
        drawRoundedRect(ctx, x + 4, y + 4, size - 8, 6, 3, ctx.fillStyle);
      }
    }

    if (style.pattern === "stripe") {
      ctx.strokeStyle = "rgba(255,255,255,0.25)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x + 4, y + size * 0.25);
      ctx.lineTo(x + size - 4, y + size * 0.25);
      ctx.moveTo(x + 4, y + size * 0.5);
      ctx.lineTo(x + size - 4, y + size * 0.5);
      ctx.moveTo(x + 4, y + size * 0.75);
      ctx.lineTo(x + size - 4, y + size * 0.75);
      ctx.stroke();
    } else if (style.pattern === "dot") {
      ctx.fillStyle = "rgba(255,255,255,0.28)";
      ctx.beginPath();
      ctx.arc(x + size * 0.3, y + size * 0.32, 2.2, 0, Math.PI * 2);
      ctx.arc(x + size * 0.66, y + size * 0.36, 2.2, 0, Math.PI * 2);
      ctx.arc(x + size * 0.5, y + size * 0.68, 2.2, 0, Math.PI * 2);
      ctx.fill();
    } else if (style.pattern === "grid") {
      ctx.strokeStyle = "rgba(255,255,255,0.22)";
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(x + size / 3, y + 2);
      ctx.lineTo(x + size / 3, y + size - 2);
      ctx.moveTo(x + (size * 2) / 3, y + 2);
      ctx.lineTo(x + (size * 2) / 3, y + size - 2);
      ctx.moveTo(x + 2, y + size / 3);
      ctx.lineTo(x + size - 2, y + size / 3);
      ctx.moveTo(x + 2, y + (size * 2) / 3);
      ctx.lineTo(x + size - 2, y + (size * 2) / 3);
      ctx.stroke();
    } else if (style.pattern === "diag") {
      ctx.strokeStyle = "rgba(255,255,255,0.24)";
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(x + 4, y + size - 6);
      ctx.lineTo(x + size - 6, y + 4);
      ctx.moveTo(x + 12, y + size - 4);
      ctx.lineTo(x + size - 2, y + 12);
      ctx.moveTo(x + 2, y + size - 12);
      ctx.lineTo(x + size - 12, y + 2);
      ctx.stroke();
    } else if (style.pattern === "band") {
      ctx.fillStyle = "rgba(255,255,255,0.24)";
      drawRoundedRect(ctx, x + 4, y + size * 0.42, size - 8, Math.max(5, size * 0.14), 3, ctx.fillStyle);
    }
  };

  Renderer.prototype.drawNumberblockFace = function drawNumberblockFace(
    ctx,
    segment,
    directionName,
    style,
    timeMs
  ) {
    var inset = style.circle ? 6 : style.octagon ? 5 : 4;
    var baseSize = TILE_SIZE - inset * 2;
    var scale = Math.max(1, style.visualScale || 1);
    var size = baseSize * scale;
    var centerX = segment.x * TILE_SIZE + TILE_SIZE / 2;
    var centerY = segment.y * TILE_SIZE + TILE_SIZE / 2;
    var x = centerX - size / 2;
    var y = centerY - size / 2;

    var direction = DIRECTIONS[directionName] || DIRECTIONS.right;
    var pulse = 0.9 + Math.sin(timeMs * 0.008) * 0.1;

    var forwardX = direction.x * size * 0.12;
    var forwardY = direction.y * size * 0.12;
    var sideX = direction.y * size * 0.18;
    var sideY = -direction.x * size * 0.18;

    var eyeRadius = style.number === 2 ? 5.8 : 5.2;
    var pupilRadius = 2.4;

    var leftEyeX = centerX + forwardX + sideX;
    var leftEyeY = centerY + forwardY + sideY - 2;
    var rightEyeX = centerX + forwardX - sideX;
    var rightEyeY = centerY + forwardY - sideY - 2;

    if (style.mask) {
      ctx.fillStyle = style.mask;
      drawRoundedRect(ctx, centerX - size * 0.34, centerY - size * 0.2, size * 0.68, size * 0.22, 6, ctx.fillStyle);
    }

    var pupilShiftX = direction.x * 1.8;
    var pupilShiftY = direction.y * 1.8;
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    if (style.oneEye) {
      ctx.arc(centerX + forwardX * 0.7, centerY + forwardY * 0.7 - 2, eyeRadius + 1.3, 0, Math.PI * 2);
    } else {
      ctx.arc(leftEyeX, leftEyeY, eyeRadius, 0, Math.PI * 2);
      ctx.arc(rightEyeX, rightEyeY, eyeRadius, 0, Math.PI * 2);
    }
    ctx.fill();

    ctx.fillStyle = "#1a234f";
    ctx.beginPath();
    if (style.oneEye) {
      ctx.arc(
        centerX + forwardX * 0.7 + pupilShiftX,
        centerY + forwardY * 0.7 - 2 + pupilShiftY,
        pupilRadius + 0.6,
        0,
        Math.PI * 2
      );
    } else {
      ctx.arc(leftEyeX + pupilShiftX, leftEyeY + pupilShiftY, pupilRadius, 0, Math.PI * 2);
      ctx.arc(rightEyeX + pupilShiftX, rightEyeY + pupilShiftY, pupilRadius, 0, Math.PI * 2);
    }
    ctx.fill();

    if (style.accessory === "glasses" && !style.oneEye) {
      ctx.strokeStyle = "#0f1c49";
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.arc(leftEyeX, leftEyeY, eyeRadius + 1.4, 0, Math.PI * 2);
      ctx.arc(rightEyeX, rightEyeY, eyeRadius + 1.4, 0, Math.PI * 2);
      ctx.moveTo(leftEyeX + eyeRadius + 0.6, leftEyeY);
      ctx.lineTo(rightEyeX - eyeRadius - 0.6, rightEyeY);
      ctx.stroke();
    }

    ctx.strokeStyle = "#1a234f";
    ctx.lineWidth = style.number === 3 ? 2.7 : 2.1;
    ctx.beginPath();
    if (style.number === 3) {
      ctx.arc(centerX, centerY + 7, 8 * pulse, 0.12, Math.PI - 0.12);
    } else {
      ctx.arc(centerX, centerY + 6, 7 * pulse, 0.2, Math.PI - 0.2);
    }
    ctx.stroke();

    if (style.accessory === "crown") {
      ctx.fillStyle = "#ffd44f";
      ctx.beginPath();
      ctx.moveTo(centerX - 12, y + 4);
      ctx.lineTo(centerX - 6, y - 6);
      ctx.lineTo(centerX, y + 3);
      ctx.lineTo(centerX + 6, y - 6);
      ctx.lineTo(centerX + 12, y + 4);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "#8a5e08";
      ctx.lineWidth = 1.6;
      ctx.stroke();
    } else if (style.accessory === "antenna") {
      ctx.strokeStyle = "#253575";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(centerX, y + 4);
      ctx.lineTo(centerX + 4, y - 8);
      ctx.stroke();
      ctx.fillStyle = "#ffe452";
      ctx.beginPath();
      ctx.arc(centerX + 4, y - 8, 3, 0, Math.PI * 2);
      ctx.fill();
    } else if (style.accessory === "star" || style.accessory === "spark") {
      ctx.fillStyle = style.accessory === "star" ? "#ffe66f" : "#9cf2ff";
      drawRegularPolygon(ctx, x + size - 8, y + 8, 5, 5, -Math.PI / 2);
      ctx.fill();
    } else if (style.accessory === "badge") {
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(x + size - 8, y + size - 8, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#1b2c63";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = "#1b2c63";
      ctx.font = '700 8px "Baloo 2", "Fredoka", sans-serif';
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(style.number % 10), x + size - 8, y + size - 8);
    } else if (style.accessory === "bolt") {
      ctx.strokeStyle = "#fef3a1";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x + size - 15, y + 6);
      ctx.lineTo(x + size - 10, y + 13);
      ctx.lineTo(x + size - 14, y + 13);
      ctx.lineTo(x + size - 9, y + 21);
      ctx.stroke();
    } else if (style.accessory === "cheek") {
      ctx.fillStyle = "rgba(255,95,132,0.36)";
      ctx.beginPath();
      ctx.arc(centerX - size * 0.18, centerY + size * 0.08, 3.3, 0, Math.PI * 2);
      ctx.arc(centerX + size * 0.18, centerY + size * 0.08, 3.3, 0, Math.PI * 2);
      ctx.fill();
    } else if (style.accessory === "scarf") {
      ctx.fillStyle = "#ff5a5a";
      drawRoundedRect(ctx, centerX - size * 0.24, y + size * 0.62, size * 0.48, 5, 2, ctx.fillStyle);
    }

    if (style.ten) {
      ctx.fillStyle = style.accent;
      drawRoundedRect(ctx, x + 3, y + 3, size - 6, 6, 3, ctx.fillStyle);
      ctx.fillStyle = style.outline;
      ctx.font = '800 12px "Baloo 2", "Fredoka", "Trebuchet MS", "Noto Sans KR", sans-serif';
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("10", centerX, y + size - 8);
    } else if (style.number >= 4 && style.showNumber) {
      ctx.fillStyle = "rgba(20,31,79,0.82)";
      ctx.font = '800 11px "Baloo 2", "Fredoka", "Trebuchet MS", "Noto Sans KR", sans-serif';
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(style.number), centerX, y + size - 8);
    }
  };

  Renderer.prototype.drawSnake = function drawSnake(renderSnake, _theme, timeMs) {
    if (!renderSnake || !renderSnake.segments || renderSnake.segments.length === 0) {
      return;
    }

    this.withWorldTransform(
      function drawSnakeWorld(ctx) {
        var segments = renderSnake.segments.filter(function keepSegment(segment) {
          return (
            segment &&
            Number.isFinite(segment.x) &&
            Number.isFinite(segment.y)
          );
        });
        if (segments.length === 0) {
          return;
        }

        var style = this.getNumberblockStyle(segments.length);
        var roundedLength = Math.max(1, Math.round(segments.length));
        if (roundedLength !== this.lastMorphLength) {
          this.lastMorphLength = roundedLength;
          this.morphUntilMs = timeMs + 360;
        }

        for (var i = segments.length - 1; i > 0; i -= 1) {
          var segment = segments[i];
          this.drawNumberblockSegment(ctx, segment, style, i);
        }

        this.drawNumberblockSegment(ctx, segments[0], style, 0);
        this.drawNumberblockFace(ctx, segments[0], renderSnake.direction, style, timeMs);

        if (timeMs < this.morphUntilMs) {
          var head = segments[0];
          var cx = head.x * TILE_SIZE + TILE_SIZE / 2;
          var cy = head.y * TILE_SIZE + TILE_SIZE / 2;
          var alpha = clamp((this.morphUntilMs - timeMs) / 360, 0, 1) * 0.45;
          ctx.globalAlpha = alpha;
          ctx.strokeStyle = style.accent;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(cx, cy, TILE_SIZE * 0.58, 0, Math.PI * 2);
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
      }.bind(this)
    );
  };

  Renderer.prototype.drawCharacterCompanion = function drawCharacterCompanion(game, _theme, timeMs) {
    if (!game || !game.snake) {
      return;
    }

    var length = game.getCurrentSnakeLength ? game.getCurrentSnakeLength() : game.snake.segments.length;
    var style = this.getNumberblockStyle(length);
    var stageCharacter = game.getCurrentCharacter ? game.getCurrentCharacter() : null;
    var powers = game.getPowerState ? game.getPowerState() : { starMoves: 0 };
    var lang = game.settings && game.settings.language === "en" ? "en" : "ko";

    this.withWorldTransform(function drawCompanion(ctx) {
      var cardW = 184;
      var cardH = 82;
      var cardX = CANVAS_WIDTH - cardW - 10;
      var cardY = 10;

      ctx.fillStyle = "rgba(11, 22, 64, 0.46)";
      drawRoundedRect(ctx, cardX + 2, cardY + 2, cardW, cardH, 12, ctx.fillStyle);

      ctx.fillStyle = "rgba(255,255,255,0.94)";
      drawRoundedRect(ctx, cardX, cardY, cardW, cardH, 12, ctx.fillStyle);
      ctx.strokeStyle = "rgba(26, 44, 112, 0.5)";
      ctx.lineWidth = 2;
      ctx.strokeRect(cardX + 1, cardY + 1, cardW - 2, cardH - 2);

      var blockX = cardX + 8;
      var blockY = cardY + 12;
      var blockSize = 52;

      if (style.circle) {
        ctx.fillStyle = style.body;
        ctx.beginPath();
        ctx.arc(blockX + blockSize / 2, blockY + blockSize / 2, blockSize / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = style.outline;
        ctx.lineWidth = 2;
        ctx.stroke();
      } else {
        drawRoundedRect(ctx, blockX, blockY, blockSize, blockSize, 9, style.body);
        ctx.fillStyle = "rgba(255,255,255,0.22)";
        drawRoundedRect(ctx, blockX + 3, blockY + 3, blockSize - 6, 9, 4, ctx.fillStyle);
      }

      var eyeShift = Math.sin(timeMs * 0.006) * 1.2;
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(blockX + 18, blockY + 23, 5.1, 0, Math.PI * 2);
      ctx.arc(blockX + 34, blockY + 23, 5.1, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#1a2452";
      ctx.beginPath();
      ctx.arc(blockX + 18 + eyeShift, blockY + 23, 2.1, 0, Math.PI * 2);
      ctx.arc(blockX + 34 + eyeShift, blockY + 23, 2.1, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = "#1a2452";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(blockX + blockSize / 2, blockY + 37, 8, 0.15, Math.PI - 0.15);
      ctx.stroke();

      if (style.ten) {
        ctx.fillStyle = style.accent;
        drawRoundedRect(ctx, blockX + 4, blockY + 4, blockSize - 8, 6, 3, ctx.fillStyle);
      }

      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillStyle = style.accent;
      ctx.font = '800 12px "Trebuchet MS", "Noto Sans KR", sans-serif';
      ctx.fillText("FORM NO." + style.number, cardX + 70, cardY + 10);

      ctx.fillStyle = "#1b2c64";
      ctx.font = '700 13px "Trebuchet MS", "Noto Sans KR", sans-serif';
      ctx.fillText(
        lang === "en" ? ("Length " + length + " Morph") : ("길이 " + length + " 변신"),
        cardX + 70,
        cardY + 30
      );

      ctx.fillStyle = "#4051a8";
      ctx.font = '600 11px "Trebuchet MS", "Noto Sans KR", sans-serif';
      if (stageCharacter) {
        ctx.fillText(
          (lang === "en" ? "Stage Buddy " : "스테이지 버디 ") + stageCharacter.number,
          cardX + 70,
          cardY + 50
        );
      }

      if (powers.starMoves > 0) {
        ctx.fillStyle = "#19b7ff";
        ctx.font = '700 11px "Trebuchet MS", "Noto Sans KR", sans-serif';
        ctx.fillText(
          (lang === "en" ? "STAR " : "스타 ") + powers.starMoves + (lang === "en" ? " turns" : "턴"),
          cardX + 70,
          cardY + 65
        );
      }
    });
  };

  Renderer.prototype.drawBlockedFeedback = function drawBlockedFeedback(feedback, timeMs) {
    if (!feedback) {
      return;
    }

    var fade = clamp((feedback.until - timeMs) / (feedback.until - feedback.startedAt), 0, 1);
    var tile = feedback.tile;

    this.withWorldTransform(function drawFeedbackWorld(ctx) {
      var x = tile.x * TILE_SIZE;
      var y = tile.y * TILE_SIZE;
      ctx.globalAlpha = 0.65 * fade;
      ctx.fillStyle = "#ff4d4d";
      ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
      ctx.globalAlpha = 1;
    });
  };

  Renderer.prototype.drawHint = function drawHint(game, theme, timeMs) {
    if (!game.getDeadlockHintVisible(timeMs)) {
      return;
    }

    this.withWorldTransform(function drawHintWorld(ctx) {
      ctx.fillStyle = "rgba(0,0,0,0.52)";
      drawRoundedRect(ctx, 212, CANVAS_HEIGHT - 66, 376, 42, 10, ctx.fillStyle);
      ctx.fillStyle = theme.text;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = '700 18px "Noto Sans KR", "Apple SD Gothic Neo", sans-serif';
      ctx.fillText(
        game.settings.language === "en"
          ? "No moves left. Press Z to undo or R to restart"
          : "막혔습니다. Z로 되돌리거나 R로 재시작하세요",
        CANVAS_WIDTH / 2,
        CANVAS_HEIGHT - 45
      );
    });
  };

  Renderer.prototype.drawPowerAuras = function drawPowerAuras(game, theme, timeMs) {
    if (!game || !game.snake || !game.getPowerState) {
      return;
    }

    var powers = game.getPowerState();
    if (!powers || powers.starMoves <= 0) {
      return;
    }

    var segments = game.snake.segments;
    if (!segments || segments.length === 0) {
      return;
    }

    this.withWorldTransform(function drawAura(ctx) {
      var pulse = 0.84 + 0.16 * Math.sin(timeMs * 0.016);
      var baseAlpha = 0.36 + 0.22 * Math.sin(timeMs * 0.013);
      var auraColor = theme.itemStarGlow || "#49d8ff";
      var bodyGlow = theme.itemStarBodyGlow || "#ffe34e";

      // 몸통 세그먼트 빛남 (뒤에서 앞으로, 뒤쪽일수록 흐리게)
      for (var i = segments.length - 1; i > 0; i -= 1) {
        var seg = segments[i];
        var segCx = seg.x * TILE_SIZE + TILE_SIZE / 2;
        var segCy = seg.y * TILE_SIZE + TILE_SIZE / 2;
        var fadeRatio = 1 - (i / segments.length) * 0.6;
        ctx.globalAlpha = baseAlpha * 0.4 * fadeRatio;
        ctx.fillStyle = bodyGlow;
        ctx.beginPath();
        ctx.arc(segCx, segCy, TILE_SIZE * 0.38 * pulse, 0, Math.PI * 2);
        ctx.fill();
      }

      // 머리 오라 (기존 + 강화)
      var head = segments[0];
      var cx = head.x * TILE_SIZE + TILE_SIZE / 2;
      var cy = head.y * TILE_SIZE + TILE_SIZE / 2;

      ctx.globalAlpha = baseAlpha;
      ctx.strokeStyle = auraColor;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(cx, cy, TILE_SIZE * (0.48 + pulse * 0.2), 0, Math.PI * 2);
      ctx.stroke();

      ctx.globalAlpha = baseAlpha * 0.55;
      ctx.beginPath();
      ctx.arc(cx, cy, TILE_SIZE * 0.3, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    });
  };

  Renderer.prototype.drawMoveHints = function drawMoveHints(game, theme, timeMs) {
    if (!(game.settings && game.settings.showMoveHints)) {
      return;
    }
    if (game.state !== GAME_STATE.PLAYING || !game.snake) {
      return;
    }

    var valid = game.getValidMoveDirections();
    if (!valid.length) {
      return;
    }

    var alpha = 0.45 + 0.25 * Math.sin(timeMs * 0.012);
    var head = game.snake.getHead();
    var cx = head.x * TILE_SIZE + TILE_SIZE / 2;
    var cy = head.y * TILE_SIZE + TILE_SIZE / 2;

    this.withWorldTransform(function drawHints(ctx) {
      ctx.fillStyle = theme.exitGlow;
      ctx.globalAlpha = alpha;
      for (var i = 0; i < valid.length; i += 1) {
        var dir = DIRECTIONS[valid[i]];
        var tx = cx + dir.x * (TILE_SIZE * 0.68);
        var ty = cy + dir.y * (TILE_SIZE * 0.68);
        ctx.beginPath();
        ctx.moveTo(tx, ty);
        ctx.lineTo(tx - dir.y * 7 - dir.x * 4, ty + dir.x * 7 - dir.y * 4);
        ctx.lineTo(tx + dir.y * 7 - dir.x * 4, ty - dir.x * 7 - dir.y * 4);
        ctx.closePath();
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    });
  };

  Renderer.prototype.drawOverlayText = function drawOverlayText(theme, data) {
    if (!data) {
      return;
    }

    var maxW = CANVAS_WIDTH * 0.85;
    var cx = CANVAS_WIDTH / 2;

    this.withWorldTransform(function drawOverlayWorld(ctx) {
      ctx.fillStyle = theme.overlay;
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      ctx.fillStyle = theme.text;
      ctx.font = '800 54px "Noto Sans KR", "Apple SD Gothic Neo", "Trebuchet MS", sans-serif';
      wrapText(ctx, data.title, cx, CANVAS_HEIGHT / 2 - 84, maxW, 60);

      ctx.font = '700 26px "Noto Sans KR", "Apple SD Gothic Neo", "Trebuchet MS", sans-serif';
      wrapText(ctx, data.subtitle, cx, CANVAS_HEIGHT / 2 - 26, maxW, 32);

      ctx.font = '500 20px "Noto Sans KR", "Apple SD Gothic Neo", sans-serif';
      wrapText(ctx, data.detail, cx, CANVAS_HEIGHT / 2 + 20, maxW, 26);

      ctx.font = '500 17px "Noto Sans KR", "Apple SD Gothic Neo", sans-serif';
      wrapText(ctx, data.extra, cx, CANVAS_HEIGHT / 2 + 56, maxW, 22);
    });
  };

  Renderer.prototype.drawPerfOverlay = function drawPerfOverlay(perfData, theme) {
    if (!perfData) {
      return;
    }

    this.withWorldTransform(function drawPerf(ctx) {
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      drawRoundedRect(ctx, 10, 10, 230, 102, 8, ctx.fillStyle);

      ctx.fillStyle = theme.text;
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.font = '600 15px "JetBrains Mono", "Courier New", monospace';
      ctx.fillText("FPS: " + perfData.fps, 18, 18);
      ctx.fillText("Frame: " + perfData.frameMs.toFixed(2) + "ms", 18, 40);
      ctx.fillText("Input: " + perfData.inputLatency + "ms", 18, 62);
      ctx.fillText("History: " + perfData.historySize, 18, 84);
      ctx.fillText("Discarded: " + perfData.discardedHistoryCount, 120, 84);
    });
  };

  /**
   * 아이템 수집 시 파티클 이펙트를 생성한다.
   * @param {number} tileX - 타일 X 좌표
   * @param {number} tileY - 타일 Y 좌표
   * @param {string} color - 파티클 색상
   * @param {number} count - 파티클 개수
   */
  Renderer.prototype.spawnItemParticles = function spawnItemParticles(tileX, tileY, color, count) {
    var cx = tileX * TILE_SIZE + TILE_SIZE / 2;
    var cy = tileY * TILE_SIZE + TILE_SIZE / 2;
    var particleCount = count || 8;
    for (var i = 0; i < particleCount; i += 1) {
      var angle = (Math.PI * 2 * i) / particleCount + (Math.random() - 0.5) * 0.4;
      var speed = 40 + Math.random() * 60;
      this.vfxParticles.push({
        x: cx,
        y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1,
        maxLife: 1,
        decay: 1.5 + Math.random() * 0.8,
        color: color || "#ffdf00",
        size: 2.5 + Math.random() * 2,
      });
    }
  };

  /**
   * 포털 워프 플래시 이펙트를 트리거한다.
   * @param {number} tileX - 도착 타일 X
   * @param {number} tileY - 도착 타일 Y
   * @param {string} color - 포털 색상
   * @param {number} timeMs - 현재 시간
   */
  Renderer.prototype.triggerPortalFlash = function triggerPortalFlash(tileX, tileY, color, timeMs) {
    this.vfxPortalFlash = {
      x: tileX * TILE_SIZE + TILE_SIZE / 2,
      y: tileY * TILE_SIZE + TILE_SIZE / 2,
      startMs: timeMs,
      durationMs: 320,
      color: color || "#37e5ff",
    };
    // 포털 도착지에도 파티클
    this.spawnItemParticles(tileX, tileY, color || "#37e5ff", 6);
  };

  /**
   * VFX 파티클 업데이트 + 렌더링
   */
  Renderer.prototype.drawVFX = function drawVFX(timeMs, deltaS) {
    var particles = this.vfxParticles;
    var flash = this.vfxPortalFlash;
    var self = this;

    if (particles.length === 0 && !flash) {
      return;
    }

    this.withWorldTransform(function drawVFXWorld(ctx) {
      // 파티클
      var alive = [];
      for (var i = 0; i < particles.length; i += 1) {
        var p = particles[i];
        p.life -= p.decay * deltaS;
        if (p.life <= 0) {
          continue;
        }
        p.x += p.vx * deltaS;
        p.y += p.vy * deltaS;
        p.vy += 60 * deltaS; // 약간의 중력
        var ratio = p.life / p.maxLife;
        ctx.globalAlpha = ratio * 0.85;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * ratio, 0, Math.PI * 2);
        ctx.fill();
        alive.push(p);
      }
      self.vfxParticles = alive;

      // 포털 플래시
      if (flash) {
        var elapsed = timeMs - flash.startMs;
        if (elapsed < flash.durationMs) {
          var t = elapsed / flash.durationMs;
          var radius = TILE_SIZE * (0.5 + t * 2.5);
          var alpha = 0.55 * (1 - t);
          ctx.globalAlpha = alpha;
          ctx.strokeStyle = flash.color;
          ctx.lineWidth = 4 * (1 - t);
          ctx.beginPath();
          ctx.arc(flash.x, flash.y, radius, 0, Math.PI * 2);
          ctx.stroke();
        } else {
          self.vfxPortalFlash = null;
        }
      }

      ctx.globalAlpha = 1;
    });
  };

  Renderer.prototype.draw = function draw(game, timeMs) {
    var frameStart = global.performance && performance.now ? performance.now() : Date.now();
    var theme = game.getCurrentTheme();
    var offset = game.getScreenShakeOffset(timeMs);
    var perfMode = game.settings ? game.settings.mobilePerformanceMode : "auto";
    var isMobile = global.matchMedia && global.matchMedia("(max-width: 960px)").matches;
    var batteryMode = perfMode === "battery" || (perfMode === "auto" && isMobile);
    this.runtimeSettings = {
      colorBlindAssist: !!(game.settings && game.settings.colorBlindAssist),
      flatFloor: batteryMode,
    };

    this.withScreenShake(offset, function withShake() {
      this.clear(theme);
      this.drawFloor(theme);

      if (game.currentLevel) {
        this.drawLevel(game.currentLevel, theme, timeMs);
      }

      var renderSnake = game.getRenderSnake(timeMs);
      this.drawSnake(renderSnake, theme, timeMs);
      this.drawPowerAuras(game, theme, timeMs);
      this.drawMoveHints(game, theme, timeMs);
      this.drawBlockedFeedback(game.consumeFeedback(timeMs), timeMs);
      var deltaS = Math.min(0.05, (timeMs - (this._lastDrawMs || timeMs)) / 1000);
      this.drawVFX(timeMs, deltaS || 0.016);
      this._lastDrawMs = timeMs;
      this.drawHint(game, theme, timeMs);

      if (game.state !== GAME_STATE.PLAYING) {
        this.drawOverlayText(theme, game.getStateOverlayData());
      }
    }.bind(this));

    var perfState = this.getPerfSnapshot();
    var gamePerf = game.getPerfSnapshot();
    var mergedPerf = {
      fps: perfState.fps,
      frameMs: perfState.frameMs,
      inputLatency: Math.round(gamePerf.lastInputLatencyMs || 0),
      historySize: gamePerf.historySize || 0,
      discardedHistoryCount: gamePerf.discardedHistoryCount || 0,
    };

    if (game.settings.showPerfOverlay) {
      this.drawPerfOverlay(mergedPerf, theme);
    }

    this.recordFrame(frameStart, global.performance && performance.now ? performance.now() : Date.now());
  };

  global.WormGameRenderer = Renderer;
})(window);
