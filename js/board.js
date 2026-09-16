// Board DOM renderer and visual effects manager
class BoardRenderer {
  constructor(boardElement, particleCanvas) {
    this.boardEl = boardElement;
    this.canvas = particleCanvas;
    this.ctx = particleCanvas ? particleCanvas.getContext('2d') : null;
    this.particles = [];
    this.animating = false;

    if (this.canvas) {
      this.resizeCanvas();
      window.addEventListener('resize', () => this.resizeCanvas());
    }
  }

  resizeCanvas() {
    if (!this.canvas || !this.boardEl) return;
    const rect = this.boardEl.getBoundingClientRect();
    this.canvas.width = rect.width;
    this.canvas.height = rect.height;
  }

  setupGrid(gridSize) {
    this.boardEl.innerHTML = '';
    this.boardEl.style.setProperty('--grid-size', gridSize);

    // Create background grid slots
    const gridBackground = document.createElement('div');
    gridBackground.className = 'grid-background';
    for (let r = 0; r < gridSize; r++) {
      for (let c = 0; c < gridSize; c++) {
        const cell = document.createElement('div');
        cell.className = 'grid-cell-bg';
        cell.dataset.row = r;
        cell.dataset.col = c;
        gridBackground.appendChild(cell);
      }
    }
    this.boardEl.appendChild(gridBackground);

    // Create tile container
    this.tileContainer = document.createElement('div');
    this.tileContainer.className = 'tile-container';
    this.boardEl.appendChild(this.tileContainer);
  }

  render(state) {
    const { grid, gridSize } = state;
    if (!this.tileContainer || this.currentGridSize !== gridSize) {
      this.currentGridSize = gridSize;
      this.setupGrid(gridSize);
    }

    // Keep track of existing tile DOM nodes by tile.id
    const currentTileElements = new Map();
    this.tileContainer.querySelectorAll('.tile').forEach(el => {
      const id = parseInt(el.dataset.id, 10);
      currentTileElements.set(id, el);
    });

    const activeTileIds = new Set();

    for (let r = 0; r < gridSize; r++) {
      for (let c = 0; c < gridSize; c++) {
        const tile = grid[r][c];
        if (!tile) continue;

        activeTileIds.add(tile.id);
        let tileEl = currentTileElements.get(tile.id);

        if (!tileEl) {
          // New Tile DOM element
          tileEl = document.createElement('div');
          tileEl.dataset.id = tile.id;
          tileEl.className = 'tile';
          
          const inner = document.createElement('div');
          inner.className = 'tile-inner';
          tileEl.appendChild(inner);

          if (tile.isNew) {
            tileEl.classList.add('tile-new');
          }

          this.tileContainer.appendChild(tileEl);
        }

        // Update classes and positioning
        this.updateTileElement(tileEl, tile, gridSize);
      }
    }

    // Remove any tiles that no longer exist (e.g. consumed breakers, eliminated targets)
    currentTileElements.forEach((el, id) => {
      if (!activeTileIds.has(id)) {
        if (el.classList.contains('tile-target') && !el.classList.contains('tile-eliminated')) {
          el.classList.add('tile-eliminated');
          setTimeout(() => el.remove(), 350);
        } else if (!el.classList.contains('tile-eliminated')) {
          el.remove();
        }
      }
    });
  }

  updateTileElement(el, tile, gridSize) {
    const inner = el.querySelector('.tile-inner');

    // Calculate position percentage
    const stepPercent = 100 / gridSize;
    el.style.transform = `translate(${tile.col * 100}%, ${tile.row * 100}%)`;
    el.style.width = `${stepPercent}%`;
    el.style.height = `${stepPercent}%`;

    // Dataset attributes for interaction & targeting
    el.dataset.value = tile.value;
    el.dataset.type = tile.type;
    el.dataset.row = tile.row;
    el.dataset.col = tile.col;

    // Type and value styling
    let classNames = `tile tile-${tile.type} val-${tile.value}`;
    if (tile.type === 'target') {
      if (tile.value <= 256) {
        classNames += ' tile-smashable';
      } else {
        classNames += ' tile-immune';
      }
    }
    if (tile.isNew) classNames += ' tile-new';
    if (tile.justDivided) classNames += ' tile-impact';
    el.className = classNames;

    // Format display content
    if (tile.type === 'breaker') {
      inner.innerHTML = `
        <span class="breaker-label">BREAKER</span>
        <span class="tile-number">÷${tile.value}</span>
      `;
    } else {
      // Format big numbers
      const isSmashable = tile.value <= 256;
      inner.innerHTML = `
        <span class="target-badge">TARGET</span>
        <span class="tile-number">${tile.value.toLocaleString()}</span>
        ${isSmashable ? '<span class="hammer-smash-indicator">🔨 BREAK</span>' : '<span class="hammer-immune-indicator">🛡️</span>'}
      `;
    }
  }

