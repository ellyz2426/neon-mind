import {
  createSystem,
  PanelUI,
  PanelDocument,
  UIKitDocument,
  UIKit,
  eq,
  Entity,
  InputComponent,
} from '@iwsdk/core';
import { GameSystem, ACHIEVEMENTS, COLOR_SCHEMES, type ColorScheme, type GameMode, type Difficulty } from './game-system.js';
import { AudioSystem } from './audio-system.js';
import { EffectsSystem } from './effects-system.js';

const getDoc = (e: Entity) => e.getValue(PanelDocument, 'document') as UIKitDocument | undefined;
const setText = (e: Entity, id: string, text: string) =>
  (getDoc(e)?.getElementById(id) as UIKit.Text | undefined)?.setProperties({ text });

export class UISystem extends createSystem({
  menu: { required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/menu.json')] },
  hud: { required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/hud.json')] },
  results: { required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/results.json')] },
  settings: { required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/settings.json')] },
  pause: { required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/pause.json')] },
  achpanel: { required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/achpanel.json')] },
  tutorial: { required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/tutorial.json')] },
  stats: { required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/stats.json')] },
}) {
  private game!: GameSystem;
  private audio!: AudioSystem;
  private effects!: EffectsSystem;
  private panels: Record<string, any> = {};
  private positions: Record<string, [number, number, number]> = {};
  private onThemeChange: ((idx: number) => void) | null = null;
  private activePanel = 'menu';
  private hudEntity: Entity | null = null;
  private achPage = 0;
  private notifyTimer = 0;
  private notifyText = '';
  private selectedMode: GameMode = 'classic';
  private selectedDiff: Difficulty = 'medium';
  private colorIdx = 0;

  private showPanel(name: string) {
    for (const [key, entity] of Object.entries(this.panels)) {
      if (!entity?.object3D) continue;
      if (key === 'hud') continue;
      if (key === name) {
        const pos = this.positions[key];
        entity.object3D.position.set(pos[0], pos[1], pos[2]);
      } else {
        entity.object3D.position.y = -50;
      }
    }
    this.activePanel = name;
  }

  private showHUD(visible: boolean) {
    if (!this.panels.hud?.object3D) return;
    const pos = this.positions.hud;
    this.panels.hud.object3D.position.set(pos[0], visible ? pos[1] : -50, pos[2]);
  }

  private showNotification(text: string) {
    this.notifyText = text;
    this.notifyTimer = 3;
  }

  init() {
    // Wire menu
    this.queries.menu.subscribe('qualify', (entity) => {
      const doc = getDoc(entity);
      if (!doc) return;

      const modes: GameMode[] = ['classic', 'speed', 'zen', 'challenge'];
      const diffs: Difficulty[] = ['easy', 'medium', 'hard'];

      // Mode buttons
      for (const m of modes) {
        const btn = doc.getElementById(`btn-${m}`) as UIKit.Text | undefined;
        btn?.addEventListener('click', () => {
          this.selectedMode = m;
          this.audio.playSfx('click');
          this.updateMenuSelection(entity);
        });
      }

      // Difficulty buttons
      for (const d of diffs) {
        const btn = doc.getElementById(`btn-${d}`) as UIKit.Text | undefined;
        btn?.addEventListener('click', () => {
          this.selectedDiff = d;
          this.audio.playSfx('click');
          this.updateMenuSelection(entity);
        });
      }

      // Start button
      const startBtn = doc.getElementById('btn-start') as UIKit.Text | undefined;
      startBtn?.addEventListener('click', () => {
        this.audio.playSfx('click');
        this.startGame();
      });

      // Sub-screen buttons
      const settingsBtn = doc.getElementById('btn-settings') as UIKit.Text | undefined;
      settingsBtn?.addEventListener('click', () => {
        this.audio.playSfx('click');
        this.showPanel('settings');
      });

      const tutorialBtn = doc.getElementById('btn-tutorial') as UIKit.Text | undefined;
      tutorialBtn?.addEventListener('click', () => {
        this.audio.playSfx('click');
        this.showPanel('tutorial');
      });

      const statsBtn = doc.getElementById('btn-stats') as UIKit.Text | undefined;
      statsBtn?.addEventListener('click', () => {
        this.audio.playSfx('click');
        this.updateStatsPanel();
        this.showPanel('stats');
      });

      const achBtn = doc.getElementById('btn-achievements') as UIKit.Text | undefined;
      achBtn?.addEventListener('click', () => {
        this.audio.playSfx('click');
        this.achPage = 0;
        this.updateAchPanel();
        this.showPanel('achpanel');
      });

      this.updateMenuSelection(entity);
    });

    // Wire HUD
    this.queries.hud.subscribe('qualify', (entity) => {
      this.hudEntity = entity;
    });

    // Wire results
    this.queries.results.subscribe('qualify', (entity) => {
      const doc = getDoc(entity);
      if (!doc) return;

      const menuBtn = doc.getElementById('btn-menu') as UIKit.Text | undefined;
      menuBtn?.addEventListener('click', () => {
        this.audio.playSfx('click');
        this.showHUD(false);
        this.showPanel('menu');
      });

      const retryBtn = doc.getElementById('btn-retry') as UIKit.Text | undefined;
      retryBtn?.addEventListener('click', () => {
        this.audio.playSfx('click');
        this.startGame();
      });
    });

    // Wire settings
    this.queries.settings.subscribe('qualify', (entity) => {
      const doc = getDoc(entity);
      if (!doc) return;

      const schemes: ColorScheme[] = ['cyan', 'green', 'magenta', 'gold'];
      for (let i = 0; i < schemes.length; i++) {
        const btn = doc.getElementById(`btn-color-${i}`) as UIKit.Text | undefined;
        btn?.addEventListener('click', () => {
          this.colorIdx = i;
          this.game.colorScheme = schemes[i];
          this.onThemeChange?.(i);
          this.audio.playSfx('click');
        });
      }

      const muteBtn = doc.getElementById('btn-mute') as UIKit.Text | undefined;
      muteBtn?.addEventListener('click', () => {
        this.game.soundMuted = !this.game.soundMuted;
        this.audio.muted = this.game.soundMuted;
        this.audio.playSfx('click');
        setText(entity, 'btn-mute', this.game.soundMuted ? 'Sound: OFF' : 'Sound: ON');
        try { localStorage.setItem('neon-mind-muted', this.game.soundMuted ? '1' : '0'); } catch {}
      });

      const backBtn = doc.getElementById('btn-back') as UIKit.Text | undefined;
      backBtn?.addEventListener('click', () => {
        this.audio.playSfx('click');
        if (this.game.isGameOver || this.game.currentGuessRow === 0) {
          this.showPanel('menu');
        } else {
          this.showPanel('pause');
        }
      });
    });

    // Wire pause
    this.queries.pause.subscribe('qualify', (entity) => {
      const doc = getDoc(entity);
      if (!doc) return;

      const resumeBtn = doc.getElementById('btn-resume') as UIKit.Text | undefined;
      resumeBtn?.addEventListener('click', () => {
        this.audio.playSfx('click');
        this.showPanel('_none');
        this.showHUD(true);
      });

      const menuBtn = doc.getElementById('btn-menu') as UIKit.Text | undefined;
      menuBtn?.addEventListener('click', () => {
        this.audio.playSfx('click');
        this.showHUD(false);
        this.showPanel('menu');
      });

      const settingsBtn = doc.getElementById('btn-settings') as UIKit.Text | undefined;
      settingsBtn?.addEventListener('click', () => {
        this.audio.playSfx('click');
        this.showPanel('settings');
      });
    });

    // Wire tutorial
    this.queries.tutorial.subscribe('qualify', (entity) => {
      const doc = getDoc(entity);
      if (!doc) return;

      const backBtn = doc.getElementById('btn-back') as UIKit.Text | undefined;
      backBtn?.addEventListener('click', () => {
        this.audio.playSfx('click');
        this.showPanel('menu');
      });
    });

    // Wire achievements
    this.queries.achpanel.subscribe('qualify', (entity) => {
      const doc = getDoc(entity);
      if (!doc) return;

      const nextBtn = doc.getElementById('btn-next') as UIKit.Text | undefined;
      nextBtn?.addEventListener('click', () => {
        this.audio.playSfx('click');
        this.achPage = (this.achPage + 1) % 2;
        this.updateAchPanel();
      });

      const prevBtn = doc.getElementById('btn-prev') as UIKit.Text | undefined;
      prevBtn?.addEventListener('click', () => {
        this.audio.playSfx('click');
        this.achPage = (this.achPage + 1) % 2;
        this.updateAchPanel();
      });

      const backBtn = doc.getElementById('btn-back') as UIKit.Text | undefined;
      backBtn?.addEventListener('click', () => {
        this.audio.playSfx('click');
        this.showPanel('menu');
      });
    });

    // Wire stats
    this.queries.stats.subscribe('qualify', (entity) => {
      const doc = getDoc(entity);
      if (!doc) return;

      const backBtn = doc.getElementById('btn-back') as UIKit.Text | undefined;
      backBtn?.addEventListener('click', () => {
        this.audio.playSfx('click');
        this.showPanel('menu');
      });
    });

    // Load muted state
    try {
      const m = localStorage.getItem('neon-mind-muted');
      if (m === '1') {
        // Will be applied when setRefs provides audio
      }
    } catch {}
  }

  setRefs(refs: {
    game: GameSystem;
    audio: AudioSystem;
    effects: EffectsSystem;
    panels: Record<string, any>;
    positions: Record<string, [number, number, number]>;
    onThemeChange: (idx: number) => void;
  }) {
    this.game = refs.game;
    this.audio = refs.audio;
    this.effects = refs.effects;
    this.panels = refs.panels;
    this.positions = refs.positions;
    this.onThemeChange = refs.onThemeChange;

    // Load muted state
    try {
      const m = localStorage.getItem('neon-mind-muted');
      if (m === '1') {
        this.game.soundMuted = true;
        this.audio.muted = true;
      }
    } catch {}

    // Wire game callbacks
    this.game.onGuessSubmitted = (row, exact, partial) => {
      this.audio.playSfx(exact > 0 ? 'exact' : (partial > 0 ? 'partial' : 'miss'));
      if (exact > 0) this.effects.burstAt(0, this.game.BOARD_Y + row * this.game.ROW_SPACING + 0.1, this.game.BOARD_Z);
    };

    this.game.onWin = () => {
      this.audio.playSfx('win');
      this.effects.celebrate();
      const guesses = this.game.getGuessCount();
      const elapsed = this.game.getElapsed();
      this.updateResultsPanel(true, guesses, elapsed);
      this.showHUD(false);
      this.showPanel('results');
    };

    this.game.onLose = () => {
      this.audio.playSfx('lose');
      this.effects.defeat();
      const guesses = this.game.getGuessCount();
      const elapsed = this.game.getElapsed();
      this.updateResultsPanel(false, guesses, elapsed);
      this.showHUD(false);
      this.showPanel('results');
    };

    this.game.onPegPlaced = () => {
      this.audio.playSfx('place');
    };

    this.game.onColorSelected = () => {
      this.audio.playSfx('select');
    };
  }

  private startGame() {
    this.game.startGame(this.selectedMode, this.selectedDiff);
    this.showPanel('_none');
    this.showHUD(true);
  }

  private updateMenuSelection(entity: Entity) {
    const modes: GameMode[] = ['classic', 'speed', 'zen', 'challenge'];
    const diffs: Difficulty[] = ['easy', 'medium', 'hard'];

    for (const m of modes) {
      const el = getDoc(entity)?.getElementById(`btn-${m}`) as UIKit.Text | undefined;
      el?.setProperties({
        backgroundColor: m === this.selectedMode ? '#00aacc' : '#222244',
      });
    }
    for (const d of diffs) {
      const el = getDoc(entity)?.getElementById(`btn-${d}`) as UIKit.Text | undefined;
      el?.setProperties({
        backgroundColor: d === this.selectedDiff ? '#00aacc' : '#222244',
      });
    }
  }

  private updateResultsPanel(won: boolean, guesses: number, elapsed: number) {
    const entity = this.panels.results;
    if (!entity) return;
    setText(entity, 'title', won ? 'CODE CRACKED!' : 'CODE UNBROKEN');
    setText(entity, 'subtitle', won ? `Decoded in ${guesses} guess${guesses > 1 ? 'es' : ''}` : `The code was: ${this.game.getSecretColorNames()}`);
    setText(entity, 'stat-guesses', `Guesses: ${guesses} / ${this.game.getMaxGuesses()}`);
    setText(entity, 'stat-time', `Time: ${Math.floor(elapsed)}s`);
    setText(entity, 'stat-mode', `Mode: ${this.selectedMode} / ${this.selectedDiff}`);

    // Star rating
    let stars = 1;
    if (won) {
      if (guesses <= Math.ceil(this.game.getCodeLength() * 1.5)) stars = 3;
      else if (guesses <= Math.ceil(this.game.getMaxGuesses() * 0.6)) stars = 2;
    }
    setText(entity, 'stars', won ? '*'.repeat(stars) : '-');

    // Achievement notification
    if (this.game.pendingAchievement) {
      const ach = ACHIEVEMENTS.find(a => a.id === this.game.pendingAchievement);
      if (ach) {
        setText(entity, 'achievement', `Achievement: ${ach.name}`);
      }
      this.game.pendingAchievement = '';
    } else {
      setText(entity, 'achievement', '');
    }
  }

  private updateAchPanel() {
    const entity = this.panels.achpanel;
    if (!entity) return;
    const perPage = 10;
    const start = this.achPage * perPage;
    const pageAchs = ACHIEVEMENTS.slice(start, start + perPage);

    for (let i = 0; i < perPage; i++) {
      const ach = pageAchs[i];
      if (ach) {
        const unlocked = this.game.unlockedAchievements.has(ach.id);
        setText(entity, `ach-name-${i}`, `${unlocked ? '[*] ' : '[ ] '}${ach.name}`);
        setText(entity, `ach-desc-${i}`, ach.desc);
      } else {
        setText(entity, `ach-name-${i}`, '');
        setText(entity, `ach-desc-${i}`, '');
      }
    }

    const total = this.game.unlockedAchievements.size;
    setText(entity, 'ach-count', `${total} / ${ACHIEVEMENTS.length} unlocked`);
    setText(entity, 'page-num', `Page ${this.achPage + 1} / 2`);
  }

  private updateStatsPanel() {
    const entity = this.panels.stats;
    if (!entity) return;
    const s = this.game.stats;

    setText(entity, 'stat-played', `Games Played: ${s.gamesPlayed}`);
    setText(entity, 'stat-wins', `Wins: ${s.wins}`);
    setText(entity, 'stat-losses', `Losses: ${s.losses}`);
    setText(entity, 'stat-winrate', `Win Rate: ${s.gamesPlayed > 0 ? Math.round(s.wins / s.gamesPlayed * 100) : 0}%`);
    setText(entity, 'stat-streak', `Current Streak: ${s.winStreak}`);
    setText(entity, 'stat-beststreak', `Best Streak: ${s.bestStreak}`);
    setText(entity, 'stat-avgguesses', `Avg Guesses: ${s.gamesPlayed > 0 ? (s.totalGuesses / s.gamesPlayed).toFixed(1) : '-'}`);
    setText(entity, 'stat-perfect', `Perfect Games: ${s.perfectGames}`);
    setText(entity, 'stat-fastest', `Fastest Win: ${s.fastestWin > 0 ? Math.floor(s.fastestWin) + 's' : '-'}`);

    // By difficulty
    for (const d of ['easy', 'medium', 'hard']) {
      const bd = s.byDifficulty[d];
      setText(entity, `stat-${d}`, `${d}: ${bd ? `${bd.won}/${bd.played}` : '0/0'}`);
    }
  }

  update(delta: number) {
    if (!this.hudEntity || !this.game) return;

    // Update HUD
    if (this.activePanel === '_none' && !this.game.isGameOver) {
      const row = this.game.getCurrentRow() + 1;
      const max = this.game.getMaxGuesses();
      setText(this.hudEntity, 'guess-count', `Guess ${row} / ${max}`);
      setText(this.hudEntity, 'color-name', `Color: ${this.game.getSelectedColorName()}`);

      const fb = this.game.getLastFeedback();
      if (fb) {
        setText(this.hudEntity, 'feedback', `Last: ${fb.exact} exact, ${fb.partial} partial`);
      } else {
        setText(this.hudEntity, 'feedback', 'Place pegs and submit');
      }

      if (this.game.gameMode === 'speed') {
        const t = Math.ceil(this.game.getSpeedTimer());
        setText(this.hudEntity, 'timer', `Time: ${t}s`);
      } else {
        const t = Math.floor(this.game.getElapsed());
        setText(this.hudEntity, 'timer', `Time: ${t}s`);
      }

      setText(this.hudEntity, 'mode-label', `${this.selectedMode} / ${this.selectedDiff}`);
    }

    // Notification timer
    if (this.notifyTimer > 0) {
      this.notifyTimer -= delta;
      if (this.notifyTimer <= 0) {
        this.notifyText = '';
      }
    }

    // Keyboard shortcuts for panels
    const kb = this.world.input.keyboard;
    if (kb.getKeyDown('Escape')) {
      this.audio.playSfx('click');
      if (this.activePanel === '_none') {
        this.showHUD(false);
        this.showPanel('pause');
      } else if (this.activePanel === 'pause') {
        this.showPanel('_none');
        this.showHUD(true);
      } else if (this.activePanel !== 'menu') {
        this.showPanel('menu');
      }
    }

    // XR B button for pause
    const right = this.world.input.xr.gamepads.right;
    if (right && right.getButtonDown(InputComponent.B_Button)) {
      // B button is already mapped to submit in game - use left controller
    }
    const left = this.world.input.xr.gamepads.left;
    if (left && left.getButtonDown(InputComponent.A_Button)) {
      this.audio.playSfx('click');
      if (this.activePanel === '_none') {
        this.showHUD(false);
        this.showPanel('pause');
      } else if (this.activePanel === 'pause') {
        this.showPanel('_none');
        this.showHUD(true);
      }
    }
  }
}
