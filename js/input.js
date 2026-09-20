// Input manager for keyboard, touch swipe, and virtual D-pad
class InputManager {
  constructor(boardElement) {
    this.boardEl = boardElement;
    this.listeners = [];
    this.touchStartX = 0;
    this.touchStartY = 0;
    this.mouseStartX = 0;
    this.mouseStartY = 0;
    this.isMouseDown = false;
    this.currentPreviewDir = null;
    this.minSwipeDistance = 30; // Minimum px distance for swipe detection
    this.previewThreshold = 6; // Minimum px distance to steer trajectory preview

    this.bindKeyboard();
    this.bindTouch();
    this.bindMouse();
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
        if (e.shiftKey) {
          // Shift + Arrow = preview without moving
          this.emit('previewMove', direction);
        } else {
          this.emit('clearPreview');
          this.emit('move', direction);
        }
      }
    });

    window.addEventListener('keyup', (e) => {
      if (['Shift', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'w', 'a', 's', 'd', 'W', 'A', 'S', 'D'].includes(e.key)) {
        this.emit('clearPreview');
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
        this.currentPreviewDir = null;
      },
      { passive: false }
    );

    this.boardEl.addEventListener(
      'touchmove',
      (e) => {
        // Prevent screen scrolling when swiping inside the game board
        if (e.touches.length === 1) {
          e.preventDefault();
          const dx = e.touches[0].clientX - this.touchStartX;
          const dy = e.touches[0].clientY - this.touchStartY;
          const absDx = Math.abs(dx);
          const absDy = Math.abs(dy);

          if (Math.max(absDx, absDy) >= this.previewThreshold) {
            const dir = absDx > absDy ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
            if (this.currentPreviewDir !== dir) {
              this.currentPreviewDir = dir;
              this.emit('previewMove', dir);
            }
          } else if (this.currentPreviewDir) {
            this.currentPreviewDir = null;
            this.emit('clearPreview');
          }
        }
      },
      { passive: false }
    );

    const handleTouchEnd = (e) => {
      if (e.changedTouches && e.changedTouches.length > 0) {
        const touchEndX = e.changedTouches[0].clientX;
        const touchEndY = e.changedTouches[0].clientY;
        const dx = touchEndX - this.touchStartX;
        const dy = touchEndY - this.touchStartY;
        const absDx = Math.abs(dx);
        const absDy = Math.abs(dy);

        if (Math.max(absDx, absDy) > this.minSwipeDistance) {
          const dir = absDx > absDy ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
          this.emit('move', dir);
        }
      }
      this.currentPreviewDir = null;
      this.emit('clearPreview');
    };

    this.boardEl.addEventListener('touchend', handleTouchEnd, { passive: false });
    this.boardEl.addEventListener('touchcancel', () => {
      this.currentPreviewDir = null;
      this.emit('clearPreview');
    }, { passive: false });
  }

  bindMouse() {
    if (!this.boardEl) return;

    this.boardEl.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return; // Left-click only
      this.mouseStartX = e.clientX;
      this.mouseStartY = e.clientY;
      this.isMouseDown = true;
      this.currentPreviewDir = null;
    });

    window.addEventListener('mousemove', (e) => {
      if (!this.isMouseDown) return;
      const dx = e.clientX - this.mouseStartX;
      const dy = e.clientY - this.mouseStartY;
      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);

      if (Math.max(absDx, absDy) >= this.previewThreshold) {
        const dir = absDx > absDy ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
        if (this.currentPreviewDir !== dir) {
          this.currentPreviewDir = dir;
          this.emit('previewMove', dir);
        }
      } else if (this.currentPreviewDir) {
        this.currentPreviewDir = null;
        this.emit('clearPreview');
      }
    });

    window.addEventListener('mouseup', (e) => {
      if (!this.isMouseDown) return;
      this.isMouseDown = false;
      const dx = e.clientX - this.mouseStartX;
      const dy = e.clientY - this.mouseStartY;
      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);

      if (Math.max(absDx, absDy) > this.minSwipeDistance) {
        const dir = absDx > absDy ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
        this.emit('move', dir);
      }
      this.currentPreviewDir = null;
      this.emit('clearPreview');
    });
  }

  bindDpad(dpadContainer) {
    if (!dpadContainer) return;
    const buttons = dpadContainer.querySelectorAll('[data-dir]');
    buttons.forEach(btn => {
      const dir = btn.getAttribute('data-dir');
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        this.emit('clearPreview');
        this.emit('move', dir);
      });
      btn.addEventListener('pointerenter', () => {
        this.emit('previewMove', dir);
      });
      btn.addEventListener('pointerleave', () => {
        this.emit('clearPreview');
      });
      btn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        this.emit('previewMove', dir);
      }, { passive: false });
    });
  }

  bindCompass(compassContainer) {
    if (!compassContainer) return;
    const buttons = compassContainer.querySelectorAll('[data-dir]');
    buttons.forEach(btn => {
      const dir = btn.getAttribute('data-dir');
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        this.emit('clearPreview');
        this.emit('move', dir);
      });
      btn.addEventListener('pointerenter', () => {
        this.emit('previewMove', dir);
      });
      btn.addEventListener('pointerleave', () => {
        this.emit('clearPreview');
      });
    });
  }
}

window.InputManager = InputManager;
