/**
 * replay-ui.js — 리플레이 디버그 UI 모듈
 * DEV-01: main.js에서 분리.
 *
 * 의존성: WormGameConstants (TILE, TILE_SIZE, GRID_COLS, GRID_ROWS, CANVAS_WIDTH, CANVAS_HEIGHT)
 * 사용: main.js에서 createReplayUI()로 인스턴스 생성 후 update() 호출
 */
(function attachReplayUI(global) {
  "use strict";

  var constants = global.WormGameConstants;
  var TILE = constants.TILE;
  var TILE_SIZE = constants.TILE_SIZE;
  var GRID_COLS = constants.GRID_COLS;
  var GRID_ROWS = constants.GRID_ROWS;
  var CANVAS_WIDTH = constants.CANVAS_WIDTH;
  var CANVAS_HEIGHT = constants.CANVAS_HEIGHT;
  var clamp = constants.clamp;

  /**
   * 리플레이 미리보기 캔버스에 타일맵 + 스네이크를 그린다.
   */
  function drawPreview(replayCanvas, state, replay, theme) {
    var ctx = replayCanvas.getContext("2d");
    ctx.clearRect(0, 0, replayCanvas.width, replayCanvas.height);

    if (!state || !replay) {
      ctx.fillStyle = "#8fd8ff";
      ctx.fillRect(0, 0, replayCanvas.width, replayCanvas.height);
      return;
    }

    var sx = replayCanvas.width / CANVAS_WIDTH;
    var sy = replayCanvas.height / CANVAS_HEIGHT;
    ctx.save();
    ctx.setTransform(sx, 0, 0, sy, 0, 0);

    var tiles = replay.startTiles;
    for (var y = 0; y < GRID_ROWS; y += 1) {
      for (var x = 0; x < GRID_COLS; x += 1) {
        var tile = tiles[y][x];
        var px = x * TILE_SIZE;
        var py = y * TILE_SIZE;

        ctx.fillStyle = (x + y) % 2 === 0 ? theme.floorA : theme.floorB;
        ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);

        if (tile === TILE.WALL) {
          ctx.fillStyle = theme.wall;
          ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
        } else if (tile === TILE.OBSTACLE) {
          ctx.fillStyle = theme.obstacle;
          ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
        } else if (tile === TILE.EXIT) {
          ctx.fillStyle = theme.exitCore;
          ctx.beginPath();
          ctx.arc(px + TILE_SIZE / 2, py + TILE_SIZE / 2, TILE_SIZE * 0.22, 0, Math.PI * 2);
          ctx.fill();
        } else if (tile === TILE.ITEM) {
          ctx.fillStyle = theme.itemCore;
          ctx.beginPath();
          ctx.arc(px + TILE_SIZE / 2, py + TILE_SIZE / 2, TILE_SIZE * 0.18, 0, Math.PI * 2);
          ctx.fill();
        } else if (tile === TILE.BIG_ITEM) {
          ctx.fillStyle = theme.itemBigCore || "#ff9e38";
          ctx.beginPath();
          ctx.arc(px + TILE_SIZE / 2, py + TILE_SIZE / 2, TILE_SIZE * 0.22, 0, Math.PI * 2);
          ctx.fill();
        } else if (tile === TILE.STAR_ITEM) {
          ctx.fillStyle = theme.itemStarCore || "#ffffff";
          ctx.beginPath();
          ctx.arc(px + TILE_SIZE / 2, py + TILE_SIZE / 2, TILE_SIZE * 0.2, 0, Math.PI * 2);
          ctx.fill();
        } else if (tile === TILE.PORTAL_A || tile === TILE.PORTAL_B) {
          ctx.strokeStyle =
            tile === TILE.PORTAL_A
              ? theme.portalA || "#37e5ff"
              : theme.portalB || "#ff6fd7";
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(px + TILE_SIZE / 2, py + TILE_SIZE / 2, TILE_SIZE * 0.22, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
    }

    var segments = state.segments;
    for (var i = segments.length - 1; i > 0; i -= 1) {
      var seg = segments[i];
      ctx.fillStyle = i % 2 === 0 ? theme.snakeBody : theme.snakeBodyAlt || theme.snakeBody;
      ctx.fillRect(seg.x * TILE_SIZE + 8, seg.y * TILE_SIZE + 8, TILE_SIZE - 16, TILE_SIZE - 16);
    }

    var head = segments[0];
    if (head) {
      ctx.fillStyle = theme.snakeHead;
      ctx.fillRect(head.x * TILE_SIZE + 6, head.y * TILE_SIZE + 6, TILE_SIZE - 12, TILE_SIZE - 12);
    }

    ctx.restore();
  }

  /**
   * 리플레이 디버그 UI 컨트롤러 팩토리.
   * @param {object} deps - DOM refs 및 game, t, directionLabel, setText 함수
   */
  function createReplayUI(deps) {
    var game = deps.game;
    var t = deps.t;
    var setText = deps.setText;
    var directionLabel = deps.directionLabel;
    var replayCanvas = deps.replayCanvas;
    var replayStepRange = deps.replayStepRange;
    var replayStepPrevBtn = deps.replayStepPrevBtn;
    var replayStepNextBtn = deps.replayStepNextBtn;
    var replayStepLatestBtn = deps.replayStepLatestBtn;
    var replayStepLabel = deps.replayStepLabel;
    var replayMeta = deps.replayMeta;

    var stepIndex = 0;
    var levelId = 0;

    function update(forceLatest) {
      if (!game.settings.replayDebugEnabled) {
        return;
      }

      var replay = game.getReplayArchive();
      if (!replay) {
        levelId = 0;
        stepIndex = 0;
        replayStepRange.max = "0";
        replayStepRange.value = "0";
        replayStepRange.disabled = true;
        replayStepPrevBtn.disabled = true;
        replayStepNextBtn.disabled = true;
        replayStepLatestBtn.disabled = true;
        setText(replayStepLabel, t("replayStep", { step: 0, total: 0 }));
        setText(replayMeta, t("replayNoData"));
        drawPreview(replayCanvas, null, null, {});
        return;
      }

      if (levelId !== replay.levelId || forceLatest) {
        levelId = replay.levelId;
        stepIndex = replay.moves.length;
      }

      stepIndex = clamp(stepIndex, 0, replay.moves.length);

      replayStepRange.max = String(replay.moves.length);
      replayStepRange.value = String(stepIndex);
      replayStepRange.disabled = replay.moves.length === 0;

      replayStepPrevBtn.disabled = stepIndex <= 0;
      replayStepNextBtn.disabled = stepIndex >= replay.moves.length;
      replayStepLatestBtn.disabled = stepIndex >= replay.moves.length;

      var state = game.getReplayDebugState(stepIndex);
      setText(
        replayStepLabel,
        t("replayStep", { step: stepIndex, total: replay.moves.length })
      );
      setText(
        replayMeta,
        t("replayMeta", {
          direction: directionLabel(state ? state.direction : null),
          step: stepIndex,
          total: replay.moves.length,
        })
      );

      drawPreview(replayCanvas, state, replay, game.getCurrentTheme());
    }

    function prevStep() {
      stepIndex = Math.max(0, stepIndex - 1);
      update(false);
    }

    function nextStep() {
      stepIndex += 1;
      update(false);
    }

    function goLatest() {
      update(true);
    }

    function setStepFromRange() {
      stepIndex = Number(replayStepRange.value) || 0;
      update(false);
    }

    function getStepIndex() {
      return stepIndex;
    }

    return {
      update: update,
      prevStep: prevStep,
      nextStep: nextStep,
      goLatest: goLatest,
      setStepFromRange: setStepFromRange,
      getStepIndex: getStepIndex,
    };
  }

  global.WormGameReplayUI = createReplayUI;
})(window);
