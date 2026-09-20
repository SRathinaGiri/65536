class GameEngine {
  constructor(options = {}) {
    this.gridSize = options.gridSize || 8;
    this.breakerValues = options.breakerValues || [2, 4, 8];
    this.divisionMode = options.divisionMode || 'fission';
    
    this.level = options.level || 1;
    this.currentStartValue = options.startValue || 4096; // Level 1 starts at 4096
    this.hammerCharges = 1; // 1 hammer by default
    this.lastHammerScore = 0; // Earned every 25,000 points
    this.warpCharges = 1;   // 1 warp by default, earned every 50,000 points
    this.lastWarpScore = 0;

    this.grid = [];
    this.score = 0;
    this.moves = 0;
    this.tilesShattered = 0;
    this.isWon = false;
    this.isGameOver = false;
    this.undoStack = [];
    this.maxUndo = 10;
    this.tileIdCounter = 1;
    this.moveHistory = [];
    this.sessionStartTime = Date.now();
    this.supernovaFinishing = options.supernovaFinishing !== false;
    
    this.listeners = [];
  }

  recordHistoryFrame(data = {}) {
    const timeMs = Date.now() - (this.sessionStartTime || Date.now());
    const frame = {
      step: this.moveHistory.length,
      timeMs,
      action: data.action || { type: 'unknown' },
      description: data.description || '',
      score: this.score,
      scoreGain: data.scoreGain || 0,
      soundEvent: data.soundEvent || null,
      state: {
        grid: this.cloneGrid(),
        score: this.score,
        moves: this.moves,
        level: this.level,
        hammerCharges: this.hammerCharges,
        warpCharges: this.warpCharges,
        tilesShattered: this.tilesShattered,
        isWon: this.isWon,
        isGameOver: this.isGameOver
      }
    };
    this.moveHistory.push(frame);
    return frame;
  }

  getReplayData() {
    const durationMs = this.moveHistory && this.moveHistory.length > 0
      ? this.moveHistory[this.moveHistory.length - 1].timeMs
      : 0;
    return {
      game: '65536',
      version: '1.24',
      exportedAt: new Date().toISOString(),
      gridSize: this.gridSize,
      startValue: this.currentStartValue,
      level: this.level,
      finalScore: this.score,
      totalMoves: this.moves,
      tilesShattered: this.tilesShattered,
      result: this.isWon ? 'victory' : (this.isGameOver ? 'game_over' : 'in_progress'),
      durationMs,
      frames: this.moveHistory || []
    };
  }

  on(event, callback) {
    this.listeners.push({ event, callback });
  }

  emit(event, data) {
    this.listeners
      .filter((l) => l.event === event)
      .forEach((l) => l.callback(data));
  }

  init(savedState = null) {
    if (savedState && savedState.grid && !savedState.isGameOver && !savedState.isWon) {
      this.loadState(savedState);
    } else {
      this.startNewGame(this.currentStartValue);
    }
  }

  startNewGame(startValue = this.currentStartValue, keepScore = false) {
    this.currentStartValue = startValue;
    this.grid = Array.from({ length: this.gridSize }, () =>
      Array.from({ length: this.gridSize }, () => null)
    );
    if (!keepScore) {
      this.score = 0;
      this.moves = 0;
      this.tilesShattered = 0;
      this.hammerCharges = 1; // 1 hammer available by default
      this.lastHammerScore = 0;
      this.warpCharges = 1; // 1 warp available by default
      this.lastWarpScore = 0;
      this.moveHistory = [];
      this.sessionStartTime = Date.now();
    }
    this.isWon = false;
    this.isGameOver = false;
    this.undoStack = [];
    this.tileIdCounter = 1;

    // Place the starting target tile in the center
    const centerR = Math.floor(this.gridSize / 2);
    const centerC = Math.floor(this.gridSize / 2);
    this.addTile(centerR, centerC, startValue, 'target');

    // Exactly ONE breaker tile at start
    this.spawnRandomBreaker();

    // Record initial starting frame
    this.recordHistoryFrame({
      action: { type: 'init' },
      description: `Game started • Target ${startValue.toLocaleString()}`,
      soundEvent: null
    });

    this.saveState();
    this.emit('stateChange', this.getState());
  }

  advanceNextLevel() {
    this.level++;
    this.currentStartValue *= 2; // 4096 -> 8192 -> 16384 -> 32768 -> 65536
    this.hammerCharges++; // Award +1 hammer for clearing a level
    this.startNewGame(this.currentStartValue, true);
  }

  setLevel(newLevel, startValue) {
    this.level = newLevel;
    this.currentStartValue = startValue;
    this.startNewGame(startValue, false);
  }

  shatterTileAt(row, col) {
    if (this.hammerCharges <= 0) {
      return { success: false, reason: 'No hammer charges available' };
    }
    const tile = this.grid[row][col];
    if (!tile) {
      return { success: false, reason: 'No tile at selected cell' };
    }

    // USER RULE: The hammer can break only a tile with value <= 256 only!
    if (tile.value > 256) {
      return { 
        success: false, 
        reason: 'Hammer can only shatter tiles with value ≤ 256!',
        tileValue: tile.value 
      };
    }

    this.saveSnapshot();
    this.hammerCharges--;
    const val = tile.value;
    const type = tile.type;
    this.grid[row][col] = null;
    
    if (type === 'target') {
      this.tilesShattered++;
      this.score += val;
    }

    this.emit('hammerUsed', { row, col, value: val });

    // Check victory
    let targetCount = 0;
    for (let r = 0; r < this.gridSize; r++) {
      for (let c = 0; c < this.gridSize; c++) {
        if (this.grid[r][c] && this.grid[r][c].type === 'target') {
          targetCount++;
        }
      }
    }

    if (targetCount === 0) {
      this.isWon = true;
      this.grid = Array.from({ length: this.gridSize }, () =>
        Array.from({ length: this.gridSize }, () => null)
      );
      this.emit('victory', { 
        score: this.score, 
        moves: this.moves, 
        level: this.level,
        currentValue: this.currentStartValue,
        nextValue: this.currentStartValue * 2 
      });
    } else {
      // Ensure at least 1 breaker exists
      const breakers = this.grid.flat().filter(t => t && t.type === 'breaker');
      if (breakers.length === 0) {
        this.spawnRandomBreaker();
      }
    }

    this.recordHistoryFrame({
      action: { type: 'hammer', row, col, value: val },
      description: `🔨 Shattered ${val.toLocaleString()} with Hammer`,
      scoreGain: type === 'target' ? val : 0,
      soundEvent: 'hammer'
    });

    this.saveState();
    this.emit('stateChange', this.getState());
    return { success: true, value: val };
  }

  // Teleport Breaker to any empty cell (Bonus earned every 25,000 points)
  teleportBreaker(targetR, targetC) {
    if (this.warpCharges <= 0) {
      return { success: false, reason: 'No warp charges available' };
    }
    if (targetR < 0 || targetR >= this.gridSize || targetC < 0 || targetC >= this.gridSize) {
      return { success: false, reason: 'Invalid coordinates' };
    }
    if (this.grid[targetR][targetC] !== null) {
      return { success: false, reason: 'Target cell must be empty' };
    }

    // Find active breaker
    let breaker = null;
    let oldR = -1, oldC = -1;
    for (let r = 0; r < this.gridSize; r++) {
      for (let c = 0; c < this.gridSize; c++) {
        if (this.grid[r][c] && this.grid[r][c].type === 'breaker') {
          breaker = this.grid[r][c];
          oldR = r;
          oldC = c;
          break;
        }
      }
      if (breaker) break;
    }

    this.saveSnapshot();

    if (breaker) {
      this.grid[oldR][oldC] = null;
      breaker.row = targetR;
      breaker.col = targetC;
      breaker.isNew = true;
      this.grid[targetR][targetC] = breaker;
    } else {
      // If no breaker found on board, spawn one at target
      breaker = this.addTile(targetR, targetC, 2, 'breaker');
      oldR = targetR;
      oldC = targetC;
    }

    this.warpCharges--;
    this.emit('breakerWarped', {
      from: { r: oldR, c: oldC },
      to: { r: targetR, c: targetC },
      breaker
    });

    this.recordHistoryFrame({
      action: { type: 'warp', from: { r: oldR, c: oldC }, to: { r: targetR, c: targetC } },
      description: `⚡ Breaker Warped to (${targetR}, ${targetC})`,
      scoreGain: 0,
      soundEvent: 'warp'
    });

    this.saveState();
    this.emit('stateChange', this.getState());
    return { success: true };
  }

  addTile(row, col, value, type = 'breaker') {
    const tile = {
      id: this.tileIdCounter++,
      value,
      type, // 'target' or 'breaker'
      row,
      col,
      isNew: true,
      justDivided: false,
      isEliminated: false
    };
    this.grid[row][col] = tile;
    return tile;
  }

  getEmptyCells(grid = this.grid) {
    const cells = [];
    for (let r = 0; r < this.gridSize; r++) {
      for (let c = 0; c < this.gridSize; c++) {
        if (!grid[r][c]) {
          cells.push({ r, c });
        }
      }
    }
    return cells;
  }

  findNearestEmptyCell(targetR, targetC, grid = this.grid) {
    const emptyCells = this.getEmptyCells(grid);
    if (emptyCells.length === 0) return null;

    // Prioritize adjacent direct neighbors
    const directNeighbors = emptyCells.filter(cell =>
      (Math.abs(cell.r - targetR) === 1 && cell.c === targetC) ||
      (Math.abs(cell.c - targetC) === 1 && cell.r === targetR)
    );
    if (directNeighbors.length > 0) {
      return directNeighbors[0];
    }

    // Sort by Manhattan distance
    emptyCells.sort((a, b) => {
      const distA = Math.abs(a.r - targetR) + Math.abs(a.c - targetC);
      const distB = Math.abs(b.r - targetR) + Math.abs(b.c - targetC);
      return distA - distB;
    });

    return emptyCells[0];
  }

  // Carrom Board Kinetic Scatter Fission:
  // Disperses splintered pieces outward along angular momentum rays through open cells.
  // Higher-power breakers (÷4, ÷8, ÷16) project pieces further across open lanes.
  // Lighter pieces (<=32, 64) carry more velocity and slide deeper, while heavier pieces (>=256) settle closer.
  // Solid tiles remain stationary obstacles that deflect and stop sliding pieces.
  findFluidSpillSpots(centerR, centerC, count, grid = this.grid, slideDir = 'right', divisor = 2, newVal = 32) {
    const spots = [];
    const claimed = new Set();
    const isFree = (r, c) => {
      if (r < 0 || r >= this.gridSize || c < 0 || c >= this.gridSize) return false;
      return grid[r][c] === null && !claimed.has(`${r},${c}`);
    };

    // Forward vector from breaker impact momentum
    let fDr = 0, fDc = 1;
    if (slideDir === 'up') { fDr = -1; fDc = 0; }
    else if (slideDir === 'down') { fDr = 1; fDc = 0; }
    else if (slideDir === 'left') { fDr = 0; fDc = -1; }
    else if (slideDir === 'right') { fDr = 0; fDc = 1; }

    const pDr = -fDc, pDc = fDr; // Perpendicular vector (90 deg flank)

    // 8 distinct carrom deflection rays ordered by kinetic spray priority:
    // 1. Forward lane (in-line with breaker impact)
    // 2. Diagonal forward sprays (±45°)
    // 3. Lateral flanks (±90°)
    // 4. Backward ricochets (±135°)
    // 5. Direct rebound (180°)
    const rays = [
      { name: 'forward', dr: fDr, dc: fDc },
      { name: 'diag_fwd_right', dr: fDr + pDr, dc: fDc + pDc },
      { name: 'diag_fwd_left', dr: fDr - pDr, dc: fDc - pDc },
      { name: 'flank_right', dr: pDr, dc: pDc },
      { name: 'flank_left', dr: -pDr, dc: -pDc },
      { name: 'diag_back_right', dr: -fDr + pDr, dc: -fDc + pDc },
      { name: 'diag_back_left', dr: -fDr - pDr, dc: -fDc - pDc },
      { name: 'rebound_back', dr: -fDr, dc: -fDc }
    ];

    // Base impulse from breaker force
    let baseDist = 1;
    if (divisor >= 16) baseDist = 4;
    else if (divisor >= 8) baseDist = 3;
    else if (divisor >= 4) baseDist = 2;
    else baseDist = 1;

    // Piece mass & velocity physics (lower values move faster and slide further)
    let speedBonus = 0;
    if (newVal <= 32) speedBonus = 2; // Lightest coin -> flies furthest into open lanes
    else if (newVal <= 64) speedBonus = 1;
    else if (newVal <= 128) speedBonus = 0;
    else speedBonus = -1; // Heavier pieces -> high inertia, settle closer

    const maxTravel = Math.max(1, Math.min(this.gridSize - 1, baseDist + speedBonus));

    // Phase 1: Carrom Raycasting
    // Cast each piece outward along its designated angular ray through open space
    for (let i = 0; i < count; i++) {
      const ray = rays[i % rays.length];
      let bestCell = null;
      let r = centerR;
      let c = centerC;

      for (let step = 1; step <= maxTravel; step++) {
        r += ray.dr;
        c += ray.dc;
        if (r < 0 || r >= this.gridSize || c < 0 || c >= this.gridSize) break;
        // Solid tile acts as an impassable obstacle stopping the slide
        if (grid[r][c] !== null) break;
        if (!claimed.has(`${r},${c}`)) {
          bestCell = { r, c };
        }
      }

      if (bestCell) {
        claimed.add(`${bestCell.r},${bestCell.c}`);
        spots.push(bestCell);
      }
    }

    // Phase 2: Natural Carrom Deflection & Local Fallback
    // If rays were blocked by obstacles or board borders, fill nearest accessible empty cells
    if (spots.length < count) {
      // First check the epicenter cell itself if free
      if (isFree(centerR, centerC)) {
        claimed.add(`${centerR},${centerC}`);
        spots.push({ r: centerR, c: centerC });
      }

      if (spots.length < count) {
        const queue = [{ r: centerR, c: centerC, dist: 0 }];
        const visited = Array.from({ length: this.gridSize }, () => Array(this.gridSize).fill(false));
        if (centerR >= 0 && centerR < this.gridSize && centerC >= 0 && centerC < this.gridSize) {
          visited[centerR][centerC] = true;
        }
        const allDirs = [
          [-1, 0], [1, 0], [0, -1], [0, 1],
          [-1, -1], [-1, 1], [1, -1], [1, 1]
        ];

        while (queue.length > 0 && spots.length < count) {
          queue.sort((a, b) => a.dist - b.dist);
          const curr = queue.shift();

          if (isFree(curr.r, curr.c)) {
            claimed.add(`${curr.r},${curr.c}`);
            spots.push({ r: curr.r, c: curr.c });
            if (spots.length >= count) break;
          }

          for (const [dr, dc] of allDirs) {
            const nr = curr.r + dr;
            const nc = curr.c + dc;
            if (nr >= 0 && nr < this.gridSize && nc >= 0 && nc < this.gridSize && !visited[nr][nc]) {
              visited[nr][nc] = true;
              if (grid[nr][nc] === null) {
                queue.push({
                  r: nr,
                  c: nc,
                  dist: Math.hypot(nr - centerR, nc - centerC)
                });
              }
            }
          }
        }
      }
    }

    // Phase 3: Absolute board safety sweep (if board was heavily partitioned)
    if (spots.length < count) {
      for (let r = 0; r < this.gridSize && spots.length < count; r++) {
        for (let c = 0; c < this.gridSize && spots.length < count; c++) {
          if (isFree(r, c)) {
            claimed.add(`${r},${c}`);
            spots.push({ r, c });
          }
        }
      }
    }

    return spots;
  }

  spawnRandomBreaker() {
    // Only one breaker tile on the board at a time (like in 2048)
    const existingBreakers = this.grid.flat().filter(t => t && t.type === 'breaker');
    if (existingBreakers.length >= 1) return null;

    const emptyCells = this.getEmptyCells();
    if (emptyCells.length === 0) return null;

    const randomIndex = Math.floor(Math.random() * emptyCells.length);
    const { r, c } = emptyCells[randomIndex];

    // Breaker probabilities: 75% for 2, 15% for 4, 10% for 8 (Bonus)
    let val = 2;
    const rand = Math.random();
    if (this.breakerValues.length === 3) {
      if (rand < 0.75) val = 2; // 75%
      else if (rand < 0.90) val = 4; // 15%
      else val = 8; // 10% bonus breaker
    } else {
      if (rand < 0.70) val = 2;
      else if (rand < 0.85) val = 4;
      else if (rand < 0.95) val = 8;
      else val = 16;
    }

    return this.addTile(r, c, val, 'breaker');
  }

  cloneGrid() {
    return this.grid.map(row =>
      row.map(cell => (cell ? { ...cell } : null))
    );
  }

  saveSnapshot() {
    if (this.undoStack.length >= this.maxUndo) {
      this.undoStack.shift();
    }
    this.undoStack.push({
      grid: this.cloneGrid(),
      score: this.score,
      moves: this.moves,
      tilesShattered: this.tilesShattered,
      tileIdCounter: this.tileIdCounter,
      hammerCharges: this.hammerCharges,
      lastHammerScore: this.lastHammerScore,
      warpCharges: this.warpCharges
    });
  }

  undo() {
    if (this.undoStack.length === 0 || this.isWon) return false;

    const snapshot = this.undoStack.pop();
    this.grid = snapshot.grid.map(row =>
      row.map(cell => (cell ? { ...cell } : null))
    );
    this.score = snapshot.score;
    this.moves = snapshot.moves;
    this.tilesShattered = snapshot.tilesShattered;
    this.tileIdCounter = snapshot.tileIdCounter;
    if (snapshot.hammerCharges !== undefined) this.hammerCharges = snapshot.hammerCharges;
    if (snapshot.lastHammerScore !== undefined) this.lastHammerScore = snapshot.lastHammerScore;
    if (snapshot.warpCharges !== undefined) this.warpCharges = snapshot.warpCharges;
    this.isGameOver = false;

    if (this.moveHistory && this.moveHistory.length > 1) {
      this.moveHistory.pop();
    }

    this.saveState();
    this.emit('stateChange', this.getState());
    this.emit('undo');
    return true;
  }

  canUndo() {
    return this.undoStack.length > 0 && !this.isWon;
  }

  // Swipe in direction: 'up', 'down', 'left', 'right'
  move(direction) {
    if (this.isWon || this.isGameOver) return false;

    const vectors = {
      up: { dr: -1, dc: 0 },
      down: { dr: 1, dc: 0 },
      left: { dr: 0, dc: -1 },
      right: { dr: 0, dc: 1 }
    };

    const vector = vectors[direction];
    if (!vector) return false;

    // Reset status flags from previous turns
    for (let r = 0; r < this.gridSize; r++) {
      for (let c = 0; c < this.gridSize; c++) {
        if (this.grid[r][c]) {
          this.grid[r][c].isNew = false;
          this.grid[r][c].justDivided = false;
          this.grid[r][c].isEliminated = false;
          this.grid[r][c].isSpilling = false;
          this.grid[r][c].fromRow = undefined;
          this.grid[r][c].fromCol = undefined;
          this.grid[r][c].spillIndex = undefined;
        }
      }
    }

    // Determine traversal orders
    const rows = [];
    const cols = [];
    for (let i = 0; i < this.gridSize; i++) {
      rows.push(i);
      cols.push(i);
    }
    if (vector.dr === 1) rows.reverse();
    if (vector.dc === 1) cols.reverse();

    let moved = false;
    const interactions = [];
    const snapshotGrid = this.cloneGrid();
    const snapshotScore = this.score;
    const snapshotMoves = this.moves;
    const snapshotShattered = this.tilesShattered;
    const snapshotCounter = this.tileIdCounter;

    // We track tiles that already interacted this turn to prevent multi-hit chaining in a single swipe
    const interactedTiles = new Set();

    rows.forEach(r => {
      cols.forEach(c => {
        const current = this.grid[r][c];
        if (!current) return;

        let curR = r;
        let curC = c;

        // Slide as far as possible
        while (true) {
          const nextR = curR + vector.dr;
          const nextC = curC + vector.dc;

          // Check boundary
          if (nextR < 0 || nextR >= this.gridSize || nextC < 0 || nextC >= this.gridSize) {
            break;
          }

          const target = this.grid[nextR][nextC];

          if (!target) {
            // Slide into empty cell
            this.grid[nextR][nextC] = current;
            this.grid[curR][curC] = null;
            current.row = nextR;
            current.col = nextC;
            curR = nextR;
            curC = nextC;
            moved = true;
          } else {
            // Check interaction: NO MERGERS (Breaker + Breaker = NO; Target + Target = NO)
            // Interaction ONLY happens between Breaker and Target!
            const isBreakerVsTarget =
              (current.type === 'breaker' && target.type === 'target') ||
              (current.type === 'target' && target.type === 'breaker');

            if (isBreakerVsTarget && !interactedTiles.has(current.id) && !interactedTiles.has(target.id)) {
              // Collision & Division occurs!
              const breaker = current.type === 'breaker' ? current : target;
              const numberTile = current.type === 'target' ? current : target;

              const prevVal = numberTile.value;
              const divisor = breaker.value;
              const newVal = Math.floor(prevVal / divisor);

              // Remove the breaker
              this.grid[breaker.row][breaker.col] = null;

              // Clear original position of the sliding tile
              this.grid[curR][curC] = null;

              moved = true;

              const interactionData = {
                type: 'hit',
                breakerValue: divisor,
                oldTargetValue: prevVal,
                newTargetValue: newVal,
                row: nextR,
                col: nextC,
                eliminated: false
              };

              const piecesCount = divisor === 16 ? 16 : (divisor === 8 ? 8 : (divisor === 4 ? 4 : 2));

              if (newVal <= 16) {
                numberTile.isEliminated = true;
                this.grid[nextR][nextC] = null;
                this.tilesShattered += piecesCount;
                this.score += prevVal * divisor;
                interactionData.eliminated = true;
                if (divisor === 8) interactionData.isBonus8 = true;
                if (divisor === 16) interactionData.isBonus16 = true;
              } else {
                // Shatter target tile at collision cell: it becomes empty
                this.grid[nextR][nextC] = null;

                // Carrom Board Kinetic Scatter: pieces spray outward along momentum rays through open cells!
                // Solid tiles act as stationary obstacles (carrom coins) that deflect sliding pieces!
                const spillSpots = this.findFluidSpillSpots(nextR, nextC, piecesCount, this.grid, direction, divisor, newVal);
                spillSpots.forEach((spot, idx) => {
                  const piece = this.addTile(spot.r, spot.c, newVal, 'target');
                  piece.justDivided = true;
                  piece.isSpilling = true;
                  piece.fromRow = nextR;
                  piece.fromCol = nextC;
                  piece.spillIndex = idx;
                  interactedTiles.add(piece.id);
                });

                this.score += prevVal * divisor;
                this.tilesShattered += 1;
                if (divisor === 8) interactionData.isBonus8 = true;
                if (divisor === 16) interactionData.isBonus16 = true;
              }

              interactions.push(interactionData);
            }
            // Cannot slide further past obstacle
            break;
          }
        }
      });
    });

    if (moved) {
      // Save for undo
      if (this.undoStack.length >= this.maxUndo) {
        this.undoStack.shift();
      }
      this.undoStack.push({
        grid: snapshotGrid,
        score: snapshotScore,
        moves: snapshotMoves,
        tilesShattered: snapshotShattered,
        tileIdCounter: snapshotCounter
      });

      this.moves++;

      // Emit interaction sounds / animations (NO CHAIN REACTION)
      interactions.forEach(item => {
        if (item.eliminated) {
          this.emit('tileCleared', item);
        } else {
          this.emit('tileBroken', item);
        }
      });

      // Award Shatter Hammer bonus every 25,000 points
      const HAMMER_POINTS_INTERVAL = 25000;
      if (this.score - this.lastHammerScore >= HAMMER_POINTS_INTERVAL) {
        const awarded = Math.floor((this.score - this.lastHammerScore) / HAMMER_POINTS_INTERVAL);
        this.hammerCharges += awarded;
        this.lastHammerScore += awarded * HAMMER_POINTS_INTERVAL;
        this.emit('hammerAwarded', { count: awarded, total: this.hammerCharges });
      }

      // Award Breaker Warp bonus every 50,000 points
      const WARP_POINTS_INTERVAL = 50000;
      if (this.score - this.lastWarpScore >= WARP_POINTS_INTERVAL) {
        const awarded = Math.floor((this.score - this.lastWarpScore) / WARP_POINTS_INTERVAL);
        this.warpCharges += awarded;
        this.lastWarpScore += awarded * WARP_POINTS_INTERVAL;
        this.emit('warpAwarded', { count: awarded, total: this.warpCharges });
      }

      if (interactions.length === 0) {
        this.emit('tileSlide');
      }

      // Check Victory Condition: All target tiles eliminated!
      let targetCount = 0;
      for (let r = 0; r < this.gridSize; r++) {
        for (let c = 0; c < this.gridSize; c++) {
          if (this.grid[r][c] && this.grid[r][c].type === 'target') {
            targetCount++;
          }
        }
      }

      if (targetCount === 0) {
        this.isWon = true;
        // Board is completely cleared upon victory
        this.grid = Array.from({ length: this.gridSize }, () =>
          Array.from({ length: this.gridSize }, () => null)
        );
        this.emit('victory', { 
          score: this.score, 
          moves: this.moves, 
          level: this.level,
          currentValue: this.currentStartValue,
          nextValue: this.currentStartValue * 2
        });
      } else {
        // Spawn a new breaker tile on an empty cell
        const newBreaker = this.spawnRandomBreaker();

        if (this.checkGameOver()) {
          this.isGameOver = true;
          this.emit('gameOver', { score: this.score, moves: this.moves });
        }
      }

      // Record replay history frame
      let moveDesc = `Swipe ${direction.toUpperCase()}`;
      let soundCue = 'slide';
      if (interactions.length > 0) {
        const first = interactions[0];
        if (first.eliminated) {
          moveDesc = `Swipe ${direction.toUpperCase()} • 💥 Cleared ${first.oldTargetValue.toLocaleString()}`;
          soundCue = 'clear';
        } else {
          moveDesc = `Swipe ${direction.toUpperCase()} • ÷${first.breakerValue} ➔ ${first.newTargetValue.toLocaleString()}`;
          soundCue = 'hit';
        }
      } else if (this.isWon) {
        soundCue = 'victory';
      }

      this.recordHistoryFrame({
        action: { type: 'move', direction, interactions },
        description: moveDesc,
        scoreGain: this.score - snapshotScore,
        soundEvent: soundCue
      });

      this.saveState();
      this.emit('stateChange', this.getState());

      // Check Supernova / Big Bang Finishing
      if (this.supernovaFinishing !== false && !this.isWon && !this.isGameOver) {
        if (this.checkCriticalMass()) {
          this.triggerBigBangFinishing();
        }
      }

      return true;
    } else {
      this.emit('bump');
      return false;
    }
  }

  // Maximum expansion potential under any breaker before guaranteed elimination
  getPeakPieces(value) {
    if (value <= 16) return 0; // Eliminates immediately on any hit
    if (value <= 32) return 1; // 32 / 2 = 16 -> eliminates immediately on any breaker (<=16)
    if (value <= 64) return 2; // 64 / 2 = 32 (2 pieces, which then eliminate on next hit)
    if (value <= 128) return 4; // 128 / 2 = 64 (2 pieces) -> 4 pieces of 32 -> eliminates
    if (value <= 256) return 8; // 256 / 8 = 32 (8 pieces) or 256 / 2 -> 8 pieces -> eliminates
    if (value <= 512) return 32; // 512 / 2 -> up to 32 pieces
    if (value <= 1024) return 64; // 1024 / 2 -> up to 64 pieces
    return 128; // >= 2048
  }

  // Check if remaining target tiles can never possibly overflow or fill the grid
  checkCriticalMass() {
    if (this.supernovaFinishing === false) return false;
    const status = this.getBigBangStatus();
    return !!(status && status.ready);
  }

  // Get comprehensive status of Supernova Big Bang Finishing
  getBigBangStatus() {
    if (this.supernovaFinishing === false) {
      return { enabled: false, ready: false, count: null, text: 'Off', tooltip: 'Big Bang Finishing is disabled in Settings' };
    }
    if (this.isWon || this.isGameOver) {
      return { enabled: true, ready: false, count: 0, text: 'Cleared', tooltip: 'Game completed' };
    }

    const targets = [];
    for (let r = 0; r < this.gridSize; r++) {
      for (let c = 0; c < this.gridSize; c++) {
        const cell = this.grid[r][c];
        if (cell && cell.type === 'target') {
          targets.push(cell);
        }
      }
    }

    if (targets.length === 0) {
      return { enabled: true, ready: false, count: 0, text: 'Cleared', tooltip: 'No tiles remaining' };
    }

    const totalCells = this.gridSize * this.gridSize;
    let totalMaxPieces = 1; // 1 for the breaker tile
    let hasLargeTile = false;
    let maxVal = 0;

    for (const t of targets) {
      if (t.value > maxVal) maxVal = t.value;
      if (t.value > 256) {
        hasLargeTile = true;
      }
      totalMaxPieces += this.getPeakPieces(t.value);
    }

    // Phase 1: Main Division Phase (tiles > 256 remain on board)
    // Big Bang is strictly an endgame cleanup mechanic and will not activate while large tiles exist
    if (hasLargeTile) {
      const maxValFormatted = maxVal >= 1024 ? `${Math.round(maxVal / 1024)}K` : maxVal;
      return {
        enabled: true,
        ready: false,
        count: 'Split',
        text: 'Split >256',
        maxVal,
        hasTitan: true,
        tooltip: `Break tiles down to ≤ 256 (highest is ${maxValFormatted}). Big Bang auto-clears once only small pieces remain!`
      };
    }

    // Phase 2: Endgame Cleanup Phase (all remaining tiles on board are <= 256)
    // Under 8-dividers, all tiles <= 128 (128, 64, 32, 16) shatter directly to 0.
    // The ONLY tiles that multiply under an 8-breaker are 256 tiles (each makes 8 pieces).
    const maxAllowed256 = Math.floor((totalCells - 2) / 8);
    let count256 = 0;
    for (const t of targets) {
      if (t.value === 256) count256++;
    }

    if (count256 <= maxAllowed256) {
      return {
        enabled: true,
        ready: true,
        count: 0,
        text: 'READY!',
        excess: 0,
        hasTitan: false,
        count256,
        maxAllowed256,
        tooltip: '💥 Big Bang READY! All tiles will shatter without overflowing. Any swipe ignites victory!'
      };
    }

    const tilesToReduce = count256 - maxAllowed256;
    return {
      enabled: true,
      ready: false,
      count: tilesToReduce,
      text: `${tilesToReduce} of [256]`,
      excess: tilesToReduce,
      hasTitan: false,
      count256,
      maxAllowed256,
      tooltip: `You have ${count256} tiles of 256. Reduce ${tilesToReduce} of them (keep ≤ ${maxAllowed256} on ${this.gridSize}×${this.gridSize}) to ignite Big Bang!`
    };
  }

  // Calculate how many target tiles must be reduced to reach Big Bang Finishing
  getBigBangTilesToReduce() {
    const status = this.getBigBangStatus();
    if (!status.enabled) return null;
    return status.count;
  }

  // Execute Supernova / Big Bang Finishing with escalating explosions
  triggerBigBangFinishing() {
    const targets = [];
    for (let r = 0; r < this.gridSize; r++) {
      for (let c = 0; c < this.gridSize; c++) {
        const cell = this.grid[r][c];
        if (cell && cell.type === 'target') {
          targets.push({ ...cell, row: r, col: c });
        }
      }
    }

    if (targets.length === 0) return false;

    // Escalating sequence: smallest tiles to largest tiles!
    targets.sort((a, b) => a.value - b.value);

    let totalGain = 0;
    targets.forEach(t => {
      // Award full elimination points for all remaining tiles (val * 8 equivalent)
      const gain = t.value * 8;
      totalGain += gain;
      this.score += gain;
      this.tilesShattered++;
      this.grid[t.row][t.col] = null;
    });

    this.isWon = true;

    // Record special Supernova history frame for replay
    this.recordHistoryFrame({
      action: { type: 'supernova', tiles: targets },
      description: `💥 Supernova Big Bang Finishing • Shattered ${targets.length} Tiles!`,
      scoreGain: totalGain,
      soundEvent: 'victory'
    });

    this.saveState();
    this.emit('stateChange', this.getState());
    this.emit('supernova', {
      sortedTiles: targets,
      scoreGain: totalGain,
      score: this.score,
      moves: this.moves,
      level: this.level,
      nextValue: Math.pow(2, this.level + 12)
    });

    return true;
  }

  // Check if any valid move exists
  checkGameOver() {
    // If there's any empty cell, game is not over
    if (this.getEmptyCells().length > 0) return false;

    // Check adjacent cells for any valid Breaker vs Target interaction
    for (let r = 0; r < this.gridSize; r++) {
      for (let c = 0; c < this.gridSize; c++) {
        const cell = this.grid[r][c];
        if (!cell) return false;

        const neighbors = [
          { r: r - 1, c },
          { r: r + 1, c },
          { r, c: c - 1 },
          { r, c: c + 1 }
        ];

        for (const n of neighbors) {
          if (n.r >= 0 && n.r < this.gridSize && n.c >= 0 && n.c < this.gridSize) {
            const neighbor = this.grid[n.r][n.c];
            if (neighbor) {
              // Can interact if one is breaker and one is target
              if (
                (cell.type === 'breaker' && neighbor.type === 'target') ||
                (cell.type === 'target' && neighbor.type === 'breaker')
              ) {
                return false; // Valid move exists!
              }
            }
          }
        }
      }
    }

    return true; // No empty cells and no possible breaker-target collisions
  }

  // Pure non-mutating simulation of a move in 'up' | 'down' | 'left' | 'right'
  simulateMove(direction) {
    if (this.isWon || this.isGameOver) {
      return {
        direction,
        valid: false,
        moved: false,
        reason: 'game_ended'
      };
    }

    const vectors = {
      up: { dr: -1, dc: 0 },
      down: { dr: 1, dc: 0 },
      left: { dr: 0, dc: -1 },
      right: { dr: 0, dc: 1 }
    };

    const vector = vectors[direction];
    if (!vector) {
      return { direction, valid: false, moved: false, reason: 'invalid_direction' };
    }

    // Locate active breaker
    const breaker = this.grid.flat().find(t => t && t.type === 'breaker');
    if (!breaker) {
      return { direction, valid: false, moved: false, reason: 'no_breaker' };
    }

    // Clone grid with deep cell clones, resetting simulation-only flags
    const simGrid = this.grid.map((row, r) =>
      row.map((cell, c) => (cell ? {
        ...cell,
        row: r,
        col: c,
        origRow: r,
        origCol: c,
        wasPushed: false,
        pushDr: 0,
        pushDc: 0
      } : null))
    );

    const rows = [];
    const cols = [];
    for (let i = 0; i < this.gridSize; i++) {
      rows.push(i);
      cols.push(i);
    }
    if (vector.dr === 1) rows.reverse();
    if (vector.dc === 1) cols.reverse();

    let moved = false;
    let collision = null;
    let breakerMoved = false;
    const breakerPath = [{ row: breaker.row, col: breaker.col }];
    const interactedTiles = new Set();

    // Map initial target positions
    const initialTargets = new Map();
    this.grid.forEach(row => {
      row.forEach(c => {
        if (c && c.type === 'target') {
          initialTargets.set(c.id, { row: c.row, col: c.col, value: c.value });
        }
      });
    });

    // Run exact traversal simulation
    rows.forEach(r => {
      cols.forEach(c => {
        const current = simGrid[r][c];
        if (!current) return;

        let curR = r;
        let curC = c;

        while (true) {
          const nextR = curR + vector.dr;
          const nextC = curC + vector.dc;

          // Boundary check
          if (nextR < 0 || nextR >= this.gridSize || nextC < 0 || nextC >= this.gridSize) {
            break;
          }

          const target = simGrid[nextR][nextC];

          if (!target) {
            // Slide into empty cell
            simGrid[nextR][nextC] = current;
            simGrid[curR][curC] = null;
            current.row = nextR;
            current.col = nextC;
            curR = nextR;
            curC = nextC;
            moved = true;
            if (current.id === breaker.id) {
              breakerMoved = true;
              breakerPath.push({ row: nextR, col: nextC });
            }
          } else {
            // Check interaction: Breaker vs Target
            const isBreakerVsTarget =
              (current.type === 'breaker' && target.type === 'target') ||
              (current.type === 'target' && target.type === 'breaker');

            if (isBreakerVsTarget && !interactedTiles.has(current.id) && !interactedTiles.has(target.id)) {
              const simBreaker = current.type === 'breaker' ? current : target;
              const simTarget = current.type === 'target' ? current : target;

              const prevVal = simTarget.value;
              const divisor = simBreaker.value;
              const newVal = Math.floor(prevVal / divisor);
              const willEliminate = newVal <= 16;
              const initialTargetPos = initialTargets.get(simTarget.id) || { row: simTarget.row, col: simTarget.col };

              const piecesCount = divisor === 16 ? 16 : (divisor === 8 ? 8 : (divisor === 4 ? 4 : 2));

              collision = {
                breakerId: simBreaker.id,
                breakerValue: divisor,
                targetId: simTarget.id,
                targetInitialPos: initialTargetPos,
                targetPreCollisionPos: { row: simTarget.row, col: simTarget.col },
                collisionCell: { row: nextR, col: nextC },
                oldValue: prevVal,
                newValue: newVal,
                eliminated: willEliminate,
                piecesCount: piecesCount,
                scoreGain: prevVal * divisor
              };

              if (current.id === breaker.id) {
                breakerPath.push({ row: nextR, col: nextC });
                breakerMoved = true;
              }

              simGrid[simBreaker.row][simBreaker.col] = null;
              simGrid[curR][curC] = null;
              interactedTiles.add(simBreaker.id);
              interactedTiles.add(simTarget.id);
              moved = true;

              if (willEliminate) {
                simGrid[nextR][nextC] = null;
              } else {
                // Shatter target tile at collision cell: it becomes empty
                simGrid[nextR][nextC] = null;

                // Carrom Board Kinetic Scatter preview: pieces spray along momentum rays
                const spillSpots = this.findFluidSpillSpots(nextR, nextC, piecesCount, simGrid, direction, divisor, newVal);
                spillSpots.forEach(spot => {
                  simGrid[spot.r][spot.c] = {
                    row: spot.r,
                    col: spot.c,
                    value: newVal,
                    type: 'target',
                    isNewPiece: true
                  };
                });
              }
            }
            break;
          }
        }
      });
    });

    const breakerEndPos = breakerPath[breakerPath.length - 1];

    // Check if breaker hit the outer wall
    let hitWall = false;
    if (!collision) {
      if (
        (vector.dr === -1 && breakerEndPos.row === 0) ||
        (vector.dr === 1 && breakerEndPos.row === this.gridSize - 1) ||
        (vector.dc === -1 && breakerEndPos.col === 0) ||
        (vector.dc === 1 && breakerEndPos.col === this.gridSize - 1)
      ) {
        hitWall = true;
      }
    }

    // Fission risk calculation: if collision occurs and does not eliminate
    let fissionRisk = null;
    if (collision && !collision.eliminated) {
      const emptyCount = simGrid.flat().filter(cell => cell === null).length;
      fissionRisk = {
        pieces: collision.piecesCount,
        emptyCellsAvailable: emptyCount,
        isCrowded: emptyCount <= collision.piecesCount + 2,
        isSevere: emptyCount <= collision.piecesCount
      };
    }

    // Collect all resulting projected tiles
    const projectedTiles = [];
    for (let r = 0; r < this.gridSize; r++) {
      for (let c = 0; c < this.gridSize; c++) {
        const cell = simGrid[r][c];
        if (cell) {
          projectedTiles.push({
            id: cell.id,
            row: r,
            col: c,
            origRow: cell.origRow,
            origCol: cell.origCol,
            value: cell.value,
            type: cell.type,
            isNewPiece: !!cell.isNewPiece,
            wasPushed: !!cell.wasPushed,
            pushDr: cell.pushDr !== undefined ? cell.pushDr : 0,
            pushDc: cell.pushDc !== undefined ? cell.pushDc : 0,
            hasMoved: cell.origRow !== undefined && (cell.origRow !== r || cell.origCol !== c)
          });
        }
      }
    }

    // Projected free-space and occupancy impact
    const totalCells = this.gridSize * this.gridSize;
    const currentOccupied = this.grid.flat().filter(cell => cell !== null).length;
    let projectedOccupied = currentOccupied;

    if (collision) {
      if (collision.eliminated) {
        projectedOccupied = Math.max(0, currentOccupied - 1);
      } else {
        projectedOccupied = currentOccupied - 1 + collision.piecesCount;
      }
    }

    return {
      direction,
      valid: moved,
      moved,
      breakerMoved,
      breakerStart: { row: breaker.row, col: breaker.col, value: breaker.value },
      breakerEnd: breakerEndPos,
      breakerPath,
      collision,
      hitWall,
      fissionRisk,
      totalCells,
      currentOccupied,
      projectedOccupied,
      projectedTiles
    };
  }

  // Pre-calculate preview outcomes for all 4 directions
  simulateAllDirections() {
    return {
      up: this.simulateMove('up'),
      down: this.simulateMove('down'),
      left: this.simulateMove('left'),
      right: this.simulateMove('right')
    };
  }

  getState() {
    return {
      grid: this.cloneGrid(),
      gridSize: this.gridSize,
      score: this.score,
      moves: this.moves,
      tilesShattered: this.tilesShattered,
      isWon: this.isWon,
      isGameOver: this.isGameOver,
      canUndo: this.canUndo(),
      breakerValues: [...this.breakerValues],
      level: this.level,
      currentStartValue: this.currentStartValue,
      hammerCharges: this.hammerCharges,
      lastHammerScore: this.lastHammerScore,
      warpCharges: this.warpCharges,
      lastWarpScore: this.lastWarpScore,
      tileIdCounter: this.tileIdCounter,
      moveHistory: this.moveHistory ? this.moveHistory.map(f => ({
        ...f,
        state: {
          ...f.state,
          grid: f.state && f.state.grid ? f.state.grid.map(row => row.map(c => c ? { ...c } : null)) : []
        }
      })) : [],
      sessionStartTime: this.sessionStartTime,
      supernovaFinishing: this.supernovaFinishing !== false
    };
  }

  loadState(state) {
    this.gridSize = state.gridSize || 8;
    this.grid = state.grid.map((row, r) =>
      row.map((cell, c) => {
        if (!cell) return null;
        return {
          ...cell,
          row: r,
          col: c
        };
      })
    );
    this.score = state.score || 0;
    this.moves = state.moves || 0;
    this.tilesShattered = state.tilesShattered || 0;
    this.isWon = state.isWon || false;
    this.isGameOver = state.isGameOver || false;
    this.breakerValues = state.breakerValues || [2, 4, 8];
    this.level = state.level || 1;
    this.currentStartValue = state.currentStartValue || 4096;
    this.hammerCharges = state.hammerCharges !== undefined ? state.hammerCharges : 1;
    this.lastHammerScore = state.lastHammerScore !== undefined ? state.lastHammerScore : Math.floor(this.score / 25000) * 25000;
    this.warpCharges = state.warpCharges !== undefined ? state.warpCharges : 1;
    this.lastWarpScore = state.lastWarpScore !== undefined ? state.lastWarpScore : Math.floor(this.score / 50000) * 50000;
    this.moveHistory = (state.moveHistory || []).map(f => {
      if (f && f.score === undefined && f.state && f.state.score !== undefined) {
        return { ...f, score: f.state.score };
      }
      return f;
    });
    this.sessionStartTime = state.sessionStartTime || Date.now();
    this.supernovaFinishing = state.supernovaFinishing !== undefined ? state.supernovaFinishing : true;
    if (this.moveHistory.length === 0 && !this.isWon && !this.isGameOver) {
      this.recordHistoryFrame({
        action: { type: 'init' },
        description: `Game resumed • Target ${this.currentStartValue.toLocaleString()}`,
        soundEvent: null
      });
    }

    // Auto-heal duplicate tile IDs and establish valid tileIdCounter
    const existingIds = new Set();
    let maxId = 0;
    let needsReindexing = false;

    this.grid.forEach(row => {
      row.forEach(cell => {
        if (!cell) return;
        if (!cell.id || existingIds.has(cell.id)) {
          needsReindexing = true;
        } else {
          existingIds.add(cell.id);
          if (cell.id > maxId) maxId = cell.id;
        }
      });
    });

    if (needsReindexing || state.tileIdCounter === undefined) {
      let nextId = 1;
      this.grid.forEach(row => {
        row.forEach(cell => {
          if (cell) {
            cell.id = nextId++;
          }
        });
      });
      this.tileIdCounter = nextId;
    } else {
      this.tileIdCounter = Math.max(state.tileIdCounter, maxId + 1);
    }

    // Auto-heal missing breaker: if no breaker exists and empty cells exist, spawn one
    const breakers = this.grid.flat().filter(t => t && t.type === 'breaker');
    if (breakers.length === 0 && !this.isWon && !this.isGameOver && this.getEmptyCells().length > 0) {
      this.spawnRandomBreaker();
    }

    this.undoStack = [];
    this.saveState();
    this.emit('stateChange', this.getState());
  }

  saveState() {
    if (typeof window !== 'undefined' && window.storageManager) {
      if (this.isGameOver) {
        window.storageManager.clearGameState();
        window.storageManager.recordGameEnd(false, this.tilesShattered);
      } else {
        window.storageManager.saveGameState(this.getState());
        if (this.isWon) {
          window.storageManager.recordGameEnd(true, this.tilesShattered);
        }
      }
      window.storageManager.setBestScore(this.score);
      window.storageManager.setHighestLevel(this.level);
      window.storageManager.setLevelScore(this.level, this.score);
    }
  }
}

if (typeof window !== 'undefined') {
  window.GameEngine = GameEngine;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = GameEngine;
}
