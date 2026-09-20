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

    // Create ghost preview container for 50% transparent outcome tiles
    this.ghostContainer = document.createElement('div');
    this.ghostContainer.className = 'ghost-preview-container';
    this.boardEl.appendChild(this.ghostContainer);
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

          const stepPercent = 100 / gridSize;
          tileEl.style.width = `${stepPercent}%`;
          tileEl.style.height = `${stepPercent}%`;

          if (tile.isSpilling && tile.fromRow !== undefined && tile.fromCol !== undefined) {
            // Fluid spill: start at the source shattered tile position
            tileEl.classList.add('tile-spilling');
            tileEl.style.transform = `translate(${tile.fromCol * 100}%, ${tile.fromRow * 100}%)`;
            this.tileContainer.appendChild(tileEl);

            // Set up classes and contents without overriding initial transform
            this.updateTileElement(tileEl, tile, gridSize, true);

            // Force reflow so the browser registers the initial source position
            void tileEl.offsetWidth;

            // Animate gliding from source tile to destination tile with Carrom Board deceleration
            const dist = Math.hypot(tile.col - tile.fromCol, tile.row - tile.fromRow);
            const duration = Math.min(380, Math.max(220, Math.round(180 + dist * 35)));
            tileEl.style.transition = `transform ${duration}ms cubic-bezier(0.16, 0.95, 0.3, 1.05)`;
            const spillDelay = Math.min((tile.spillIndex || 0) * 12, 90);
            setTimeout(() => {
              tileEl.style.transform = `translate(${tile.col * 100}%, ${tile.row * 100}%)`;
              setTimeout(() => {
                tileEl.classList.remove('tile-spilling');
                tileEl.style.transition = '';
              }, duration + 30);
            }, spillDelay);
          } else {
            if (tile.isNew) {
              tileEl.classList.add('tile-new');
            }
            this.tileContainer.appendChild(tileEl);
            this.updateTileElement(tileEl, tile, gridSize);
          }
        } else {
          // Existing tile updating position & state
          this.updateTileElement(tileEl, tile, gridSize);
        }
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

  updateTileElement(el, tile, gridSize, skipTransform = false) {
    const inner = el.querySelector('.tile-inner');

    // Calculate position percentage
    const stepPercent = 100 / gridSize;
    if (!skipTransform) {
      el.style.transform = `translate(${tile.col * 100}%, ${tile.row * 100}%)`;
    }
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
    if (tile.isNew && !tile.isSpilling) classNames += ' tile-new';
    if (tile.isSpilling) classNames += ' tile-spilling';
    if (tile.justDivided && !tile.isSpilling) classNames += ' tile-impact';
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
    if (this.ghostContainer) {
      this.ghostContainer.innerHTML = '';
    }
    if (this.tileContainer) {
      this.tileContainer.querySelectorAll('.tile-target-locked, .tile-target-secondary, .tile-elimination-blink, .tile-target-dividing').forEach(el => {
        el.classList.remove('tile-target-locked', 'tile-target-secondary', 'tile-elimination-blink', 'tile-target-dividing');
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

    const tierColors = {
      green: { stroke: '#00ff66', glow: 'rgba(0, 255, 102, 0.5)' },
      amber: { stroke: '#ffb300', glow: 'rgba(255, 179, 0, 0.5)' },
      red: { stroke: '#ff1744', glow: 'rgba(255, 23, 68, 0.55)' }
    };

    const cx = (breakerStart.col + 0.5) * step;
    const cy = (breakerStart.row + 0.5) * step;
    const offset = step * 0.44; // Half-tile distance to tile boundary

    const directions = ['up', 'down', 'left', 'right'];
    const directHitDirs = new Set();
    // If activeDirection is specified, render other directions first, active on top
    const sortedDirs = activeDirection
      ? directions.filter(d => d !== activeDirection).concat([activeDirection])
      : directions;

    for (const dir of sortedDirs) {
      const sim = allSims[dir];
      if (!sim || !sim.valid) continue;

      const isAimed = (activeDirection !== null && dir === activeDirection);
      const isNeutral = (activeDirection === null);
      const { collision } = sim;

      // Determine if there is a direct target in front of the breaker in this direction
      let isDirectHit = false;
      let targetRow = null;
      let targetCol = null;

      if (collision && collision.targetInitialPos) {
        const tPos = collision.targetInitialPos;
        if (dir === 'up' && tPos.col === breakerStart.col && tPos.row < breakerStart.row) {
          isDirectHit = true;
          targetRow = tPos.row;
          targetCol = breakerStart.col;
        } else if (dir === 'down' && tPos.col === breakerStart.col && tPos.row > breakerStart.row) {
          isDirectHit = true;
          targetRow = tPos.row;
          targetCol = breakerStart.col;
        } else if (dir === 'left' && tPos.row === breakerStart.row && tPos.col < breakerStart.col) {
          isDirectHit = true;
          targetRow = breakerStart.row;
          targetCol = tPos.col;
        } else if (dir === 'right' && tPos.row === breakerStart.row && tPos.col > breakerStart.col) {
          isDirectHit = true;
          targetRow = breakerStart.row;
          targetCol = tPos.col;
        }
      }

      if (isDirectHit) {
        directHitDirs.add(dir);
      }

      // Calculate start and end coordinates anchored strictly to tile boundaries
      let x1 = cx, y1 = cy;
      let x2 = cx, y2 = cy;

      if (dir === 'up') {
        x1 = cx;
        y1 = cy - offset; // Top boundary of breaker
        if (isDirectHit) {
          x2 = cx;
          y2 = (targetRow + 0.5) * step + offset; // Bottom boundary of target tile
        } else {
          // If breaker already flush against top wall, skip
          if (breakerStart.row === 0) continue;
          x2 = cx;
          y2 = 0; // Top wall boundary
        }
      } else if (dir === 'down') {
        x1 = cx;
        y1 = cy + offset; // Bottom boundary of breaker
        if (isDirectHit) {
          x2 = cx;
          y2 = (targetRow + 0.5) * step - offset; // Top boundary of target tile
        } else {
          if (breakerStart.row === gridSize - 1) continue;
          x2 = cx;
          y2 = 100; // Bottom wall boundary
        }
      } else if (dir === 'left') {
        x1 = cx - offset; // Left boundary of breaker
        y1 = cy;
        if (isDirectHit) {
          x2 = (targetCol + 0.5) * step + offset; // Right boundary of target tile
          y2 = cy;
        } else {
          if (breakerStart.col === 0) continue;
          x2 = 0; // Left wall boundary
          y2 = cy;
        }
      } else if (dir === 'right') {
        x1 = cx + offset; // Right boundary of breaker
        y1 = cy;
        if (isDirectHit) {
          x2 = (targetCol + 0.5) * step - offset; // Left boundary of target tile
          y2 = cy;
        } else {
          if (breakerStart.col === gridSize - 1) continue;
          x2 = 100; // Right wall boundary
          y2 = cy;
        }
      }

      // Prevent inverted lines if tiles are directly adjacent
      if (dir === 'up' && y1 <= y2) y1 = y2;
      if (dir === 'down' && y1 >= y2) y1 = y2;
      if (dir === 'left' && x1 <= x2) x1 = x2;
      if (dir === 'right' && x1 >= x2) x1 = x2;

      if (isDirectHit) {
        // --- TARGET COLLISION TRAJECTORY ---
        // Consequence Tier: Green (Guaranteed elimination), Amber (Division), Red (Dangerous expansion)
        const totalCells = sim.totalCells || (gridSize * gridSize);
        const curOcc = sim.currentOccupied || 0;
        const projOcc = sim.projectedOccupied || curOcc;
        const remainingEmpty = totalCells - projOcc;

        let tier = 'amber';
        if (collision.eliminated) {
          tier = 'green';
        } else if (
          collision.piecesCount >= 8 ||
          (sim.fissionRisk && sim.fissionRisk.isCrowded) ||
          remainingEmpty <= 4 ||
          projOcc >= Math.floor(totalCells * 0.85)
        ) {
          tier = 'red';
        }

        const theme = tierColors[tier];

        // 1. Outer colored glow aura
        const glowLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        glowLine.setAttribute('x1', `${x1}`);
        glowLine.setAttribute('y1', `${y1}`);
        glowLine.setAttribute('x2', `${x2}`);
        glowLine.setAttribute('y2', `${y2}`);
        glowLine.setAttribute('stroke', theme.stroke);
        glowLine.setAttribute('stroke-width', isAimed ? '1.2' : (isNeutral ? '0.9' : '0.6'));
        glowLine.setAttribute('stroke-linecap', 'round');
        glowLine.setAttribute('opacity', isAimed ? '0.85' : (isNeutral ? '0.65' : '0.35'));
        glowLine.setAttribute('class', 'trajectory-laser-glow');
        this.trajectoryOverlay.appendChild(glowLine);

        // 2. White dashed flowing core line
        const coreLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        coreLine.setAttribute('x1', `${x1}`);
        coreLine.setAttribute('y1', `${y1}`);
        coreLine.setAttribute('x2', `${x2}`);
        coreLine.setAttribute('y2', `${y2}`);
        coreLine.setAttribute('stroke', '#ffffff');
        coreLine.setAttribute('stroke-width', isAimed ? '0.7' : (isNeutral ? '0.55' : '0.45'));
        coreLine.setAttribute('stroke-dasharray', '2 1.5');
        coreLine.setAttribute('stroke-linecap', 'round');
        coreLine.setAttribute('opacity', isAimed ? '0.95' : (isNeutral ? '0.85' : '0.5'));
        coreLine.setAttribute('class', 'trajectory-laser-core');
        this.trajectoryOverlay.appendChild(coreLine);

        // 3. Subtle destination contact dot at target boundary
        const targetDot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        targetDot.setAttribute('cx', `${x2}`);
        targetDot.setAttribute('cy', `${y2}`);
        targetDot.setAttribute('r', isAimed ? '1.0' : '0.85');
        targetDot.setAttribute('fill', theme.stroke);
        targetDot.setAttribute('stroke', '#ffffff');
        targetDot.setAttribute('stroke-width', '0.4');
        targetDot.setAttribute('class', 'trajectory-target-ring');
        this.trajectoryOverlay.appendChild(targetDot);

        // 4. Target tile lock & outcome badge
        const targetTileEl = this.tileContainer.querySelector(`.tile[data-id="${collision.targetId}"]`);
        if (targetTileEl) {
          targetTileEl.classList.remove('tile-target-secondary');
          targetTileEl.classList.add('tile-target-locked');
          targetTileEl.style.setProperty('--target-lock-color', theme.stroke);

          // If tile will be cleared in this direction, make it blink!
          if (collision.eliminated) {
            targetTileEl.classList.add('tile-elimination-blink');
          }

          if (isAimed || isNeutral) {
            const badge = document.createElement('div');
            badge.className = `collision-preview-badge badge-tier-${tier}`;

            let equationText = '';
            if (collision.eliminated) {
              equationText = `${collision.oldValue.toLocaleString()} ÷ ${collision.breakerValue} = ${collision.newValue} ➔ 💥 Cleared!`;
            } else {
              equationText = `${collision.oldValue.toLocaleString()} ÷ ${collision.breakerValue} = ${collision.newValue.toLocaleString()} × ${collision.piecesCount} tiles`;
            }

            badge.innerHTML = `<div class="badge-equation">${equationText}</div>`;
            targetTileEl.appendChild(badge);
          }
        }
      } else {
        // --- WALL TRAJECTORY (Subtle, non-distracting GREY guide line to wall boundary) ---
        const wallLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        wallLine.setAttribute('x1', `${x1}`);
        wallLine.setAttribute('y1', `${y1}`);
        wallLine.setAttribute('x2', `${x2}`);
        wallLine.setAttribute('y2', `${y2}`);
        wallLine.setAttribute('stroke', '#94a3b8');
        wallLine.setAttribute('stroke-width', isAimed ? '0.55' : '0.4');
        wallLine.setAttribute('stroke-dasharray', '1 2');
        wallLine.setAttribute('stroke-linecap', 'round');
        wallLine.setAttribute('opacity', isAimed ? '0.5' : '0.25');
        this.trajectoryOverlay.appendChild(wallLine);

        // Subtle grey stop dot at the wall boundary
        const wallDot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        wallDot.setAttribute('cx', `${x2}`);
        wallDot.setAttribute('cy', `${y2}`);
        wallDot.setAttribute('r', isAimed ? '0.7' : '0.55');
        wallDot.setAttribute('fill', '#94a3b8');
        wallDot.setAttribute('opacity', isAimed ? '0.6' : '0.35');
        this.trajectoryOverlay.appendChild(wallDot);
      }
    }

    // 5. In case of division: show where resultant cells will be occupied in 50% transparent
    // ONLY for directions that have a direct target hit (if direction hits a wall, no preview is shown)
    if (this.ghostContainer) {
      const stepPercent = 100 / gridSize;
      const dirsToRender = (activeDirection
        ? [activeDirection]
        : ['up', 'down', 'left', 'right']
      ).filter(d => directHitDirs.has(d));

      const renderedCells = new Set();
      const dirSymbols = { up: '▲', down: '▼', left: '◀', right: '▶' };

      dirsToRender.forEach(d => {
        const sim = allSims[d];
        if (!sim || !sim.valid || !sim.collision || sim.collision.eliminated) return;
        if (!Array.isArray(sim.projectedTiles)) return;

        // Consequence tier for this collision
        const totalCells = sim.totalCells || (gridSize * gridSize);
        const curOcc = sim.currentOccupied || 0;
        const projOcc = sim.projectedOccupied || curOcc;
        const remainingEmpty = totalCells - projOcc;
        let previewTier = 'amber';
        if (
          sim.collision.piecesCount >= 8 ||
          (sim.fissionRisk && sim.fissionRisk.isCrowded) ||
          remainingEmpty <= 4 ||
          projOcc >= Math.floor(totalCells * 0.85)
        ) {
          previewTier = 'red';
        }

        const symbol = dirSymbols[d] || '';

        // Render fluid spill pieces in preview
        const resultantTiles = sim.projectedTiles.filter(t => t.isNewPiece);

        resultantTiles.forEach(tile => {
          const cellKey = `${tile.row},${tile.col}`;
          if (renderedCells.has(cellKey)) return;
          renderedCells.add(cellKey);

          const ghost = document.createElement('div');
          ghost.className = `ghost-preview-tile val-${tile.value} ghost-new-piece`;
          ghost.style.left = `${tile.col * stepPercent}%`;
          ghost.style.top = `${tile.row * stepPercent}%`;
          ghost.style.width = `${stepPercent}%`;
          ghost.style.height = `${stepPercent}%`;
          ghost.style.setProperty('--preview-tier', previewTier);

          const inner = document.createElement('div');
          inner.className = 'ghost-inner';
          inner.innerHTML = `
            <span class="ghost-dir-badge">${symbol}</span>
            <span class="tile-number">${tile.value.toLocaleString()}</span>
          `;
          ghost.appendChild(inner);
          this.ghostContainer.appendChild(ghost);
        });
      });
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

  // Trigger escalating Supernova / Big Bang Finishing explosions
  triggerSupernovaVisuals(sortedTiles, gridSize, onTileDetonated, onComplete) {
    if (!sortedTiles || sortedTiles.length === 0) {
      if (onComplete) onComplete();
      return;
    }

    this.clearTrajectoryPreview();

    // 1. Arm all remaining target tiles with glowing energy
    sortedTiles.forEach(t => {
      const tileEl = this.tileContainer.querySelector(`.tile[data-id="${t.id}"]`);
      if (tileEl) {
        tileEl.classList.add('tile-supernova-arming');
      }
    });

    const total = sortedTiles.length;
    let index = 0;

    // Detonate sequentially: smallest to largest!
    const stepInterval = Math.max(90, Math.min(180, Math.floor(1800 / total)));

    const detonateNext = () => {
      if (index >= total) {
        // Finishing delay before victory modal
        setTimeout(() => {
          if (this.boardEl) this.boardEl.classList.remove('board-big-bang-shake');
          if (onComplete) onComplete();
        }, 500);
        return;
      }

      const tileData = sortedTiles[index];
      const isFinal = index === total - 1;
      const progress = total > 1 ? index / (total - 1) : 1;

      const tileEl = this.tileContainer.querySelector(`.tile[data-id="${tileData.id}"]`);
      if (tileEl) {
        tileEl.classList.remove('tile-supernova-arming');
        tileEl.classList.add('tile-big-bang-exploding');
        setTimeout(() => {
          if (tileEl && tileEl.parentNode) tileEl.parentNode.removeChild(tileEl);
        }, 400);
      }

      // Escalating particle blasts: more particles and higher speed for larger tiles!
      this.createSupernovaParticles(tileData.row, tileData.col, tileData.value, gridSize, progress, isFinal);

      if (isFinal && this.boardEl) {
        this.boardEl.classList.add('board-big-bang-shake');
      }

      if (onTileDetonated) {
        onTileDetonated(tileData, index, total, isFinal, progress);
      }

      index++;
      setTimeout(detonateNext, isFinal ? 350 : stepInterval);
    };

    // Short initial arming suspense (250ms) then begin cascade
    setTimeout(detonateNext, 250);
  }

  createSupernovaParticles(row, col, value, gridSize, progress, isFinal) {
    if (!this.ctx || !this.canvas) return;
    this.resizeCanvas();

    const cellW = this.canvas.width / gridSize;
    const cellH = this.canvas.height / gridSize;
    const centerX = col * cellW + cellW / 2;
    const centerY = row * cellH + cellH / 2;

    const colors = isFinal
      ? ['#00f0ff', '#ffffff', '#ffd600', '#ff007f', '#a855f7']
      : ['#ffd600', '#06b6d4', '#ec4899', '#ffffff', '#10b981'];

    // Escalating particle count: from 32 up to 120 particles!
    const count = isFinal ? 120 : Math.floor(32 + progress * 48);

    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = (2.5 + progress * 4) + Math.random() * (4.5 + progress * 6);
      this.particles.push({
        x: centerX + (Math.random() - 0.5) * (cellW * 0.3),
        y: centerY + (Math.random() - 0.5) * (cellH * 0.3),
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: (3 + progress * 3) + Math.random() * (4 + progress * 4),
        color: colors[Math.floor(Math.random() * colors.length)],
        alpha: 1,
        decay: (isFinal ? 0.015 : 0.025) + Math.random() * 0.02,
        isShard: true,
        rotation: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 0.4
      });
    }

    if (!this.animating) {
      this.animating = true;
      requestAnimationFrame(() => this.updateParticles());
    }
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
