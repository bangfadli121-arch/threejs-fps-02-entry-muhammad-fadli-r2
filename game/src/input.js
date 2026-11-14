// Keyboard edges and pointer-lock look input.
export function createInput(canvas) {
  const keys = new Set();
  const pressed = new Set();
  const state = { keys, locked: false, firing: false, dx: 0, dy: 0 };
  window.addEventListener('keydown', (event) => {
    if (!keys.has(event.code)) pressed.add(event.code);
    keys.add(event.code);
    if (event.code === 'Space') event.preventDefault();
  });
  window.addEventListener('keyup', (event) => keys.delete(event.code));
  window.addEventListener('mousemove', (event) => {
    if (state.locked) {
      state.dx += event.movementX;
      state.dy += event.movementY;
    }
  });
  window.addEventListener('mousedown', (event) => {
    if (event.button === 0) state.firing = true;
    if (event.button === 2) pressed.add('MouseRight');
  });
  window.addEventListener('mouseup', (event) => {
    if (event.button === 0) state.firing = false;
  });
  window.addEventListener('contextmenu', (event) => event.preventDefault());
  window.addEventListener('blur', () => keys.clear());
  document.addEventListener('pointerlockchange', () => {
    state.locked = document.pointerLockElement === canvas;
    if (!state.locked) state.firing = false;
  });
  return {
    state,
    lock: () => canvas.requestPointerLock(),
    pressed(code) {
      if (!pressed.has(code)) return false;
      pressed.delete(code);
      return true;
    },
    look() {
      const result = [state.dx, state.dy];
      state.dx = 0;
      state.dy = 0;
      return result;
    },
  };
}
