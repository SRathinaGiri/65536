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

    // Create trajectory SVG overlay for collision & path previews
    this.trajectoryOverlay = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.trajectoryOverlay.setAttribute('class', 'trajectory-overlay');
    this.trajectoryOverlay.setAttribute('viewBox', '0 0 100 100');
    this.trajectoryOverlay.setAttribute('preserveAspectRatio', 'none');
    this.boardEl.appendChild(this.trajectoryOverlay);

    // Create tile container
    this.tileContainer = document.createElement('div');
    this.tileContainer.className = 'tile-container';
    this.boardEl.appendChild(this.tileContainer);
  }

  render(state) {
    this.clearTrajectoryPreview();
    const { grid, gridSize } = state;
    if (!this.tileContainer || this.currentGridSize !== gridSize) {
      this.currentGridSize = gridSize;
      this.setupGrid(gridSize);
    }

    // Keep track of existing tile DOM nodes by tile.id
    const currentTileElements = new Map();
    this.tileContainer.querySelectorAll('.tile').forEach(el => {
      if (!el.dataset.id || el.classList.contains('tile-eliminated')) return;
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
          el.dataset.id = '';
          el.classList.add('tile-eliminated');
          setTimeout(() => el.remove(), 350);
        } else if (!el.classList.contains('tile-eliminated')) {
          el.dataset.id = '';
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

  clearTrajectoryPreview() {
    if (this.trajectoryOverlay) {
      this.trajectoryOverlay.innerHTML = '';
    }
    if (this.tileContainer) {
      this.tileContainer.querySelectorAll('.tile-target-locked, .tile-target-secondary').forEach(el => {
        el.classList.remove('tile-target-locked', 'tile-target-secondary');
        el.style.removeProperty('--target-lock-color');
        el.style.removeProperty('--secondary-target-color');
      });
      this.tileContainer.querySelectorAll('.collision-preview-badge').forEach(el => {
        el.remove();
      });
    }
    if (this.boardEl) {
      this.boardEl.querySelectorAll('.wall-preview-marker').forEach(el => {
        el.remove();
      });
    }
  }

  // 4-Way Omnidirectional Radar Trajectory Preview
  renderTrajectorySystem(allSims, activeDirection) {
    this.clearTrajectoryPreview();
    if (!allSims || !this.trajectoryOverlay) return;

    // Find any valid simulation with breaker position
    const sampleSim = Object.values(allSims).find(s => s && s.breakerStart);
    if (!sampleSim || !sampleSim.breakerStart) return;

    const gridSize = this.currentGridSize || 8;
    const step = 100 / gridSize;
    const breakerStart = sampleSim.breakerStart;
    const breakerVal = breakerStart.value;

    const themeColors = {
      2: { stroke: '#ff1744', glow: 'rgba(255, 23, 68, 0.45)' },
      4: { stroke: '#ffd600', glow: 'rgba(255, 214, 0, 0.45)' },
      8: { stroke: '#00f0ff', glow: 'rgba(0, 240, 255, 0.45)' },
      16: { stroke: '#00ff66', glow: 'rgba(0, 255, 102, 0.45)' }
    };
    const theme = themeColors[breakerVal] || themeColors[2];

    const startX = (breakerStart.col + 0.5) * step;
    const startY = (breakerStart.row + 0.5) * step;

    // Subtle center marker at breaker (delicate, non-obstructive)
    const centerDot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    centerDot.setAttribute('cx', `${startX}`);
    centerDot.setAttribute('cy', `${startY}`);
    centerDot.setAttribute('r', '0.7');
    centerDot.setAttribute('fill', '#ffffff');
    centerDot.setAttribute('opacity', '0.7');
    this.trajectoryOverlay.appendChild(centerDot);

    const directions = ['up', 'down', 'left', 'right'];
    // Render inactive directions first, then active direction on top
    const sortedDirs = directions.filter(d => d !== activeDirection).concat([activeDirection]);

    for (const dir of sortedDirs) {
      const sim = allSims[dir];
      if (!sim || !sim.valid) continue;

      const isActive = (dir === activeDirection);
      const { breakerEnd, collision, hitWall, breakerMoved } = sim;

      const destCol = collision ? collision.collisionCell.col : breakerEnd.col;
      const destRow = collision ? collision.collisionCell.row : breakerEnd.row;

      const endX = (destCol + 0.5) * step;
      const endY = (destRow + 0.5) * step;

      const dist = Math.hypot(endX - startX, endY - startY);
      // Skip if breaker didn't move at all and there's no collision in this direction
      if (dist < 0.01 && !collision) continue;

      if (isActive) {
        // --- PRIMARY / AIMED DIRECTION (Subtle neon laser) ---
        // 1. Slender outer aura
        const glowLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        glowLine.setAttribute('x1', `${startX}`);
        glowLine.setAttribute('y1', `${startY}`);
        glowLine.setAttribute('x2', `${endX}`);
        glowLine.setAttribute('y2', `${endY}`);
        glowLine.setAttribute('stroke', theme.stroke);
        glowLine.setAttribute('stroke-width', '1.1');
        glowLine.setAttribute('stroke-linecap', 'round');
        glowLine.setAttribute('opacity', '0.65');
        glowLine.setAttribute('class', 'trajectory-laser-glow');
        this.trajectoryOverlay.appendChild(glowLine);

        // 2. White dashed flowing core line
        const coreLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        coreLine.setAttribute('x1', `${startX}`);
        coreLine.setAttribute('y1', `${startY}`);
        coreLine.setAttribute('x2', `${endX}`);
        coreLine.setAttribute('y2', `${endY}`);
        coreLine.setAttribute('stroke', '#ffffff');
        coreLine.setAttribute('stroke-width', '0.65');
        coreLine.setAttribute('stroke-dasharray', '2 1.5');
        coreLine.setAttribute('stroke-linecap', 'round');
        coreLine.setAttribute('opacity', '0.95');
        coreLine.setAttribute('class', 'trajectory-laser-core');
        this.trajectoryOverlay.appendChild(coreLine);

        // 3. Collision or Wall Marker
        if (collision) {
          // Destination Reticle Ring
          const targetRing = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
          targetRing.setAttribute('cx', `${endX}`);
          targetRing.setAttribute('cy', `${endY}`);
          targetRing.setAttribute('r', '1.2');
          targetRing.setAttribute('fill', theme.stroke);
          targetRing.setAttribute('stroke', '#ffffff');
          targetRing.setAttribute('stroke-width', '0.5');
          targetRing.setAttribute('class', 'trajectory-target-ring');
          this.trajectoryOverlay.appendChild(targetRing);

          // Target tile lock & outcome badge
          const targetTileEl = this.tileContainer.querySelector(`.tile[data-id="${collision.targetId}"]`);
          if (targetTileEl) {
            targetTileEl.classList.remove('tile-target-secondary');
            targetTileEl.classList.add('tile-target-locked');
            targetTileEl.style.setProperty('--target-lock-color', theme.stroke);

            const badge = document.createElement('div');
            badge.className = `collision-preview-badge ${collision.eliminated ? 'badge-eliminated' : 'badge-divide'}`;
            if (collision.eliminated) {
              badge.innerHTML = `<span class="badge-icon">💥</span> Cleared! <small>+${collision.scoreGain.toLocaleString()}</small>`;
            } else {
              badge.innerHTML = `<span class="badge-icon">÷${collision.breakerValue}</span> ➔ <strong>${collision.newValue}</strong> <span class="badge-pieces">(${collision.piecesCount} pcs)</span>`;
            }
            targetTileEl.appendChild(badge);
          }
        } else if (hitWall && breakerMoved) {
          // Subtle wall boundary tick in SVG
          const wallTick = document.createElementNS('http://www.w3.org/2000/svg', 'line');
          let tx1 = endX, ty1 = endY, tx2 = endX, ty2 = endY;
          const tickHalf = step * 0.28;
          if (dir === 'up') {
            const edgeY = breakerEnd.row * step + 0.8;
            tx1 = endX - tickHalf; tx2 = endX + tickHalf;
            ty1 = edgeY; ty2 = edgeY;
          } else if (dir === 'down') {
            const edgeY = (breakerEnd.row + 1) * step - 0.8;
            tx1 = endX - tickHalf; tx2 = endX + tickHalf;
            ty1 = edgeY; ty2 = edgeY;
          } else if (dir === 'left') {
            const edgeX = breakerEnd.col * step + 0.8;
            tx1 = edgeX; tx2 = edgeX;
            ty1 = endY - tickHalf; ty2 = endY + tickHalf;
          } else if (dir === 'right') {
            const edgeX = (breakerEnd.col + 1) * step - 0.8;
            tx1 = edgeX; tx2 = edgeX;
            ty1 = endY - tickHalf; ty2 = endY + tickHalf;
          }
          wallTick.setAttribute('x1', `${tx1}`);
          wallTick.setAttribute('y1', `${ty1}`);
          wallTick.setAttribute('x2', `${tx2}`);
          wallTick.setAttribute('y2', `${ty2}`);
          wallTick.setAttribute('stroke', '#ef4444');
          wallTick.setAttribute('stroke-width', '0.7');
          wallTick.setAttribute('stroke-linecap', 'round');
          wallTick.setAttribute('opacity', '0.65');
          this.trajectoryOverlay.appendChild(wallTick);
        }
      } else {
        // --- SECONDARY / OTHER DIRECTIONS (Subtle omnidirectional radar) ---
        const guideLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        guideLine.setAttribute('x1', `${startX}`);
        guideLine.setAttribute('y1', `${startY}`);
        guideLine.setAttribute('x2', `${endX}`);
        guideLine.setAttribute('y2', `${endY}`);
        guideLine.setAttribute('stroke-linecap', 'round');

        if (collision) {
          // Hits a target in this secondary direction
          guideLine.setAttribute('stroke', theme.stroke);
          guideLine.setAttribute('stroke-width', '0.55');
          guideLine.setAttribute('stroke-dasharray', '1.4 1.4');
          guideLine.setAttribute('opacity', '0.45');
          this.trajectoryOverlay.appendChild(guideLine);

          // Tiny destination dot
          const secDot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
          secDot.setAttribute('cx', `${endX}`);
          secDot.setAttribute('cy', `${endY}`);
          secDot.setAttribute('r', '0.85');
          secDot.setAttribute('fill', theme.stroke);
          secDot.setAttribute('opacity', '0.65');
          this.trajectoryOverlay.appendChild(secDot);

          // Subtle secondary target outline
          const secTargetTile = this.tileContainer.querySelector(`.tile[data-id="${collision.targetId}"]`);
          if (secTargetTile && !secTargetTile.classList.contains('tile-target-locked')) {
            secTargetTile.classList.add('tile-target-secondary');
            secTargetTile.style.setProperty('--secondary-target-color', theme.stroke);
          }
        } else if (hitWall && breakerMoved) {
          // Hits a wall in this secondary direction
          guideLine.setAttribute('stroke', '#94a3b8');
          guideLine.setAttribute('stroke-width', '0.4');
          guideLine.setAttribute('stroke-dasharray', '1 2');
          guideLine.setAttribute('opacity', '0.25');
          this.trajectoryOverlay.appendChild(guideLine);

          const secWallDot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
          secWallDot.setAttribute('cx', `${endX}`);
          secWallDot.setAttribute('cy', `${endY}`);
          secWallDot.setAttribute('r', '0.55');
          secWallDot.setAttribute('fill', '#94a3b8');
          secWallDot.setAttribute('opacity', '0.35');
          this.trajectoryOverlay.appendChild(secWallDot);
        }
      }
    }
  }

  // Backwards compatibility helper
  renderTrajectoryPreview(previewData) {
    if (!previewData || !previewData.valid) {
      this.clearTrajectoryPreview();
      return;
    }
    const dir = previewData.direction || 'up';
    this.renderTrajectorySystem({ [dir]: previewData }, dir);
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
