class StorageManager {
  constructor() {
    this.prefix = '65536_';
    this.checkMigration();
  }

  checkMigration() {
    const CURRENT_VERSION = 4;
    const storedVersion = parseInt(localStorage.getItem(this.prefix + 'version') || '0', 10);
    if (storedVersion < CURRENT_VERSION) {
      // Clear old 4x4 saved game and ensure 8x8 is the default
      localStorage.removeItem(this.prefix + 'saved_game');
      const settings = this.getSettings();
      settings.gridSize = 8;
      this.saveSettings(settings);
      localStorage.setItem(this.prefix + 'version', CURRENT_VERSION);
    }
  }

  getBestScore() {
    return parseInt(localStorage.getItem(this.prefix + 'best_score') || '0', 10);
  }

  setBestScore(score) {
    const current = this.getBestScore();
    if (score > current) {
      localStorage.setItem(this.prefix + 'best_score', score);
      return true;
    }
    return false;
  }

  getHighestLevel() {
    return parseInt(localStorage.getItem(this.prefix + 'highest_level') || '1', 10);
  }

  setHighestLevel(level) {
    const current = this.getHighestLevel();
    if (level > current) {
      localStorage.setItem(this.prefix + 'highest_level', level);
      return true;
    }
    return false;
  }

  getLevelScores() {
    try {
      const saved = localStorage.getItem(this.prefix + 'level_scores');
      return saved ? JSON.parse(saved) : {};
    } catch (e) {
      return {};
    }
  }

  setLevelScore(level, score) {
    const scores = this.getLevelScores();
    if (!scores[level] || score > scores[level]) {
      scores[level] = score;
      try {
        localStorage.setItem(this.prefix + 'level_scores', JSON.stringify(scores));
        return true;
      } catch (e) {}
    }
    return false;
  }

  getGameState() {
    try {
      const state = localStorage.getItem(this.prefix + 'saved_game');
      return state ? JSON.parse(state) : null;
    } catch (e) {
      console.warn('Failed to load saved game:', e);
      return null;
    }
  }

  saveGameState(state) {
    try {
      if (state) {
        localStorage.setItem(this.prefix + 'saved_game', JSON.stringify(state));
      } else {
        localStorage.removeItem(this.prefix + 'saved_game');
      }
    } catch (e) {
      console.warn('Failed to save game:', e);
    }
  }

  clearGameState() {
    localStorage.removeItem(this.prefix + 'saved_game');
  }

  getSettings() {
    try {
      const defaults = {
        gridSize: 8,
        breakerSet: 3, // 3: [2, 4, 8], 4: [2, 4, 8, 16]
        dpadEnabled: false
      };
      const saved = localStorage.getItem(this.prefix + 'settings');
      return saved ? { ...defaults, ...JSON.parse(saved) } : defaults;
    } catch (e) {
      return { gridSize: 8, breakerSet: 3, dpadEnabled: false };
    }
  }

  saveSettings(settings) {
    try {
      localStorage.setItem(this.prefix + 'settings', JSON.stringify(settings));
    } catch (e) {
      console.warn('Failed to save settings:', e);
    }
  }

  getStats() {
    try {
      const defaults = {
        gamesPlayed: 0,
        gamesWon: 0,
        shatteredTiles: 0
      };
      const saved = localStorage.getItem(this.prefix + 'stats');
      return saved ? { ...defaults, ...JSON.parse(saved) } : defaults;
    } catch (e) {
      return { gamesPlayed: 0, gamesWon: 0, shatteredTiles: 0 };
    }
  }

  recordGameEnd(won, shatteredCount = 0) {
    const stats = this.getStats();
    stats.gamesPlayed++;
    if (won) stats.gamesWon++;
    stats.shatteredTiles += shatteredCount;
    try {
      localStorage.setItem(this.prefix + 'stats', JSON.stringify(stats));
    } catch (e) {}
  }

  hasSeenTutorial() {
    return localStorage.getItem(this.prefix + 'tutorial_seen') === 'true';
  }

  setTutorialSeen(seen = true) {
    localStorage.setItem(this.prefix + 'tutorial_seen', seen ? 'true' : 'false');
  }
}

window.storageManager = new StorageManager();
