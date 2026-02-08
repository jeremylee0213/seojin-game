/**
 * snake.js — Snake 클래스 (세그먼트 이동/성장/스냅샷)
 *
 * @module  WormGameSnake
 * @depends WormGameConstants (TILE, pointKey, isWalkableTile)
 * @exports global.WormGameSnake
 *
 * ES Module 전환 시: import { TILE, pointKey, isWalkableTile } from './constants.js'
 */
(function attachSnake(global) {
  "use strict";

  var constants = global.WormGameConstants;
  var TILE = constants.TILE;
  var DIRECTIONS = constants.DIRECTIONS;
  var GRID_COLS = constants.GRID_COLS;
  var GRID_ROWS = constants.GRID_ROWS;

  function pointKey(x, y) {
    return x + "," + y;
  }

  function isWalkable(tiles, x, y) {
    if (x < 0 || y < 0 || x >= GRID_COLS || y >= GRID_ROWS) {
      return false;
    }
    var tile = tiles[y][x];
    return tile !== TILE.WALL && tile !== TILE.OBSTACLE;
  }

  function buildInitialSegments(spawn, length, tiles) {
    var path = [{ x: spawn.x, y: spawn.y }];
    var visited = new Set([pointKey(spawn.x, spawn.y)]);
    var baseOrder = ["right", "down", "left", "up"];

    function countOpenNeighbors(x, y) {
      var count = 0;
      for (var i = 0; i < baseOrder.length; i += 1) {
        var dir = DIRECTIONS[baseOrder[i]];
        var nx = x + dir.x;
        var ny = y + dir.y;
        if (isWalkable(tiles, nx, ny) && !visited.has(pointKey(nx, ny))) {
          count += 1;
        }
      }
      return count;
    }

    function dfs(x, y) {
      if (path.length >= length) {
        return true;
      }

      var options = [];
      for (var i = 0; i < baseOrder.length; i += 1) {
        var dirName = baseOrder[i];
        var dir = DIRECTIONS[dirName];
        var nx = x + dir.x;
        var ny = y + dir.y;
        var key = pointKey(nx, ny);

        if (visited.has(key) || !isWalkable(tiles, nx, ny)) {
          continue;
        }

        options.push({
          name: dirName,
          score: countOpenNeighbors(nx, ny),
        });
      }

      options.sort(function sortByOpenness(a, b) {
        return b.score - a.score;
      });

      for (var j = 0; j < options.length; j += 1) {
        var bestDirName = options[j].name;
        var bestDir = DIRECTIONS[bestDirName];
        var nextX = x + bestDir.x;
        var nextY = y + bestDir.y;
        var nextKey = pointKey(nextX, nextY);

        visited.add(nextKey);
        path.push({ x: nextX, y: nextY });

        if (dfs(nextX, nextY)) {
          return true;
        }

        path.pop();
        visited.delete(nextKey);
      }

      return false;
    }

    dfs(spawn.x, spawn.y);

    while (path.length < length) {
      var tail = path[path.length - 1];
      path.push({ x: tail.x, y: tail.y });
    }

    return path;
  }

  function Snake(spawn, length, tiles) {
    this.segments = buildInitialSegments(spawn, length, tiles);
    this.direction = "right";
  }

  Snake.prototype.getHead = function getHead() {
    return this.segments[0];
  };

  Snake.prototype.cloneSegments = function cloneSegments() {
    return this.segments.map(function mapSegment(segment) {
      return { x: segment.x, y: segment.y };
    });
  };

  Snake.prototype.getSnapshot = function getSnapshot() {
    return {
      direction: this.direction,
      segments: this.cloneSegments(),
    };
  };

  Snake.prototype.restoreSnapshot = function restoreSnapshot(snapshot) {
    this.direction = snapshot.direction;
    this.segments = snapshot.segments.map(function mapSegment(segment) {
      return { x: segment.x, y: segment.y };
    });
  };

  Snake.prototype.occupies = function occupies(x, y, ignoreTail) {
    var segmentCount = this.segments.length;
    var end = ignoreTail ? segmentCount - 1 : segmentCount;

    for (var i = 0; i < end; i += 1) {
      var segment = this.segments[i];
      if (segment.x === x && segment.y === y) {
        return true;
      }
    }

    return false;
  };

  Snake.prototype.move = function move(directionName) {
    var direction = DIRECTIONS[directionName];
    if (!direction) {
      return;
    }

    var head = this.getHead();
    var nextHead = {
      x: head.x + direction.x,
      y: head.y + direction.y,
    };

    this.segments.unshift(nextHead);
    this.segments.pop();
    this.direction = directionName;
  };

  Snake.prototype.growByTailPosition = function growByTailPosition(tailPosition) {
    var source = tailPosition || this.segments[this.segments.length - 1];
    this.segments.push({ x: source.x, y: source.y });
  };

  global.WormGameSnake = Snake;
})(window);