  // Trigger elimination explosion when tile <= 16
  triggerElimination(row, col, value, gridSize) {
    this.createShatterParticles(row, col, value, gridSize);
  }

  // Trigger impact flash when breaker hits
  triggerBreakImpact(row, col, breakerVal, gridSize) {
    this.createImpactSparks(row, col, breakerVal, gridSize);
  }

  // Trigger warp / teleport particles
  triggerWarp(row, col, gridSize) {
    this.createWarpParticles(row, col, gridSize);
  }

  createImpactSparks(row, col, breakerVal, gridSize) {
    if (!this.ctx || !this.canvas) return;
    this.resizeCanvas();

    const cellW = this.canvas.width / gridSize;
    const cellH = this.canvas.height / gridSize;
    const centerX = col * cellW + cellW / 2;
    const centerY = row * cellH + cellH / 2;

    const sparkColors = {
      2: ['#ff1744', '#ff5252', '#ff8a80'],
      4: ['#ffd600', '#ffea00', '#fff59d'],
      8: ['#00e5ff', '#18ffff', '#84ffff'],
      16: ['#00e676', '#69f0ae', '#b9f6ca']
    }[breakerVal] || ['#ff9100', '#ffea00'];

    const count = 22;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 2.5 + Math.random() * 5.5;
      this.particles.push({
        x: centerX,
        y: centerY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: 3 + Math.random() * 4,
        color: sparkColors[Math.floor(Math.random() * sparkColors.length)],
        alpha: 1,
        decay: 0.035 + Math.random() * 0.03
      });
    }

    if (!this.animating) {
      this.animating = true;
      requestAnimationFrame(() => this.updateParticles());
    }
  }

  createShatterParticles(row, col, value, gridSize) {
    if (!this.ctx || !this.canvas) return;
    this.resizeCanvas();

    const cellW = this.canvas.width / gridSize;
    const cellH = this.canvas.height / gridSize;
    const centerX = col * cellW + cellW / 2;
    const centerY = row * cellH + cellH / 2;

    const colors = ['#8b5cf6', '#d946ef', '#06b6d4', '#ffffff', '#ffd600'];
    const count = 48;

    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 3.5 + Math.random() * 8.5;
      this.particles.push({
        x: centerX + (Math.random() - 0.5) * (cellW * 0.4),
        y: centerY + (Math.random() - 0.5) * (cellH * 0.4),
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: 4 + Math.random() * 6,
        color: colors[Math.floor(Math.random() * colors.length)],
        alpha: 1,
        decay: 0.02 + Math.random() * 0.02,
        isShard: true,
        rotation: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 0.3
      });
    }

    if (!this.animating) {
      this.animating = true;
      requestAnimationFrame(() => this.updateParticles());
    }
  }

  createWarpParticles(row, col, gridSize) {
    if (!this.ctx || !this.canvas) return;
    this.resizeCanvas();

    const cellW = this.canvas.width / gridSize;
    const cellH = this.canvas.height / gridSize;
    const centerX = col * cellW + cellW / 2;
    const centerY = row * cellH + cellH / 2;

    const colors = ['#00e5ff', '#18ffff', '#84ffff', '#ffffff', '#00ffc4'];
    const count = 30;

    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 2.0 + Math.random() * 5.0;
      this.particles.push({
        x: centerX,
        y: centerY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: 3 + Math.random() * 4,
        color: colors[Math.floor(Math.random() * colors.length)],
        alpha: 1,
        decay: 0.03 + Math.random() * 0.02
      });
    }

    if (!this.animating) {
      this.animating = true;
      requestAnimationFrame(() => this.updateParticles());
    }
  }

  updateParticles() {
    if (!this.ctx || !this.canvas) return;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vx *= 0.96;
      p.vy *= 0.96;
      p.alpha -= p.decay;

      if (p.alpha <= 0) {
        this.particles.splice(i, 1);
        continue;
      }

      this.ctx.save();
      this.ctx.globalAlpha = p.alpha;
      this.ctx.fillStyle = p.color;

      if (p.isShard) {
        p.rotation += p.rotSpeed;
        this.ctx.translate(p.x, p.y);
        this.ctx.rotate(p.rotation);
        this.ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 1.4);
      } else {
        this.ctx.beginPath();
        this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        this.ctx.fill();
      }

      this.ctx.restore();
    }

    if (this.particles.length > 0) {
      requestAnimationFrame(() => this.updateParticles());
    } else {
      this.animating = false;
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
  }
}

window.BoardRenderer = BoardRenderer;
