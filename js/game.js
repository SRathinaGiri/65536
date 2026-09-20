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
    
    this.listeners = [];
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

  getEmptyCells() {
    const cells = [];
    for (let r = 0; r < this.gridSize; r++) {
      for (let c = 0; c < this.gridSize; c++) {
        if (!this.grid[r][c]) {
          cells.push({ r, c });
        }
      }
    }
    return cells;
  }

  findNearestEmptyCell(targetR, targetC) {
    const emptyCells = this.getEmptyCells();
    if (emptyCells.length === 0) return null;

    // Prioritize adjacent direct neighbors
    const directNeighbors = emptyCells.filter(cell =>
      (Math.abs(cell.r - targetR) === 1 && cell.c === targetC) ||
      (Math.abs(cell.c - targetC) === 1 && cell.r === targetR)
    );
    if (directNeighbors.length > 0) {
      return directNeighbors[Math.floor(Math.random() * directNeighbors.length)];
    }

    // Sort by Manhattan distance
    emptyCells.sort((a, b) => {
      const distA = Math.abs(a.r - targetR) + Math.abs(a.c - targetC);
      const distB = Math.abs(b.r - targetR) + Math.abs(b.c - targetC);
      return distA - distB;
    });

    return emptyCells[0];
  }

  pushTileOutward(fromR, fromC, dr, dc) {
    const tileToPush = this.grid[fromR][fromC];
    if (!tileToPush) return null;

    let testR = fromR + dr;
    let testC = fromC + dc;
    let targetSpot = null;

    while (testR >= 0 && testR < this.gridSize && testC >= 0 && testC < this.gridSize) {
      if (this.grid[testR][testC] === null) {
        targetSpot = { r: testR, c: testC };
        break;
      }
      testR += dr;
      testC += dc;
    }

    if (!targetSpot) {
      targetSpot = this.findNearestEmptyCell(fromR, fromC);
    }

    if (targetSpot) {
      this.grid[targetSpot.r][targetSpot.c] = tileToPush;
      tileToPush.row = targetSpot.r;
      tileToPush.col = targetSpot.c;
      this.grid[fromR][fromC] = null;
      return targetSpot;
    }
    return null;
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

              // Check Breaker by value: 8 -> 8 pieces, 4 -> 4 pieces, 2 -> 2 pieces
              if (divisor === 8) {
                // Breaker 8: 8 pieces in all 8 surrounding cells
                if (newVal <= 16) {
                  numberTile.isEliminated = true;
                  this.grid[nextR][nextC] = null;
                  this.tilesShattered += 8;
                  this.score += prevVal * 8;
                  interactionData.eliminated = true;
                  interactionData.isBonus8 = true;
                } else {
                  this.grid[nextR][nextC] = null;

                  const surroundingDirs = [
                    [-1, -1], [-1, 0], [-1, 1],
                    [0, -1],           [0, 1],
                    [1, -1],  [1, 0],  [1, 1]
                  ];

                  surroundingDirs.forEach(([dr, dc]) => {
                    const nr = nextR + dr;
                    const nc = nextC + dc;

                    if (nr >= 0 && nr < this.gridSize && nc >= 0 && nc < this.gridSize) {
                      if (this.grid[nr][nc] !== null) {
                        this.pushTileOutward(nr, nc, dr, dc);
                      }

                      if (this.grid[nr][nc] === null) {
                        const piece = this.addTile(nr, nc, newVal, 'target');
                        piece.justDivided = true;
                        interactedTiles.add(piece.id);
                      } else {
                        const spot = this.findNearestEmptyCell(nextR, nextC);
                        if (spot) {
                          const piece = this.addTile(spot.r, spot.c, newVal, 'target');
                          piece.justDivided = true;
                          interactedTiles.add(piece.id);
                        }
                      }
                    } else {
                      const spot = this.findNearestEmptyCell(nextR, nextC);
                      if (spot) {
                        const piece = this.addTile(spot.r, spot.c, newVal, 'target');
                        piece.justDivided = true;
                        interactedTiles.add(piece.id);
                      }
                    }
                  });

                  this.score += prevVal * 8;
                  this.tilesShattered += 1;
                  interactionData.isBonus8 = true;
                }
              } else if (divisor === 4) {
                // Breaker 4: 4 pieces in 4 cardinal cross directions (Up, Down, Left, Right)
                if (newVal <= 16) {
                  numberTile.isEliminated = true;
                  this.grid[nextR][nextC] = null;
                  this.tilesShattered += 4;
                  this.score += prevVal * 4;
                  interactionData.eliminated = true;
                } else {
                  this.grid[nextR][nextC] = null;

                  const crossDirs = [
                    [-1, 0], // Up
                    [1, 0],  // Down
                    [0, -1], // Left
                    [0, 1]   // Right
                  ];

                  crossDirs.forEach(([dr, dc]) => {
                    const nr = nextR + dr;
                    const nc = nextC + dc;

                    if (nr >= 0 && nr < this.gridSize && nc >= 0 && nc < this.gridSize) {
                      if (this.grid[nr][nc] !== null) {
                        this.pushTileOutward(nr, nc, dr, dc);
                      }

                      if (this.grid[nr][nc] === null) {
                        const piece = this.addTile(nr, nc, newVal, 'target');
                        piece.justDivided = true;
                        interactedTiles.add(piece.id);
                      } else {
                        const spot = this.findNearestEmptyCell(nextR, nextC);
                        if (spot) {
                          const piece = this.addTile(spot.r, spot.c, newVal, 'target');
                          piece.justDivided = true;
                          interactedTiles.add(piece.id);
                        }
                      }
                    } else {
                      const spot = this.findNearestEmptyCell(nextR, nextC);
                      if (spot) {
                        const piece = this.addTile(spot.r, spot.c, newVal, 'target');
                        piece.justDivided = true;
                        interactedTiles.add(piece.id);
                      }
                    }
                  });

                  this.score += prevVal * 4;
                  this.tilesShattered += 1;
                }
              } else if (divisor === 16) {
                // Breaker 16: 16 pieces (value ÷ 16)
                if (newVal <= 16) {
                  numberTile.isEliminated = true;
                  this.grid[nextR][nextC] = null;
                  this.tilesShattered += 16;
                  this.score += prevVal * 16;
                  interactionData.eliminated = true;
                  interactionData.isBonus16 = true;
                } else {
                  this.grid[nextR][nextC] = null;

                  const surroundingDirs16 = [
                    [-1, -1], [-1, 0], [-1, 1],
                    [0, -1],           [0, 1],
                    [1, -1],  [1, 0],  [1, 1],
                    [-2, 0], [2, 0], [0, -2], [0, 2],
                    [-2, -1], [-2, 1], [2, -1], [2, 1]
                  ];

                  surroundingDirs16.forEach(([dr, dc]) => {
                    const nr = nextR + dr;
                    const nc = nextC + dc;

                    if (nr >= 0 && nr < this.gridSize && nc >= 0 && nc < this.gridSize) {
                      if (this.grid[nr][nc] !== null) {
                        this.pushTileOutward(nr, nc, dr, dc);
                      }

                      if (this.grid[nr][nc] === null) {
                        const piece = this.addTile(nr, nc, newVal, 'target');
                        piece.justDivided = true;
                        interactedTiles.add(piece.id);
                      } else {
                        const spot = this.findNearestEmptyCell(nextR, nextC);
                        if (spot) {
                          const piece = this.addTile(spot.r, spot.c, newVal, 'target');
                          piece.justDivided = true;
                          interactedTiles.add(piece.id);
                        }
                      }
                    } else {
                      const spot = this.findNearestEmptyCell(nextR, nextC);
                      if (spot) {
                        const piece = this.addTile(spot.r, spot.c, newVal, 'target');
                        piece.justDivided = true;
                        interactedTiles.add(piece.id);
                      }
                    }
                  });

                  this.score += prevVal * 16;
                  this.tilesShattered += 1;
                  interactionData.isBonus16 = true;
                }
              } else {
                // Breaker 2: 2 pieces (value ÷ 2)
                if (newVal <= 16) {
                  numberTile.isEliminated = true;
                  this.grid[nextR][nextC] = null; // Both tiles disappear from board!
                  this.tilesShattered += 2;
                  this.score += prevVal * 2;
                  interactionData.eliminated = true;
                } else {
                  // Place First tile at collision point (nextR, nextC)
                  numberTile.row = nextR;
                  numberTile.col = nextC;
                  numberTile.value = newVal;
                  numberTile.justDivided = true;
                  this.grid[nextR][nextC] = numberTile;
                  interactedTiles.add(numberTile.id);

                  // Place Second twin tile of the same divided value
                  let splitSpot = null;
                  if (this.grid[curR][curC] === null && (curR !== nextR || curC !== nextC)) {
                    splitSpot = { r: curR, c: curC };
                  } else {
                    splitSpot = this.findNearestEmptyCell(nextR, nextC);
                  }

                  if (splitSpot) {
                    const secondTile = this.addTile(splitSpot.r, splitSpot.c, newVal, 'target');
                    secondTile.justDivided = true;
                    interactedTiles.add(secondTile.id);
                  }

                  // Points earned: exactly proportional (prevVal * 2)
                  this.score += prevVal * 2;
                }
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

        // Check Game Over (Loss)
        if (this.checkGameOver()) {
          this.isGameOver = true;
          this.emit('gameOver', { score: this.score, moves: this.moves });
        }
      }

      this.saveState();
      this.emit('stateChange', this.getState());
      return true;
    } else {
      this.emit('bump');
      return false;
    }
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

    // Clone grid with deep cell clones
    const simGrid = this.grid.map((row, r) =>
      row.map((cell, c) => (cell ? { ...cell, row: r, col: c } : null))
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
      projectedOccupied
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
      tileIdCounter: this.tileIdCounter
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
    if (window.storageManager) {
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

window.GameEngine = GameEngine;
