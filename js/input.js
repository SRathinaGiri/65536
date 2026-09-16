// Input manager for keyboard, touch swipe, and virtual D-pad
class InputManager {
  constructor(boardElement) {
    this.boardEl = boardElement;
    this.listeners = [];
    this.touchStartX = 0;
    this.touchStartY = 0;
    this.minSwipeDistance = 30; // Minimum px distance for swipe detection

    this.bindKeyboard();
    this.bindTouch();
  }

  on(event, callback) {
    this.listeners.push({ event, callback });
  }

  emit(event, data) {
    this.listeners
      .filter(l => l.event === event)
      .forEach(l => l.callback(data));
  }

  bindKeyboard() {
    const keyMap = {
      ArrowUp: 'up',
      KeyW: 'up',
      w: 'up',
      W: 'up',

      ArrowDown: 'down',
      KeyS: 'down',
      s: 'down',
      S: 'down',

      ArrowLeft: 'left',
      KeyA: 'left',
      a: 'left',
      A: 'left',

      ArrowRight: 'right',
      KeyD: 'right',
      d: 'right',
      D: 'right'
    };

    window.addEventListener('keydown', (e) => {
      // Ignore if typing in an input/modal
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) {
        return;
      }

      // Check undo shortcut (Ctrl+Z or 'u')
      if ((e.ctrlKey && e.key === 'z') || e.key === 'u' || e.key === 'U') {
        e.preventDefault();
        this.emit('undo');
        return;
      }

      const direction = keyMap[e.code] || keyMap[e.key];
      if (direction) {
        e.preventDefault();
        this.emit('move', direction);
      }
    });
  }

  bindTouch() {
    if (!this.boardEl) return;

    this.boardEl.addEventListener(
      'touchstart',
      (e) => {
        if (e.touches.length > 1) return;
        this.touchStartX = e.touches[0].clientX;
        this.touchStartY = e.touches[0].clientY;
      },
      { passive: false }
    );

    this.boardEl.addEventListener(
      'touchmove',
      (e) => {
        // Prevent screen scrolling when swiping inside the game board
        if (e.touches.length === 1) {
          e.preventDefault();
        }
      },
      { passive: false }
    );

    this.boardEl.addEventListener(
      'touchend',
      (e) => {
        if (e.changedTouches.length === 0) return;

        const touchEndX = e.changedTouches[0].clientX;
        const touchEndY = e.changedTouches[0].clientY;

        const dx = touchEndX - this.touchStartX;
        const dy = touchEndY - this.touchStartY;

        const absDx = Math.abs(dx);
        const absDy = Math.abs(dy);

        if (Math.max(absDx, absDy) > this.minSwipeDistance) {
          if (absDx > absDy) {
            // Horizontal swipe
            this.emit('move', dx > 0 ? 'right' : 'left');
          } else {
            // Vertical swipe
            this.emit('move', dy > 0 ? 'down' : 'up');
          }
        }
      },
      { passive: false }
    );
  }

  bindDpad(dpadContainer) {
    if (!dpadContainer) return;
    const buttons = dpadContainer.querySelectorAll('[data-dir]');
    buttons.forEach(btn => {
      const dir = btn.getAttribute('data-dir');
      const triggerMove = (e) => {
        e.preventDefault();
        this.emit('move', dir);
      };
      btn.addEventListener('click', triggerMove);
      btn.addEventListener('touchstart', triggerMove, { passive: false });
    });
  }
}

window.InputManager = InputManager;
