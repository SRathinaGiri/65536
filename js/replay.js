// Move-History Replay Controller for 65536
class ReplayController {
  constructor(options = {}) {
    this.boardEl = options.boardEl;
    this.canvasEl = options.canvasEl;
    this.replayData = null;
    this.frames = [];
    this.currentIndex = 0;
    this.isPlaying = false;
    this.playbackTimer = null;
    this.speed = 1; // 0.5, 1, 2, 4
    this.baseDelay = 600; // ms per step at 1x
    this.renderer = null;

    this.onFrameChange = options.onFrameChange || null;
    this.onPlayStateChange = options.onPlayStateChange || null;
    this.onSpeedChange = options.onSpeedChange || null;

    if (this.boardEl && this.canvasEl && window.BoardRenderer) {
      this.renderer = new window.BoardRenderer(this.boardEl, this.canvasEl);
    }
  }

  load(replayData) {
    this.pause();
    this.replayData = replayData;
    this.frames = (replayData && Array.isArray(replayData.frames) ? replayData.frames : []).map(f => {
      if (f && f.score === undefined && f.state && f.state.score !== undefined) {
        return { ...f, score: f.state.score };
      }
      return f;
    });
    this.currentIndex = 0;
    if (this.frames.length > 0) {
      this.renderCurrentFrame(true);
    }
  }

  getCurrentFrame() {
    if (!this.frames || this.frames.length === 0) return null;
    return this.frames[this.currentIndex] || null;
  }

  renderCurrentFrame(instant = false) {
    if (!this.frames || this.frames.length === 0) return;
    const frame = this.frames[this.currentIndex];
    if (!frame || !frame.state) return;

    // Render grid using dedicated Replay BoardRenderer
    if (this.renderer) {
      const gridSize = (this.replayData && this.replayData.gridSize) || 
                       (frame.state.grid ? frame.state.grid.length : 8);
      this.renderer.render({
        grid: frame.state.grid,
        gridSize: gridSize
      });
    }

    // Trigger audio cue if sound is enabled and not instant scrubbing
    if (!instant && frame.soundEvent && window.soundFX && !window.soundFX.isMuted()) {
      try {
        switch (frame.soundEvent) {
          case 'slide':
            window.soundFX.playSlide();
            break;
          case 'hit': {
            const breakerVal = (frame.action && frame.action.interactions && frame.action.interactions[0])
              ? frame.action.interactions[0].breakerValue
              : 2;
            window.soundFX.playHit(breakerVal);
            break;
          }
          case 'clear':
            window.soundFX.playClear();
            break;
          case 'hammer':
            window.soundFX.playHammer();
            break;
          case 'warp':
            window.soundFX.playWarp();
            break;
          case 'victory':
            window.soundFX.playVictory();
            break;
        }
      } catch (e) {}
    }

    // Trigger frame change callback
    if (this.onFrameChange) {
      this.onFrameChange(frame, this.currentIndex, this.frames.length);
    }
  }

  play() {
    if (this.isPlaying || !this.frames || this.frames.length === 0) return;
    // If at end, loop back to start
    if (this.currentIndex >= this.frames.length - 1) {
      this.currentIndex = 0;
      this.renderCurrentFrame(true);
    }
    this.isPlaying = true;
    if (this.onPlayStateChange) this.onPlayStateChange(true);
    this.scheduleNextStep();
  }

  pause() {
    this.isPlaying = false;
    if (this.playbackTimer) {
      clearTimeout(this.playbackTimer);
      this.playbackTimer = null;
    }
    if (this.onPlayStateChange) this.onPlayStateChange(false);
  }

  togglePlay() {
    if (this.isPlaying) {
      this.pause();
    } else {
      this.play();
    }
  }

  scheduleNextStep() {
    if (!this.isPlaying) return;
    const delay = Math.round(this.baseDelay / this.speed);
    this.playbackTimer = setTimeout(() => {
      if (!this.isPlaying) return;
      if (this.currentIndex < this.frames.length - 1) {
        this.stepForward(false);
        this.scheduleNextStep();
      } else {
        this.pause();
      }
    }, delay);
  }

  stepForward(instant = false) {
    if (!this.frames || this.frames.length === 0) return;
    if (this.currentIndex < this.frames.length - 1) {
      this.currentIndex++;
      this.renderCurrentFrame(instant);
    }
  }

  stepBackward() {
    this.pause();
    if (!this.frames || this.frames.length === 0) return;
    if (this.currentIndex > 0) {
      this.currentIndex--;
      this.renderCurrentFrame(true);
    }
  }

  seekTo(index) {
    if (!this.frames || this.frames.length === 0) return;
    const target = Math.max(0, Math.min(this.frames.length - 1, index));
    if (target !== this.currentIndex) {
      this.currentIndex = target;
      this.renderCurrentFrame(true);
    }
  }

  first() {
    this.pause();
    this.seekTo(0);
  }

  last() {
    this.pause();
    if (this.frames && this.frames.length > 0) {
      this.seekTo(this.frames.length - 1);
    }
  }

  setSpeed(multiplier) {
    this.speed = Math.max(0.25, Math.min(8, multiplier));
    if (this.isPlaying) {
      if (this.playbackTimer) clearTimeout(this.playbackTimer);
      this.scheduleNextStep();
    }
    if (this.onSpeedChange) this.onSpeedChange(this.speed);
  }

  exportJSON() {
    if (!this.replayData) return;
    const jsonStr = JSON.stringify(this.replayData, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const score = this.replayData.finalScore || 0;
    const level = this.replayData.level || 1;
    const dateStr = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `65536-replay-LV${level}-${score}pts-${dateStr}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  static parseJSON(jsonText) {
    const data = JSON.parse(jsonText);
    if (!data || data.game !== '65536' || !Array.isArray(data.frames)) {
      throw new Error('Invalid 65536 replay data. File must contain game: "65536" and a frames array.');
    }
    return data;
  }
}

window.ReplayController = ReplayController;
