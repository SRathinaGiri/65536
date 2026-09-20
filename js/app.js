// Main application controller integrating game logic, UI, audio, and PWA
document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements
  const boardEl = document.getElementById('board');
  const canvasEl = document.getElementById('particleCanvas');
  const scoreValEl = document.getElementById('scoreValue');
  const bestScoreValEl = document.getElementById('bestScoreValue');
  const shatteredValEl = document.getElementById('shatteredValue');
  const levelValEl = document.getElementById('levelValue');
  const undoBtn = document.getElementById('undoBtn');
  const hammerBtn = document.getElementById('hammerBtn');
  const hammerCountEl = document.getElementById('hammerCount');
  const hammerBannerEl = document.getElementById('hammerBanner');
  const warpBtn = document.getElementById('warpBtn');
  const warpCountEl = document.getElementById('warpCount');
  const warpBannerEl = document.getElementById('warpBanner');
  const newGameBtn = document.getElementById('newGameBtn');
  const soundToggleBtn = document.getElementById('soundToggleBtn');
  const toggleSoundSetting = document.getElementById('toggleSoundSetting');
  const gameToastEl = document.getElementById('gameToast');
  const helpBtn = document.getElementById('helpBtn');
  const settingsBtn = document.getElementById('settingsBtn');
  const headerInstallBtn = document.getElementById('headerInstallBtn');
  const dpadContainer = document.getElementById('dpadContainer');
  const installBanner = document.getElementById('installBanner');
  const installBannerText = document.getElementById('installBannerText');
  const installBtn = document.getElementById('installBtn');
  const closeInstallBtn = document.getElementById('closeInstallBtn');
  const settingsInstallBtn = document.getElementById('settingsInstallBtn');
  const settingsInstallNote = document.getElementById('settingsInstallNote');
  const tutorialBanner = document.getElementById('tutorialBanner');
  const tutorialStep1 = document.getElementById('tutorialStep1');
  const tutorialStep2 = document.getElementById('tutorialStep2');
  const tutorialSkipBtn = document.getElementById('tutorialSkipBtn');
  const tutorialCloseBtn = document.getElementById('tutorialCloseBtn');
  const tutorialDoneBtn = document.getElementById('tutorialDoneBtn');
  const replayTutorialBtn = document.getElementById('replayTutorialBtn');

  // Modals
  const helpModal = document.getElementById('helpModal');
  const settingsModal = document.getElementById('settingsModal');
  const winModal = document.getElementById('winModal');
  const gameOverModal = document.getElementById('gameOverModal');

  // Settings inputs
  const selectGridSize = document.getElementById('selectGridSize');
  const selectStartLevel = document.getElementById('selectStartLevel');
  const selectBreakerSet = document.getElementById('selectBreakerSet');
  const toggleDpad = document.getElementById('toggleDpad');
  const toggleTrajectoryPreview = document.getElementById('toggleTrajectoryPreview');
  const toggleTrajectoryCompass = document.getElementById('toggleTrajectoryCompass');
  const trajectoryCompass = document.getElementById('trajectoryCompass');
  const chipOutcomeUp = document.getElementById('chipOutcomeUp');
  const chipOutcomeLeft = document.getElementById('chipOutcomeLeft');
  const chipOutcomeRight = document.getElementById('chipOutcomeRight');
  const chipOutcomeDown = document.getElementById('chipOutcomeDown');
  const saveSettingsBtn = document.getElementById('saveSettingsBtn');

  // Win/Loss elements
  const winScoreEl = document.getElementById('winScore');
  const winMovesEl = document.getElementById('winMoves');
  const winNextLevelBtn = document.getElementById('winNextLevelBtn');
  const winNextTargetEl = document.getElementById('winNextTarget');
  const winPlayAgainBtn = document.getElementById('winPlayAgainBtn');
  const lossScoreEl = document.getElementById('lossScore');
  const lossRetryBtn = document.getElementById('lossRetryBtn');

  // Replay elements
  const replayHeaderBtn = document.getElementById('replayHeaderBtn');
  const replayModal = document.getElementById('replayModal');
  const closeReplayBtn = document.getElementById('closeReplayBtn');
  const replayBoardEl = document.getElementById('replayBoard');
  const replayCanvasEl = document.getElementById('replayParticleCanvas');
  const replaySubtitle = document.getElementById('replaySubtitle');
  const replayActionText = document.getElementById('replayActionText');
  const replayScoreDelta = document.getElementById('replayScoreDelta');
  const replayTimeDisplay = document.getElementById('replayTimeDisplay');
  const replayStepDisplay = document.getElementById('replayStepDisplay');
  const replayScrubber = document.getElementById('replayScrubber');
  const replayFirstBtn = document.getElementById('replayFirstBtn');
  const replayPrevBtn = document.getElementById('replayPrevBtn');
  const replayPlayBtn = document.getElementById('replayPlayBtn');
  const replayNextBtn = document.getElementById('replayNextBtn');
  const replayLastBtn = document.getElementById('replayLastBtn');
  const replaySpeedChips = document.querySelectorAll('.replay-speed-selector .speed-chip');
  const exportReplayBtn = document.getElementById('exportReplayBtn');
  const importReplayBtn = document.getElementById('importReplayBtn');
  const replayFileInput = document.getElementById('replayFileInput');
  const winReplayBtn = document.getElementById('winReplayBtn');
  const lossReplayBtn = document.getElementById('lossReplayBtn');

  // Toast notification helper
  let toastTimer = null;
  function showToast(message) {
    if (!gameToastEl) return;
    gameToastEl.textContent = message;
    gameToastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      gameToastEl.classList.remove('show');
    }, 2500);
  }

  // Load Settings
  let settings = window.storageManager.getSettings();
  const breakerValues = settings.breakerSet === 4 ? [2, 4, 8, 16] : [2, 4, 8];

  // Initialize Game, Renderer, Input
  const game = new GameEngine({
    gridSize: settings.gridSize,
    breakerValues: breakerValues,
    divisionMode: settings.divisionMode
  });

  const renderer = new BoardRenderer(boardEl, canvasEl);
  const input = new InputManager(boardEl);
  if (dpadContainer) input.bindDpad(dpadContainer);
  if (trajectoryCompass) input.bindCompass(trajectoryCompass);

  // Apply D-pad and Compass visibility
  if (dpadContainer) {
    dpadContainer.style.display = settings.dpadEnabled ? 'flex' : 'none';
  }

  function applySettingsClasses() {
    if (boardEl) {
      if (settings.trajectoryPreview === false) {
        boardEl.classList.add('hide-trajectory-preview');
      } else {
        boardEl.classList.remove('hide-trajectory-preview');
      }
    }
    if (trajectoryCompass) {
      if (settings.compassEnabled === false) {
        trajectoryCompass.classList.add('hide-trajectory-compass');
      } else {
        trajectoryCompass.classList.remove('hide-trajectory-compass');
        updateCompassOutcomes();
      }
    }
  }

  function updateCompassOutcomes() {
    if (!trajectoryCompass || !game || settings.compassEnabled === false) return;
    if (game.isWon || game.isGameOver) {
      ['Up', 'Down', 'Left', 'Right'].forEach(dir => {
        const el = document.getElementById(`chipOutcome${dir}`);
        if (el) el.textContent = '—';
      });
      return;
    }

    const simResults = game.simulateAllDirections();
    const dirMap = {
      up: chipOutcomeUp,
      down: chipOutcomeDown,
      left: chipOutcomeLeft,
      right: chipOutcomeRight
    };

    for (const [dir, chipEl] of Object.entries(dirMap)) {
      if (!chipEl) continue;
      const btn = chipEl.closest('.compass-chip');
      const res = simResults[dir];

      if (btn) {
        btn.classList.remove(
          'chip-collision',
          'chip-eliminated',
          'chip-wall',
          'chip-disabled',
          'chip-tier-green',
          'chip-tier-amber',
          'chip-tier-red'
        );
      }

      if (!res || !res.valid) {
        chipEl.textContent = '—';
        if (btn) btn.classList.add('chip-disabled');
      } else if (res.collision) {
        const totalCells = res.totalCells || (game.gridSize * game.gridSize);
        const curOcc = res.currentOccupied || 0;
        const projOcc = res.projectedOccupied || curOcc;
        const remainingEmpty = totalCells - projOcc;

        let tier = 'amber';
        if (res.collision.eliminated) {
          tier = 'green';
        } else if (
          res.collision.piecesCount >= 8 ||
          (res.fissionRisk && res.fissionRisk.isCrowded) ||
          remainingEmpty <= 4 ||
          projOcc >= Math.floor(totalCells * 0.85)
        ) {
          tier = 'red';
        }

        if (btn) btn.classList.add(`chip-tier-${tier}`);

        if (res.collision.eliminated) {
          chipEl.innerHTML = `<span class="chip-action">💥 Clear</span>`;
        } else {
          chipEl.innerHTML = `<span class="chip-action">÷${res.collision.breakerValue}➔${res.collision.newValue}</span>`;
        }
      } else if (res.hitWall) {
        chipEl.innerHTML = `<span class="chip-action">Wall</span>`;
        if (btn) btn.classList.add('chip-wall');
      } else {
        chipEl.innerHTML = `<span class="chip-action">Slide</span>`;
      }
    }
  }

  let currentAimDirection = null;

  function updateTrajectoryDisplay(direction = null) {
    if (!game || game.isWon || game.isGameOver || hammerMode || warpMode) {
      renderer.clearTrajectoryPreview();
      return;
    }
    if (settings.trajectoryPreview === false) {
      renderer.clearTrajectoryPreview();
      return;
    }
    currentAimDirection = direction || null;

    // Highlight active chip in compass ONLY when actively aiming
    if (trajectoryCompass) {
      trajectoryCompass.querySelectorAll('.compass-chip').forEach(btn => {
        if (currentAimDirection && btn.getAttribute('data-dir') === currentAimDirection) {
          btn.classList.add('chip-active');
        } else {
          btn.classList.remove('chip-active');
        }
      });
    }

    const allSims = game.simulateAllDirections();
    renderer.renderTrajectorySystem(allSims, currentAimDirection);
  }

  applySettingsClasses();

  // Audio mute button and settings synchronization
  function updateSoundButton() {
    const muted = window.soundFX.isMuted();
    soundToggleBtn.innerHTML = muted
      ? '<span class="icon">🔇</span>'
      : '<span class="icon">🔊</span>';
    soundToggleBtn.setAttribute('aria-label', muted ? 'Unmute Sound' : 'Mute Sound');
    soundToggleBtn.title = muted ? 'Sound Effects: MUTED (Tap to unmute)' : 'Sound Effects: ON (Tap to mute)';
    if (toggleSoundSetting) {
      toggleSoundSetting.checked = !muted;
    }
  }
  updateSoundButton();

  soundToggleBtn.addEventListener('click', () => {
    const isMuted = window.soundFX.toggleMute();
    updateSoundButton();
    showToast(isMuted ? '🔇 Sound Muted' : '🔊 Sound Enabled');
  });

  if (toggleSoundSetting) {
    toggleSoundSetting.addEventListener('change', () => {
      const isMuted = window.soundFX.isMuted();
      if (toggleSoundSetting.checked === isMuted) {
        window.soundFX.toggleMute();
      }
      updateSoundButton();
      showToast(toggleSoundSetting.checked ? '🔊 Sound Enabled' : '🔇 Sound Muted');
    });
  }

  // Best score initial display
  bestScoreValEl.textContent = window.storageManager.getBestScore().toLocaleString();

  // Interactive First-Time Onboarding Tutorial
  let tutorialActive = false;
  let tutorialStep = 1;

  function showTutorial(step = 1) {
    if (!tutorialBanner) return;
    tutorialActive = true;
    tutorialStep = step;
    tutorialBanner.style.display = 'block';
    if (step === 1) {
      if (tutorialStep1) tutorialStep1.style.display = 'flex';
      if (tutorialStep2) tutorialStep2.style.display = 'none';
      if (boardEl) boardEl.classList.add('tutorial-active');
    } else {
      if (tutorialStep1) tutorialStep1.style.display = 'none';
      if (tutorialStep2) tutorialStep2.style.display = 'flex';
      if (boardEl) boardEl.classList.remove('tutorial-active');
    }
  }

  function dismissTutorial() {
    if (!tutorialBanner) return;
    tutorialActive = false;
    tutorialBanner.style.display = 'none';
    if (boardEl) boardEl.classList.remove('tutorial-active');
    window.storageManager.setTutorialSeen(true);
  }

  if (tutorialSkipBtn) tutorialSkipBtn.addEventListener('click', dismissTutorial);
  if (tutorialCloseBtn) tutorialCloseBtn.addEventListener('click', dismissTutorial);
  if (tutorialDoneBtn) tutorialDoneBtn.addEventListener('click', dismissTutorial);

  if (replayTutorialBtn) {
    replayTutorialBtn.addEventListener('click', () => {
      if (helpModal) helpModal.classList.remove('active');
      showTutorial(1);
    });
  }

  // Floating score indicator
  function showScoreGained(amount, row, col) {
    if (amount <= 0) return;
    const indicator = document.createElement('div');
    indicator.className = 'score-popup';
    indicator.textContent = `+${amount.toLocaleString()}`;
    
    // Position near header or cell
    const scoreBox = document.querySelector('.stat-card.score');
    if (scoreBox) {
      scoreBox.appendChild(indicator);
      setTimeout(() => indicator.remove(), 900);
    }
  }

  let prevScore = 0;

  // Game Engine Event Handlers
  game.on('stateChange', (state) => {
    renderer.render(state);
    scoreValEl.textContent = state.score.toLocaleString();
    // State changes
    if (levelValEl) {
      const kVal = state.currentStartValue >= 1024 
        ? `${Math.round(state.currentStartValue / 1024)}K` 
        : state.currentStartValue;
      levelValEl.textContent = `LV ${state.level} (${kVal})`;
    }
    updateHammerUI();
    updateWarpUI();

    // Score gain popup
    if (state.score > prevScore) {
      showScoreGained(state.score - prevScore);
    }
    prevScore = state.score;

    // Undo button state
    undoBtn.disabled = !state.canUndo;

    // Refresh directional trajectory compass outcomes & active laser aim
    updateCompassOutcomes();
    updateTrajectoryDisplay();
  });

  // Hammer Mode implementation (Only tiles <= 256)
  let hammerMode = false;

  function updateHammerUI() {
    if (!hammerCountEl || !hammerBtn) return;
    const charges = game.hammerCharges;
    hammerCountEl.textContent = charges;
    hammerBtn.disabled = charges <= 0;
    if (charges <= 0 && hammerMode) {
      setHammerMode(false);
    }
  }

  function setHammerMode(active) {
    if (active && warpMode) setWarpMode(false);
    hammerMode = active;
    if (hammerBtn) hammerBtn.classList.toggle('hammer-active', active);
    document.body.classList.toggle('hammer-targeting', active);
    if (active) {
      renderer.clearTrajectoryPreview();
    } else {
      updateTrajectoryDisplay();
    }

    if (hammerBannerEl) {
      if (active) {
        // Count eligible smashable tiles on board
        const smashableCount = game.grid.flat().filter(t => t && t.type === 'target' && t.value <= 256).length;
        if (smashableCount > 0) {
          hammerBannerEl.textContent = `🔨 Smash Active: Tap any golden tile (≤ 256) to shatter! (${smashableCount} available)`;
          hammerBannerEl.classList.remove('hammer-banner-warning');
        } else {
          hammerBannerEl.textContent = `⚠️ No tiles ≤ 256 on board! Fission larger tiles first or tap Smash to cancel.`;
          hammerBannerEl.classList.add('hammer-banner-warning');
        }
        hammerBannerEl.style.display = 'block';
      } else {
        hammerBannerEl.style.display = 'none';
        hammerBannerEl.classList.remove('hammer-banner-warning');
      }
    }
  }

  if (hammerBtn) {
    hammerBtn.addEventListener('click', () => {
      if (game.hammerCharges <= 0) return;
      setHammerMode(!hammerMode);
    });
  }

  // Warp Mode implementation (Move Breaker to any empty cell)
  let warpMode = false;

  function updateWarpUI() {
    if (!warpCountEl || !warpBtn) return;
    const charges = game.warpCharges;
    warpCountEl.textContent = charges;
    warpBtn.disabled = charges <= 0;
    if (charges <= 0 && warpMode) {
      setWarpMode(false);
    }
  }

  function setWarpMode(active) {
    if (active && hammerMode) setHammerMode(false);
    warpMode = active;
    if (warpBannerEl) warpBannerEl.style.display = active ? 'block' : 'none';
    if (warpBtn) warpBtn.classList.toggle('warp-active', active);
    document.body.classList.toggle('warp-targeting', active);
    if (active) {
      renderer.clearTrajectoryPreview();
    } else {
      updateTrajectoryDisplay();
    }
  }

  if (warpBtn) {
    warpBtn.addEventListener('click', () => {
      if (game.warpCharges <= 0) return;
      setWarpMode(!warpMode);
    });
  }

  // Board tap: Hammer Smash OR Breaker Warp
  boardEl.addEventListener('click', (e) => {
    // 1. Handle Hammer Smash
    if (hammerMode) {
      const tileEl = e.target.closest('.tile');
      if (!tileEl) return;
      const tileId = parseInt(tileEl.dataset.id, 10);
      let foundR = -1, foundC = -1;
      for (let r = 0; r < game.gridSize; r++) {
        for (let c = 0; c < game.gridSize; c++) {
          if (game.grid[r][c] && game.grid[r][c].id === tileId) {
            foundR = r;
            foundC = c;
            break;
          }
        }
        if (foundR !== -1) break;
      }

      if (foundR !== -1) {
        const targetTile = game.grid[foundR][foundC];
        if (targetTile && targetTile.value > 256) {
          // Denied! Hammer only breaks <= 256
          window.soundFX.playDeny();
          tileEl.classList.remove('tile-immune-shake');
          void tileEl.offsetWidth; // trigger reflow
          tileEl.classList.add('tile-immune-shake');
          if (hammerBannerEl) {
            hammerBannerEl.textContent = `⚠️ Immune (${targetTile.value.toLocaleString()})! Hammer breaks tiles ≤ 256 only!`;
            setTimeout(() => {
              if (hammerBannerEl) hammerBannerEl.textContent = '🔨 Smash Active: Tap any tile ≤ 256 to shatter!';
            }, 1800);
          }
          return;
        }

        const res = game.shatterTileAt(foundR, foundC);
        if (res && res.success) {
          setHammerMode(false);
        }
      }
      return;
    }

    // 2. Handle Breaker Warp
    if (warpMode) {
      const cellBg = e.target.closest('.grid-cell-bg');
      let targetR = -1, targetC = -1;
      if (cellBg && cellBg.dataset.row !== undefined && cellBg.dataset.col !== undefined) {
        targetR = parseInt(cellBg.dataset.row, 10);
        targetC = parseInt(cellBg.dataset.col, 10);
      } else {
        const rect = boardEl.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const clickY = e.clientY - rect.top;
        targetC = Math.floor((clickX / rect.width) * game.gridSize);
        targetR = Math.floor((clickY / rect.height) * game.gridSize);
      }

      if (targetR >= 0 && targetR < game.gridSize && targetC >= 0 && targetC < game.gridSize) {
        if (game.grid[targetR][targetC] !== null) {
          window.soundFX.playDeny();
          if (warpBannerEl) {
            warpBannerEl.textContent = '⚠️ Cell occupied! Tap an empty cell to warp breaker!';
            setTimeout(() => {
              if (warpBannerEl) warpBannerEl.textContent = '⚡ Warp Active: Tap any empty cell to relocate breaker!';
            }, 1800);
          }
          return;
        }

        const res = game.teleportBreaker(targetR, targetC);
        if (res && res.success) {
          setWarpMode(false);
        }
      }
      return;
    }

    // 3. Normal board tap: steer trajectory laser aim toward tapped direction relative to breaker
    if (!hammerMode && !warpMode) {
      const rect = boardEl.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clickY = e.clientY - rect.top;
      const col = Math.floor((clickX / rect.width) * game.gridSize);
      const row = Math.floor((clickY / rect.height) * game.gridSize);

      const breaker = game.grid.flat().find(t => t && t.type === 'breaker');
      if (breaker) {
        const dr = row - breaker.row;
        const dc = col - breaker.col;
        let tappedDir = null;
        if (Math.abs(dr) > Math.abs(dc) && dr !== 0) {
          tappedDir = dr > 0 ? 'down' : 'up';
        } else if (dc !== 0) {
          tappedDir = dc > 0 ? 'right' : 'left';
        }
        if (tappedDir) {
          updateTrajectoryDisplay(currentAimDirection === tappedDir ? null : tappedDir);
        }
      }
    }
  });

  game.on('hammerUsed', (data) => {
    window.soundFX.playHammer();
    renderer.triggerElimination(data.row, data.col, data.value, game.gridSize);
    updateHammerUI();
    showToast(`🔨 Shattered ${data.value} tile!`);
  });

  game.on('hammerAwarded', (data) => {
    updateHammerUI();
    showScoreGained(25000);
    showToast(`🔨 +${data.count} Shatter Hammer Earned! (25,000 Pts)`);
  });

  game.on('warpAwarded', (data) => {
    updateWarpUI();
    showScoreGained(50000);
    showToast(`⚡ +${data.count} Breaker Warp Earned! (50,000 Pts)`);
  });

  game.on('breakerWarped', (data) => {
    window.soundFX.playWarp();
    renderer.triggerWarp(data.to.r, data.to.c, game.gridSize);
    updateWarpUI();
    showToast('⚡ Breaker relocated!');
  });

  game.on('tileSlide', () => {
    window.soundFX.playSlide();
  });

  game.on('tileBroken', (data) => {
    window.soundFX.playHit(data.breakerValue);
    renderer.triggerBreakImpact(data.row, data.col, data.breakerValue, game.gridSize);
    if (tutorialActive && tutorialStep === 1) {
      showTutorial(2);
    }
  });

  game.on('tileCleared', (data) => {
    window.soundFX.playClear();
    renderer.triggerElimination(data.row, data.col, data.newTargetValue, game.gridSize);
  });

  game.on('bump', () => {
    window.soundFX.playBump();
  });

  game.on('victory', (data) => {
    window.soundFX.playVictory();
    winScoreEl.textContent = data.score.toLocaleString();
    winMovesEl.textContent = data.moves;
    if (winNextTargetEl) {
      winNextTargetEl.textContent = data.nextValue ? data.nextValue.toLocaleString() : 'MAX';
    }
    try {
      window.storageManager.saveLastReplay(game.getReplayData());
    } catch (e) {}
    winModal.classList.add('active');
  });

  if (winNextLevelBtn) {
    winNextLevelBtn.addEventListener('click', () => {
      winModal.classList.remove('active');
      setHammerMode(false);
      setWarpMode(false);
      game.advanceNextLevel();
    });
  }

  game.on('gameOver', (data) => {
    window.soundFX.playGameOver();
    lossScoreEl.textContent = data.score.toLocaleString();
    try {
      window.storageManager.saveLastReplay(game.getReplayData());
    } catch (e) {}
    gameOverModal.classList.add('active');
  });

  // Input events
  input.on('previewMove', (direction) => {
    if (hammerMode || warpMode) return;
    updateTrajectoryDisplay(direction);
  });

  input.on('clearPreview', () => {
    if (hammerMode || warpMode) {
      renderer.clearTrajectoryPreview();
    } else {
      updateTrajectoryDisplay(null);
    }
  });

  input.on('move', (direction) => {
    if (tutorialActive && tutorialStep === 2) {
      dismissTutorial();
    }
    currentAimDirection = null;
    game.move(direction);
  });

  input.on('undo', () => {
    renderer.clearTrajectoryPreview();
    game.undo();
  });

  // Controls buttons
  undoBtn.addEventListener('click', () => {
    renderer.clearTrajectoryPreview();
    game.undo();
  });

  newGameBtn.addEventListener('click', () => {
    if (confirm(`Reset and start fresh at Level ${game.level} (${game.currentStartValue})?`)) {
      prevScore = 0;
      setHammerMode(false);
      setWarpMode(false);
      game.startNewGame(game.currentStartValue, false);
    }
  });

  // Modal close buttons
  document.querySelectorAll('.modal-close').forEach(btn => {
    btn.addEventListener('click', () => {
      const modal = btn.closest('.modal');
      if (modal) modal.classList.remove('active');
    });
  });

  // Help Modal
  helpBtn.addEventListener('click', () => {
    helpModal.classList.add('active');
  });

  // Settings Modal
  settingsBtn.addEventListener('click', () => {
    const current = window.storageManager.getSettings();
    selectGridSize.value = current.gridSize;
    if (selectStartLevel) {
      selectStartLevel.value = game.currentStartValue;
    }
    selectBreakerSet.value = current.breakerSet;
    toggleDpad.checked = current.dpadEnabled;
    if (toggleTrajectoryPreview) {
      toggleTrajectoryPreview.checked = current.trajectoryPreview !== false;
    }
    if (toggleTrajectoryCompass) {
      toggleTrajectoryCompass.checked = current.compassEnabled !== false;
    }
    settingsModal.classList.add('active');
  });

  saveSettingsBtn.addEventListener('click', () => {
    const newSettings = {
      gridSize: parseInt(selectGridSize.value, 10),
      breakerSet: parseInt(selectBreakerSet.value, 10),
      divisionMode: 'fission',
      dpadEnabled: toggleDpad.checked,
      trajectoryPreview: toggleTrajectoryPreview ? toggleTrajectoryPreview.checked : true,
      compassEnabled: toggleTrajectoryCompass ? toggleTrajectoryCompass.checked : true
    };
    window.storageManager.saveSettings(newSettings);
    settings = newSettings;
    applySettingsClasses();
    settingsModal.classList.remove('active');

    // Apply D-pad
    if (dpadContainer) {
      dpadContainer.style.display = newSettings.dpadEnabled ? 'flex' : 'none';
    }

    if (selectStartLevel) {
      const chosenVal = parseInt(selectStartLevel.value, 10);
      if (chosenVal !== game.currentStartValue) {
        const lvl = Math.round(Math.log2(chosenVal) - 11);
        game.setLevel(lvl, chosenVal);
      }
    }

    // If grid size or breaker set changed, restart game
    if (newSettings.gridSize !== game.gridSize || newSettings.breakerSet !== (game.breakerValues.length)) {
      location.reload();
    }
  });

  // Play Again / Retry
  winPlayAgainBtn.addEventListener('click', () => {
    winModal.classList.remove('active');
    prevScore = 0;
    setHammerMode(false);
    setWarpMode(false);
    game.startNewGame(game.currentStartValue, false);
  });

  lossRetryBtn.addEventListener('click', () => {
    gameOverModal.classList.remove('active');
    prevScore = 0;
    setHammerMode(false);
    setWarpMode(false);
    game.startNewGame(game.currentStartValue, false);
  });

  // Move-History Replay Controller & UI Management
  function formatReplayTime(ms) {
    const totalSec = Math.floor(ms / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return `${min}:${sec < 10 ? '0' : ''}${sec}`;
  }

  let replayController = null;
  if (window.ReplayController && replayBoardEl && replayCanvasEl) {
    replayController = new window.ReplayController({
      boardEl: replayBoardEl,
      canvasEl: replayCanvasEl,
      onFrameChange: (frame, curIndex, totalCount) => {
        if (!frame) return;
        const maxMove = Math.max(0, totalCount - 1);
        const scoreVal = (frame.score !== undefined)
          ? frame.score
          : (frame.state && frame.state.score !== undefined ? frame.state.score : 0);
        if (replaySubtitle) {
          replaySubtitle.textContent = `Move ${curIndex} / ${maxMove} • Score: ${(scoreVal || 0).toLocaleString()}`;
        }
        if (replayActionText) {
          replayActionText.textContent = frame.description || `Move ${curIndex}`;
        }
        if (replayScoreDelta) {
          const scoreGain = frame.scoreGain || 0;
          if (scoreGain > 0) {
            replayScoreDelta.textContent = `+${scoreGain.toLocaleString()} pts`;
            replayScoreDelta.style.display = 'inline';
          } else {
            replayScoreDelta.textContent = '';
            replayScoreDelta.style.display = 'none';
          }
        }
        if (replayTimeDisplay) {
          replayTimeDisplay.textContent = formatReplayTime(frame.timeMs || 0);
        }
        if (replayStepDisplay) {
          replayStepDisplay.textContent = `${curIndex} / ${maxMove}`;
        }
        if (replayScrubber) {
          replayScrubber.max = maxMove;
          replayScrubber.value = curIndex;
        }
      },
      onPlayStateChange: (isPlaying) => {
        if (replayPlayBtn) {
          replayPlayBtn.innerHTML = isPlaying ? '⏸ Pause' : '▶ Play';
          replayPlayBtn.classList.toggle('playing', isPlaying);
        }
      },
      onSpeedChange: (spd) => {
        replaySpeedChips.forEach(chip => {
          chip.classList.toggle('speed-active', parseFloat(chip.dataset.speed) === spd);
        });
      }
    });
  }

  function openReplayModal(customData = null) {
    let dataToLoad = customData;
    if (!dataToLoad) {
      // 1. Check if current game has played moves
      const currentGameData = game.getReplayData();
      if (currentGameData && currentGameData.frames && currentGameData.frames.length > 1) {
        dataToLoad = currentGameData;
      } else {
        // 2. Fallback to last finished game replay
        const lastSaved = window.storageManager.getLastReplay();
        if (lastSaved && lastSaved.frames && lastSaved.frames.length > 0) {
          dataToLoad = lastSaved;
        } else {
          dataToLoad = currentGameData;
        }
      }
    }

    if (!dataToLoad || !dataToLoad.frames || dataToLoad.frames.length === 0) {
      showToast('⚠️ No replay data available yet. Play some moves first!');
      return;
    }

    // Activate modal first so layout dimensions are active
    if (replayModal) {
      replayModal.classList.add('active');
    }

    if (replayController) {
      if (replayController.renderer && typeof replayController.renderer.resizeCanvas === 'function') {
        replayController.renderer.resizeCanvas();
      }
      replayController.load(dataToLoad);
      if (replayScrubber) {
        replayScrubber.min = 0;
        replayScrubber.max = Math.max(0, dataToLoad.frames.length - 1);
        replayScrubber.value = 0;
      }
    }
  }

  function closeReplayModal() {
    if (replayController) {
      replayController.pause();
    }
    if (replayModal) {
      replayModal.classList.remove('active');
    }
  }

  if (replayModal) {
    replayModal.addEventListener('click', (e) => {
      if (e.target === replayModal) {
        closeReplayModal();
      }
    });
  }

  if (replayHeaderBtn) {
    replayHeaderBtn.addEventListener('click', () => openReplayModal());
  }

  if (closeReplayBtn) {
    closeReplayBtn.addEventListener('click', () => closeReplayModal());
  }

  if (winReplayBtn) {
    winReplayBtn.addEventListener('click', () => {
      winModal.classList.remove('active');
      openReplayModal(game.getReplayData());
    });
  }

  if (lossReplayBtn) {
    lossReplayBtn.addEventListener('click', () => {
      gameOverModal.classList.remove('active');
      openReplayModal(game.getReplayData());
    });
  }

  if (replayScrubber && replayController) {
    replayScrubber.addEventListener('input', (e) => {
      replayController.seekTo(parseInt(e.target.value, 10));
    });
  }

  if (replayFirstBtn && replayController) {
    replayFirstBtn.addEventListener('click', () => replayController.first());
  }

  if (replayPrevBtn && replayController) {
    replayPrevBtn.addEventListener('click', () => replayController.stepBackward());
  }

  if (replayPlayBtn && replayController) {
    replayPlayBtn.addEventListener('click', () => replayController.togglePlay());
  }

  if (replayNextBtn && replayController) {
    replayNextBtn.addEventListener('click', () => replayController.stepForward(false));
  }

  if (replayLastBtn && replayController) {
    replayLastBtn.addEventListener('click', () => replayController.last());
  }

  replaySpeedChips.forEach(chip => {
    chip.addEventListener('click', () => {
      if (!replayController) return;
      const spd = parseFloat(chip.dataset.speed);
      replayController.setSpeed(spd);
    });
  });

  if (exportReplayBtn && replayController) {
    exportReplayBtn.addEventListener('click', () => {
      replayController.exportJSON();
      showToast('💾 Replay JSON downloaded!');
    });
  }

  if (importReplayBtn && replayFileInput) {
    importReplayBtn.addEventListener('click', () => {
      replayFileInput.value = '';
      replayFileInput.click();
    });

    replayFileInput.addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (evt) => {
        try {
          const parsed = window.ReplayController.parseJSON(evt.target.result);
          openReplayModal(parsed);
          showToast(`📥 Loaded replay with ${parsed.totalMoves || (parsed.frames.length - 1)} moves!`);
        } catch (err) {
          alert('Could not load replay: ' + err.message);
        }
      };
      reader.readAsText(file);
    });
  }

  // Keyboard navigation within Replay Modal
  window.addEventListener('keydown', (e) => {
    if (!replayModal || !replayModal.classList.contains('active') || !replayController) {
      return;
    }

    if (e.code === 'Space') {
      e.preventDefault();
      replayController.togglePlay();
    } else if (e.code === 'ArrowLeft') {
      e.preventDefault();
      replayController.stepBackward();
    } else if (e.code === 'ArrowRight') {
      e.preventDefault();
      replayController.stepForward(false);
    } else if (e.code === 'Home') {
      e.preventDefault();
      replayController.first();
    } else if (e.code === 'End') {
      e.preventDefault();
      replayController.last();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closeReplayModal();
    }
  });

  // PWA Installation & Local-First Management
  let deferredPrompt = null;
  let newWorkerWaiting = null;
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

  function updateInstallUI() {
    if (isStandalone) {
      if (headerInstallBtn) headerInstallBtn.style.display = 'none';
      if (installBanner && !newWorkerWaiting) installBanner.classList.remove('show');
      if (settingsInstallBtn) {
        settingsInstallBtn.innerHTML = '<span>✅ App Installed on This Device</span>';
        settingsInstallBtn.disabled = true;
        settingsInstallBtn.style.opacity = '0.7';
      }
      if (settingsInstallNote) {
        settingsInstallNote.textContent = 'Running in standalone local-first mode.';
      }
    } else {
      if (headerInstallBtn) headerInstallBtn.style.display = 'inline-flex';
    }
  }
  updateInstallUI();

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    if (!newWorkerWaiting && installBanner) {
      installBanner.classList.remove('update-available');
      if (installBannerText) installBannerText.textContent = '⚡ Install 65536 on this device for offline play';
      if (installBtn) installBtn.textContent = 'Install App';
      installBanner.classList.add('show');
    }
    updateInstallUI();
  });

  window.addEventListener('appinstalled', () => {
    console.log('[PWA] App successfully installed on this device');
    deferredPrompt = null;
    showToast('🎉 65536 installed to your home screen!');
    updateInstallUI();
  });

  async function triggerInstallPrompt() {
    if (newWorkerWaiting) {
      // If update is waiting, the button triggers update installation & reload
      newWorkerWaiting.postMessage({ action: 'skipWaiting' });
      return;
    }

    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        console.log('[PWA] User accepted installation prompt');
      }
      deferredPrompt = null;
      if (installBanner) installBanner.classList.remove('show');
    } else {
      const isIOS = /iphone|ipad|ipod/.test(navigator.userAgent.toLowerCase());
      if (isIOS) {
        alert("📲 To install 65536 on iOS:\n1. Tap the Share button (⎋) at the bottom of Safari.\n2. Scroll down and tap 'Add to Home Screen' (➕).\n3. Play offline anytime with zero lag!");
      } else if (isStandalone) {
        showToast('✅ 65536 is already installed on this device!');
      } else {
        alert("📲 To install on your device:\nOpen your browser menu (⋮) and tap 'Install app' or 'Add to Home screen'.");
      }
    }
  }

  if (installBtn) {
    installBtn.addEventListener('click', triggerInstallPrompt);
  }

  if (headerInstallBtn) {
    headerInstallBtn.addEventListener('click', triggerInstallPrompt);
  }

  if (settingsInstallBtn) {
    settingsInstallBtn.addEventListener('click', triggerInstallPrompt);
  }

  if (closeInstallBtn) {
    closeInstallBtn.addEventListener('click', () => {
      if (installBanner) installBanner.classList.remove('show');
    });
  }

  // Display Update Banner whenever a new version is detected
  function showUpdateBanner(worker) {
    newWorkerWaiting = worker;
    if (installBanner) {
      installBanner.classList.add('show', 'update-available');
      if (installBannerText) {
        installBannerText.innerHTML = '🚀 <strong>New version updated!</strong> Install update on this device?';
      }
      if (installBtn) {
        installBtn.textContent = 'Update & Reload';
      }
    }
  }

  // Local-first Service Worker registration & version management
  const APP_VERSION = '1.24';
  console.log(`%c[65536]%c Local-first PWA v${APP_VERSION} active`, 'color:#8b5cf6;font-weight:bold;', 'color:#00f0ff;font-weight:bold;');

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').then(
        (registration) => {
          // If a worker is already waiting to activate
          if (registration.waiting) {
            showUpdateBanner(registration.waiting);
          }

          // Check for updates if network is online
          if (navigator.onLine) {
            registration.update().catch(() => {});
          }

          // When network comes online, check for updates
          window.addEventListener('online', () => {
            console.log('[SW] Network connected. Checking for updates...');
            registration.update().catch(() => {});
          });

          // Detect new versions
          registration.addEventListener('updatefound', () => {
            const newWorker = registration.installing;
            if (newWorker) {
              newWorker.addEventListener('statechange', () => {
                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                  console.log('[SW] New version found and installed into cache.');
                  showUpdateBanner(newWorker);
                  showToast('🚀 New version ready to install on this device!');
                }
              });
            }
          });
        },
        (err) => {
          console.warn('[SW] Registration failed: ', err);
        }
      );

      let refreshing = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!refreshing) {
          refreshing = true;
          console.log('[SW] Controller changed. Reloading page...');
          window.location.reload();
        }
      });
    });
  }

  // Load saved state or start initial game with level continuation
  const savedState = window.storageManager.getGameState();
  if (savedState && savedState.grid && savedState.gridSize === game.gridSize) {
    game.init(savedState);
    showToast(`🎮 Continued: Level ${savedState.level} (${savedState.score.toLocaleString()} pts)`);
  } else {
    const highestLevel = window.storageManager.getHighestLevel();
    const startVal = Math.pow(2, highestLevel + 11);
    game.setLevel(highestLevel, startVal);
    // Show interactive onboarding tutorial for new players
    if (!window.storageManager.hasSeenTutorial()) {
      setTimeout(() => showTutorial(1), 350);
    }
  }

  // Initial trajectory preview & compass display
  updateCompassOutcomes();
  updateTrajectoryDisplay();
});
