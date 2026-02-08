/**
 * character-preview.js — 넘버블럭스 캐릭터 프리뷰 모듈
 * DEV-01: main.js에서 분리.
 *
 * 의존성: WormGameRenderer (getNumberblockStyle)
 * 사용: main.js에서 drawCharacterPreview()로 호출
 */
(function attachCharacterPreview(global) {
  "use strict";

  function drawOctagon(ctx, cx, cy, radius) {
    ctx.beginPath();
    for (var i = 0; i < 8; i += 1) {
      var angle = Math.PI / 8 + (Math.PI * 2 * i) / 8;
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

  function drawStar(ctx, cx, cy, outer, inner) {
    ctx.beginPath();
    for (var i = 0; i < 10; i += 1) {
      var angle = -Math.PI / 2 + (Math.PI * i) / 5;
      var radius = i % 2 === 0 ? outer : inner;
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

  /**
   * 캐릭터 프리뷰 캔버스에 넘버블럭스 스타일 캐릭터를 그린다.
   * 모든 좌표를 size 기준 비율로 계산하여 캔버스 크기 변경에 자동 대응.
   *
   * @param {HTMLCanvasElement} canvasEl - 프리뷰 캔버스 (72×72 등)
   * @param {number} length - 현재 뱀 길이 (= 넘버블럭 번호)
   * @param {object|null} renderer - WormGameRenderer 인스턴스 (getNumberblockStyle 사용)
   */
  function drawCharacterPreview(canvasEl, length, renderer) {
    if (!canvasEl || !canvasEl.getContext) {
      return;
    }

    var ctx = canvasEl.getContext("2d");
    var safeLength = Math.max(1, Number(length) || 1);
    var style =
      renderer && renderer.getNumberblockStyle
        ? renderer.getNumberblockStyle(safeLength)
        : { body: "#ff4a4a", shade: "#d93f3f", outline: "#7b1d1d", accent: "#ff5c5c" };
    var size = canvasEl.width;
    var s = size / 128;           // 비율 스케일 (128 기준)
    var cx = size / 2;
    var cy = size / 2;
    var margin = 12 * s;
    var bodySize = size - margin * 2;
    var bodyX = margin;
    var bodyY = margin;
    var lw = Math.max(1.5, 3 * s); // 선 굵기 스케일

    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = "#e8f3ff";
    ctx.fillRect(0, 0, size, size);

    if (style.circle) {
      ctx.fillStyle = style.body;
      ctx.beginPath();
      ctx.arc(cx, cy, bodySize / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = style.outline;
      ctx.lineWidth = lw;
      ctx.stroke();
    } else if (style.octagon) {
      ctx.fillStyle = style.body;
      drawOctagon(ctx, cx, cy, bodySize / 2);
      ctx.fill();
      ctx.strokeStyle = style.outline;
      ctx.lineWidth = lw;
      ctx.stroke();
      if (style.mask) {
        ctx.fillStyle = style.mask;
        ctx.fillRect(cx - 28 * s, cy - 18 * s, 56 * s, 16 * s);
      }
    } else {
      if (style.rainbow && style.rainbowPalette && style.rainbowPalette.length) {
        var stripeH = bodySize / style.rainbowPalette.length;
        for (var si = 0; si < style.rainbowPalette.length; si += 1) {
          ctx.fillStyle = style.rainbowPalette[si];
          ctx.fillRect(bodyX, bodyY + si * stripeH, bodySize, stripeH + 1);
        }
      }
      ctx.fillStyle = style.body;
      ctx.fillRect(bodyX, bodyY, bodySize, bodySize);
      ctx.strokeStyle = style.outline;
      ctx.lineWidth = lw;
      ctx.strokeRect(bodyX, bodyY, bodySize, bodySize);
      if (style.ten) {
        ctx.fillStyle = style.accent;
        ctx.fillRect(bodyX + 3 * s, bodyY + 3 * s, bodySize - 6 * s, 7 * s);
      }
    }

    // Eyes
    var eyeY = cy - 10 * s;
    var eyeGap = 12 * s;
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    if (style.oneEye) {
      ctx.arc(cx, eyeY, 8 * s, 0, Math.PI * 2);
    } else {
      ctx.arc(cx - eyeGap, eyeY, 6.5 * s, 0, Math.PI * 2);
      ctx.arc(cx + eyeGap, eyeY, 6.5 * s, 0, Math.PI * 2);
    }
    ctx.fill();

    // Pupils
    ctx.fillStyle = "#13234d";
    ctx.beginPath();
    if (style.oneEye) {
      ctx.arc(cx, eyeY, 3 * s, 0, Math.PI * 2);
    } else {
      ctx.arc(cx - eyeGap, eyeY, 2.6 * s, 0, Math.PI * 2);
      ctx.arc(cx + eyeGap, eyeY, 2.6 * s, 0, Math.PI * 2);
    }
    ctx.fill();

    // Mouth
    ctx.strokeStyle = "#13234d";
    ctx.lineWidth = Math.max(1.2, 2.4 * s);
    ctx.beginPath();
    ctx.arc(cx, cy + 9 * s, 10 * s, 0.18, Math.PI - 0.18);
    ctx.stroke();

    // Rainbow star decoration
    if (style.rainbow) {
      ctx.fillStyle = "#ffe34e";
      drawStar(ctx, cx + 22 * s, cy - 24 * s, 7 * s, 3.2 * s);
      ctx.fill();
    }

    // Number label
    var fontSize = Math.max(8, Math.round(15 * s));
    ctx.fillStyle = "#162f7d";
    ctx.font = '800 ' + fontSize + 'px "Baloo 2", "Fredoka", "Trebuchet MS", sans-serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(safeLength), cx, cy + 27 * s);
  }

  global.WormGameCharacterPreview = drawCharacterPreview;
})(window);
