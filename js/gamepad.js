/**
 * gamepad.js — 게임패드 입력 처리 모듈
 * DEV-01: main.js에서 분리.
 *
 * 의존성: WormGameConstants (GAMEPLAY, ACTION, GAME_STATE)
 * 사용: main.js에서 createGamepadHandler()로 인스턴스 생성 후 frame()에서 process() 호출
 */
(function attachGamepad(global) {
  "use strict";

  var constants = global.WormGameConstants;
  var GAMEPLAY = constants.GAMEPLAY;
  var ACTION = constants.ACTION;
  var GAME_STATE = constants.GAME_STATE;

  /**
   * 게임패드 핸들러 팩토리.
   * @param {object} deps - { game, audio, onDirtyUI, onConfirmRestart }
   */
  function createGamepadHandler(deps) {
    var game = deps.game;
    var audio = deps.audio;
    var onDirtyUI = deps.onDirtyUI;
    var onConfirmRestart = deps.onConfirmRestart;

    var state = {
      connected: false,
      lastDirection: null,
      lastMoveAt: 0,
      buttonState: {},
    };

    function currentGamepad() {
      if (!navigator.getGamepads) {
        return null;
      }
      var pads = navigator.getGamepads();
      if (!pads) {
        return null;
      }
      for (var i = 0; i < pads.length; i += 1) {
        if (pads[i] && pads[i].connected) {
          return pads[i];
        }
      }
      return null;
    }

    function getDirection(pad) {
      if (!pad) {
        return null;
      }

      if (pad.buttons[12] && pad.buttons[12].pressed) {
        return "up";
      }
      if (pad.buttons[13] && pad.buttons[13].pressed) {
        return "down";
      }
      if (pad.buttons[14] && pad.buttons[14].pressed) {
        return "left";
      }
      if (pad.buttons[15] && pad.buttons[15].pressed) {
        return "right";
      }

      var x = pad.axes[0] || 0;
      var y = pad.axes[1] || 0;
      var deadzone = GAMEPLAY.GAMEPAD_DEADZONE;
      if (Math.abs(x) < deadzone && Math.abs(y) < deadzone) {
        return null;
      }

      if (Math.abs(x) > Math.abs(y)) {
        return x > 0 ? "right" : "left";
      }
      return y > 0 ? "down" : "up";
    }

    function handleAction(action, timestamp) {
      if (action === ACTION.RESTART) {
        onConfirmRestart();
        return;
      }
      game.handleAction(action, { inputAtMs: timestamp });
      onDirtyUI();
    }

    function processButtons(pad, timestamp) {
      var mappings = [
        { index: 0, action: ACTION.START },
        { index: 1, action: ACTION.UNDO },
        { index: 2, action: ACTION.RESTART },
        { index: 9, action: ACTION.PAUSE },
      ];

      for (var i = 0; i < mappings.length; i += 1) {
        var mapping = mappings[i];
        var btn = pad.buttons[mapping.index];
        var pressed = !!(btn && btn.pressed);
        var prev = !!state.buttonState[mapping.index];

        if (pressed && !prev) {
          audio.unlock();
          handleAction(mapping.action, timestamp);
        }

        state.buttonState[mapping.index] = pressed;
      }
    }

    function process(timestamp) {
      var pad = currentGamepad();
      if (!pad) {
        state.lastDirection = null;
        state.buttonState = {};
        return;
      }

      var direction = getDirection(pad);
      if (direction) {
        var shouldMove =
          direction !== state.lastDirection ||
          timestamp - state.lastMoveAt >= GAMEPLAY.GAMEPAD_REPEAT_MS;

        if (shouldMove && game.state === GAME_STATE.PLAYING) {
          audio.unlock();
          game.tryMove(direction, timestamp);
          state.lastMoveAt = timestamp;
          state.lastDirection = direction;
          onDirtyUI();
        }
      } else {
        state.lastDirection = null;
      }

      processButtons(pad, timestamp);
    }

    function onConnected() {
      state.connected = true;
    }

    function onDisconnected() {
      state.connected = false;
      state.lastDirection = null;
      state.buttonState = {};
    }

    function isConnected() {
      return state.connected;
    }

    return {
      process: process,
      onConnected: onConnected,
      onDisconnected: onDisconnected,
      isConnected: isConnected,
    };
  }

  global.WormGameGamepad = createGamepadHandler;
})(window);
