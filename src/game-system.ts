import {
  createSystem,
  Entity,
  Mesh,
  SphereGeometry,
  CylinderGeometry,
  MeshStandardMaterial,
  Color,
  Group,
  EdgesGeometry,
  LineSegments,
  LineBasicMaterial,
  RayInteractable,
  Hovered,
  Pressed,
  InputComponent,
  BoxGeometry,
  Vector3,
} from '@iwsdk/core';

// === Types ===
export type GameMode = 'classic' | 'speed' | 'zen' | 'challenge';
export type Difficulty = 'easy' | 'medium' | 'hard';
export type ColorScheme = 'cyan' | 'green' | 'magenta' | 'gold';

export interface GameStats {
  gamesPlayed: number;
  wins: number;
  losses: number;
  winStreak: number;
  bestStreak: number;
  totalGuesses: number;
  perfectGames: number;
  fastestWin: number;
  byDifficulty: Record<string, { played: number; won: number }>;
  byMode: Record<string, { played: number; won: number }>;
}

export const COLOR_SCHEMES: Record<ColorScheme, { p1: string; p2: string; accent: string; bg: string }> = {
  cyan: { p1: '#00ffff', p2: '#ff00ff', accent: '#00ffff', bg: '#001122' },
  green: { p1: '#00ff88', p2: '#ff4444', accent: '#00ff88', bg: '#001108' },
  magenta: { p1: '#ff66cc', p2: '#66ccff', accent: '#ff66cc', bg: '#110022' },
  gold: { p1: '#ffcc00', p2: '#00ccff', accent: '#ffcc00', bg: '#111100' },
};

// Peg colors for the game
const PEG_COLORS = [
  '#ff0044', // red
  '#00ff88', // green
  '#3388ff', // blue
  '#ffcc00', // yellow
  '#ff6600', // orange
  '#cc00ff', // purple
  '#00ffff', // cyan
  '#ff66cc', // pink
];

const PEG_COLOR_NAMES = ['Red', 'Green', 'Blue', 'Yellow', 'Orange', 'Purple', 'Cyan', 'Pink'];

// Difficulty settings
const DIFFICULTY_CONFIG: Record<Difficulty, { codeLength: number; numColors: number; maxGuesses: number }> = {
  easy: { codeLength: 4, numColors: 6, maxGuesses: 10 },
  medium: { codeLength: 5, numColors: 6, maxGuesses: 10 },
  hard: { codeLength: 5, numColors: 8, maxGuesses: 12 },
};

export const ACHIEVEMENTS = [
  { id: 'first_win', name: 'Code Breaker', desc: 'Win your first game' },
  { id: 'win_easy', name: 'Warm Up', desc: 'Win on Easy difficulty' },
  { id: 'win_medium', name: 'Sharp Mind', desc: 'Win on Medium difficulty' },
  { id: 'win_hard', name: 'Master Decoder', desc: 'Win on Hard difficulty' },
  { id: 'perfect_4', name: 'Lucky Guess', desc: 'Win in 4 or fewer guesses' },
  { id: 'perfect_3', name: 'Mind Reader', desc: 'Win in 3 or fewer guesses' },
  { id: 'perfect_2', name: 'Psychic', desc: 'Win in 2 or fewer guesses' },
  { id: 'perfect_1', name: 'Impossible', desc: 'Win on the first guess' },
  { id: 'win_streak_3', name: 'Hat Trick', desc: 'Win 3 games in a row' },
  { id: 'win_streak_5', name: 'Unstoppable', desc: 'Win 5 games in a row' },
  { id: 'win_streak_10', name: 'Legendary', desc: 'Win 10 games in a row' },
  { id: 'speed_win', name: 'Speed Cracker', desc: 'Win a Speed mode game' },
  { id: 'fast_win', name: 'Lightning Decode', desc: 'Win in under 30 seconds' },
  { id: 'challenge_win', name: 'Under Pressure', desc: 'Win a Challenge game' },
  { id: 'play_10', name: 'Dedicated', desc: 'Play 10 games' },
  { id: 'play_25', name: 'Veteran', desc: 'Play 25 games' },
  { id: 'play_50', name: 'Obsessed', desc: 'Play 50 games' },
  { id: 'all_exact', name: 'Bullseye Row', desc: 'Get all exact matches in one guess (no partials)' },
  { id: 'no_hints', name: 'Zero Info Start', desc: 'Get zero feedback on first guess and still win' },
  { id: 'all_diffs', name: 'Well Rounded', desc: 'Win on all 3 difficulties' },
];

export class GameSystem extends createSystem({
  interactables: { required: [RayInteractable] },
}) {
  // Game config
  gameMode: GameMode = 'classic';
  difficulty: Difficulty = 'medium';
  colorScheme: ColorScheme = 'cyan';
  soundMuted = false;

  // Game state
  secretCode: number[] = [];
  codeLength = 4;
  numColors = 6;
  maxGuesses = 10;
  currentGuessRow = 0;
  currentPegSlot = 0;
  guessBoard: (number | null)[][] = [];
  feedbackBoard: { exact: number; partial: number }[] = [];
  isGameOver = false;
  isWin = false;
  gameStartTime = 0;
  gameElapsed = 0;
  speedTimer = 120;
  moveCount = 0;
  firstGuessFeedback: { exact: number; partial: number } | null = null;

  // 3D elements
  boardGroup!: Group;
  pegSlotEntities: Entity[][] = [];
  pegMeshes: (Mesh | null)[][] = [];
  feedbackMeshes: Mesh[][][] = [];
  secretPegMeshes: Mesh[] = [];
  secretCoverMesh: Mesh | null = null;
  paletteEntities: Entity[] = [];
  paletteMeshes: Mesh[] = [];
  selectedColor = 0;
  selectionRing: Mesh | null = null;
  cursorMesh: Mesh | null = null;

  // Hover/input state
  hoveredSlot: { row: number; col: number } | null = null;
  hoveredPalette: number | null = null;
  inputCooldown = 0;
  confirmCooldown = 0;

  // Stats & achievements
  stats: GameStats = this.loadStats();
  unlockedAchievements: Set<string> = new Set(this.loadAchievements());
  pendingAchievement = '';

  // Callbacks
  onGuessSubmitted: ((row: number, exact: number, partial: number) => void) | null = null;
  onWin: (() => void) | null = null;
  onLose: (() => void) | null = null;
  onPegPlaced: ((row: number, col: number, color: number) => void) | null = null;
  onColorSelected: ((color: number) => void) | null = null;

  // Board layout constants
  readonly SLOT_SPACING = 0.18;
  readonly ROW_SPACING = 0.16;
  readonly BOARD_X = 0;
  readonly BOARD_Y = 1.0;
  readonly BOARD_Z = -2.0;
  readonly PEG_RADIUS = 0.055;
  readonly FEEDBACK_RADIUS = 0.025;
  readonly PALETTE_Y = 0.55;

  init() {
    this.boardGroup = new Group();
    this.boardGroup.position.set(this.BOARD_X, this.BOARD_Y, this.BOARD_Z);
    this.world.scene.add(this.boardGroup);
  }

  startGame(mode: GameMode, diff: Difficulty) {
    this.gameMode = mode;
    this.difficulty = diff;

    const config = DIFFICULTY_CONFIG[diff];
    this.codeLength = config.codeLength;
    this.numColors = config.numColors;
    this.maxGuesses = mode === 'challenge' ? Math.max(6, config.maxGuesses - 4) : config.maxGuesses;
    if (mode === 'zen') this.maxGuesses = 20;

    // Generate secret code
    this.secretCode = [];
    for (let i = 0; i < this.codeLength; i++) {
      this.secretCode.push(Math.floor(Math.random() * this.numColors));
    }

    // Init game state
    this.guessBoard = [];
    this.feedbackBoard = [];
    for (let r = 0; r < this.maxGuesses; r++) {
      this.guessBoard.push(new Array(this.codeLength).fill(null));
    }
    this.currentGuessRow = 0;
    this.currentPegSlot = 0;
    this.isGameOver = false;
    this.isWin = false;
    this.gameStartTime = performance.now();
    this.gameElapsed = 0;
    this.speedTimer = 120;
    this.moveCount = 0;
    this.selectedColor = 0;
    this.firstGuessFeedback = null;
    this.hoveredSlot = null;
    this.hoveredPalette = null;

    // Build 3D board
    this.clearBoard();
    this.buildBoard();
    this.buildPalette();
  }

  clearBoard() {
    // Remove all children from board group
    while (this.boardGroup.children.length > 0) {
      this.boardGroup.remove(this.boardGroup.children[0]);
    }
    // Destroy old entities
    for (const row of this.pegSlotEntities) {
      for (const e of row) {
        if (e) e.destroy();
      }
    }
    for (const e of this.paletteEntities) {
      if (e) e.destroy();
    }
    this.pegSlotEntities = [];
    this.pegMeshes = [];
    this.feedbackMeshes = [];
    this.secretPegMeshes = [];
    this.paletteEntities = [];
    this.paletteMeshes = [];
    this.secretCoverMesh = null;
    this.selectionRing = null;
    this.cursorMesh = null;
  }

  buildBoard() {
    const totalWidth = (this.codeLength - 1) * this.SLOT_SPACING;
    const startX = -totalWidth / 2;

    // Backboard
    const bbW = totalWidth + 0.5;
    const bbH = this.maxGuesses * this.ROW_SPACING + 0.6;
    const bbGeo = new BoxGeometry(bbW, bbH, 0.02);
    const bbMat = new MeshStandardMaterial({
      color: new Color('#080818'),
      emissive: new Color('#020208'),
      emissiveIntensity: 0.3,
      metalness: 0.9,
      roughness: 0.2,
      transparent: true,
      opacity: 0.85,
    });
    const backboard = new Mesh(bbGeo, bbMat);
    backboard.position.set(0, (this.maxGuesses * this.ROW_SPACING) / 2 + 0.15, -0.02);
    this.boardGroup.add(backboard);

    // Backboard edge
    const bbEdges = new LineSegments(
      new EdgesGeometry(bbGeo),
      new LineBasicMaterial({ color: new Color('#224488'), transparent: true, opacity: 0.5 })
    );
    bbEdges.position.copy(backboard.position);
    this.boardGroup.add(bbEdges);

    // Guess row slots
    for (let r = 0; r < this.maxGuesses; r++) {
      const rowEntities: Entity[] = [];
      const rowMeshes: (Mesh | null)[] = [];
      const rowFeedback: Mesh[][] = [];
      const y = r * this.ROW_SPACING + 0.1;

      // Row number label backing
      const rowLabelGeo = new BoxGeometry(0.08, 0.08, 0.005);
      const rowLabelMat = new MeshStandardMaterial({
        color: new Color('#112244'),
        emissive: new Color('#112244'),
        emissiveIntensity: 0.3,
        transparent: true,
        opacity: 0.6,
      });
      const rowLabel = new Mesh(rowLabelGeo, rowLabelMat);
      rowLabel.position.set(startX - 0.2, y, 0);
      this.boardGroup.add(rowLabel);

      for (let c = 0; c < this.codeLength; c++) {
        const x = startX + c * this.SLOT_SPACING;

        // Empty slot ring
        const slotGeo = new CylinderGeometry(this.PEG_RADIUS + 0.008, this.PEG_RADIUS + 0.008, 0.01, 16);
        const slotMat = new MeshStandardMaterial({
          color: new Color('#223344'),
          emissive: new Color('#112233'),
          emissiveIntensity: 0.3,
          transparent: true,
          opacity: 0.6,
        });
        const slotMesh = new Mesh(slotGeo, slotMat);
        slotMesh.rotation.x = Math.PI / 2;
        slotMesh.position.set(x, y, 0.01);
        this.boardGroup.add(slotMesh);

        // Clickable area
        const hitGeo = new SphereGeometry(this.PEG_RADIUS + 0.02, 8, 8);
        const hitMat = new MeshStandardMaterial({ visible: false });
        const hitMesh = new Mesh(hitGeo, hitMat);
        hitMesh.position.set(x, y, 0.02);

        const grp = new Group();
        grp.add(hitMesh);
        this.boardGroup.add(grp);

        const entity = this.world.createTransformEntity(grp);
        entity.addComponent(RayInteractable);
        (entity as any)._slotRow = r;
        (entity as any)._slotCol = c;
        (entity as any)._isPalette = false;

        rowEntities.push(entity);
        rowMeshes.push(null);
      }

      // Feedback peg area (to the right of the guess slots)
      const fbStartX = startX + this.codeLength * this.SLOT_SPACING + 0.05;
      const fbRow: Mesh[] = [];
      const fbCols = Math.ceil(this.codeLength / 2);
      for (let f = 0; f < this.codeLength; f++) {
        const fx = fbStartX + (f % fbCols) * 0.07;
        const fy = y + (f < fbCols ? 0.03 : -0.03);
        const fbGeo = new SphereGeometry(this.FEEDBACK_RADIUS, 8, 8);
        const fbMat = new MeshStandardMaterial({
          color: new Color('#1a1a2e'),
          emissive: new Color('#0a0a15'),
          emissiveIntensity: 0.2,
          transparent: true,
          opacity: 0.4,
        });
        const fbMesh = new Mesh(fbGeo, fbMat);
        fbMesh.position.set(fx, fy, 0.01);
        this.boardGroup.add(fbMesh);
        fbRow.push(fbMesh);
      }
      rowFeedback.push(fbRow);

      this.pegSlotEntities.push(rowEntities);
      this.pegMeshes.push(rowMeshes);
      this.feedbackMeshes.push(rowFeedback);
    }

    // Secret code area at top
    const secretY = this.maxGuesses * this.ROW_SPACING + 0.2;
    for (let c = 0; c < this.codeLength; c++) {
      const x = startX + c * this.SLOT_SPACING;
      const pegGeo = new SphereGeometry(this.PEG_RADIUS, 16, 16);
      const pegMat = new MeshStandardMaterial({
        color: new Color(PEG_COLORS[this.secretCode[c]]),
        emissive: new Color(PEG_COLORS[this.secretCode[c]]),
        emissiveIntensity: 0.5,
        metalness: 0.3,
        roughness: 0.4,
      });
      const pegMesh = new Mesh(pegGeo, pegMat);
      pegMesh.position.set(x, secretY, 0.02);
      this.boardGroup.add(pegMesh);
      this.secretPegMeshes.push(pegMesh);
    }

    // Cover for secret code
    const coverW = totalWidth + 0.2;
    const coverGeo = new BoxGeometry(coverW, 0.14, 0.06);
    const coverMat = new MeshStandardMaterial({
      color: new Color('#1a1a3e'),
      emissive: new Color('#0d0d2a'),
      emissiveIntensity: 0.5,
      metalness: 0.6,
      roughness: 0.3,
    });
    this.secretCoverMesh = new Mesh(coverGeo, coverMat);
    this.secretCoverMesh.position.set(0, secretY, 0.02);
    this.boardGroup.add(this.secretCoverMesh);

    // Cover label edges
    const coverEdges = new LineSegments(
      new EdgesGeometry(coverGeo),
      new LineBasicMaterial({ color: new Color('#4444aa'), transparent: true, opacity: 0.7 })
    );
    coverEdges.position.copy(this.secretCoverMesh.position);
    this.boardGroup.add(coverEdges);

    // Cursor ring for current slot
    const cursorGeo = new CylinderGeometry(this.PEG_RADIUS + 0.015, this.PEG_RADIUS + 0.015, 0.015, 20);
    const cursorMat = new MeshStandardMaterial({
      color: new Color('#ffffff'),
      emissive: new Color('#ffffff'),
      emissiveIntensity: 1.0,
      transparent: true,
      opacity: 0.8,
      wireframe: true,
    });
    this.cursorMesh = new Mesh(cursorGeo, cursorMat);
    this.cursorMesh.rotation.x = Math.PI / 2;
    this.boardGroup.add(this.cursorMesh);
    this.updateCursorPosition();

    // Active row highlight
    this.updateActiveRowHighlight();
  }

  buildPalette() {
    const totalWidth = (this.numColors - 1) * this.SLOT_SPACING;
    const startX = -totalWidth / 2;

    // Palette backboard
    const palBBW = totalWidth + 0.4;
    const palBBGeo = new BoxGeometry(palBBW, 0.18, 0.02);
    const palBBMat = new MeshStandardMaterial({
      color: new Color('#0a0a1e'),
      emissive: new Color('#050510'),
      emissiveIntensity: 0.3,
      metalness: 0.8,
      roughness: 0.3,
      transparent: true,
      opacity: 0.8,
    });
    const palBB = new Mesh(palBBGeo, palBBMat);
    palBB.position.set(this.BOARD_X, this.PALETTE_Y, this.BOARD_Z - 0.02);
    this.world.scene.add(palBB);
    // Store for cleanup (add to boardGroup indirectly)

    // Palette edge
    const palEdges = new LineSegments(
      new EdgesGeometry(palBBGeo),
      new LineBasicMaterial({ color: new Color('#334466'), transparent: true, opacity: 0.5 })
    );
    palEdges.position.copy(palBB.position);
    this.world.scene.add(palEdges);

    for (let i = 0; i < this.numColors; i++) {
      const x = startX + i * this.SLOT_SPACING;
      const pegGeo = new SphereGeometry(this.PEG_RADIUS + 0.01, 16, 16);
      const pegMat = new MeshStandardMaterial({
        color: new Color(PEG_COLORS[i]),
        emissive: new Color(PEG_COLORS[i]),
        emissiveIntensity: 0.6,
        metalness: 0.3,
        roughness: 0.4,
      });
      const pegMesh = new Mesh(pegGeo, pegMat);

      const grp = new Group();
      grp.position.set(this.BOARD_X + x, this.PALETTE_Y, this.BOARD_Z + 0.02);
      grp.add(pegMesh);
      this.world.scene.add(grp);

      const entity = this.world.createTransformEntity(grp);
      entity.addComponent(RayInteractable);
      (entity as any)._paletteIdx = i;
      (entity as any)._isPalette = true;

      this.paletteEntities.push(entity);
      this.paletteMeshes.push(pegMesh);
    }

    // Selection ring around selected color
    const ringGeo = new CylinderGeometry(this.PEG_RADIUS + 0.025, this.PEG_RADIUS + 0.025, 0.015, 20);
    const ringMat = new MeshStandardMaterial({
      color: new Color('#ffffff'),
      emissive: new Color('#ffffff'),
      emissiveIntensity: 1.0,
      transparent: true,
      opacity: 0.9,
      wireframe: true,
    });
    this.selectionRing = new Mesh(ringGeo, ringMat);
    this.selectionRing.rotation.x = Math.PI / 2;
    this.world.scene.add(this.selectionRing);
    this.updateSelectionRing();
  }

  updateSelectionRing() {
    if (!this.selectionRing || this.paletteEntities.length === 0) return;
    const totalWidth = (this.numColors - 1) * this.SLOT_SPACING;
    const startX = -totalWidth / 2;
    const x = startX + this.selectedColor * this.SLOT_SPACING;
    this.selectionRing.position.set(this.BOARD_X + x, this.PALETTE_Y, this.BOARD_Z + 0.035);
  }

  updateCursorPosition() {
    if (!this.cursorMesh) return;
    if (this.isGameOver || this.currentGuessRow >= this.maxGuesses) {
      this.cursorMesh.visible = false;
      return;
    }
    this.cursorMesh.visible = true;
    const totalWidth = (this.codeLength - 1) * this.SLOT_SPACING;
    const startX = -totalWidth / 2;
    const x = startX + this.currentPegSlot * this.SLOT_SPACING;
    const y = this.currentGuessRow * this.ROW_SPACING + 0.1;
    this.cursorMesh.position.set(x, y, 0.025);
  }

  updateActiveRowHighlight() {
    // Highlight active row by making slot rings brighter
    for (let r = 0; r < this.pegSlotEntities.length; r++) {
      const isActive = r === this.currentGuessRow && !this.isGameOver;
      for (const entity of this.pegSlotEntities[r]) {
        // No direct mesh access needed - visual feedback via cursor
      }
    }
  }

  placePeg(row: number, col: number, colorIdx: number) {
    if (row !== this.currentGuessRow || this.isGameOver) return;
    if (colorIdx < 0 || colorIdx >= this.numColors) return;

    this.guessBoard[row][col] = colorIdx;

    // Create or update peg mesh
    const totalWidth = (this.codeLength - 1) * this.SLOT_SPACING;
    const startX = -totalWidth / 2;
    const x = startX + col * this.SLOT_SPACING;
    const y = row * this.ROW_SPACING + 0.1;

    if (this.pegMeshes[row][col]) {
      this.boardGroup.remove(this.pegMeshes[row][col]!);
    }

    const pegGeo = new SphereGeometry(this.PEG_RADIUS, 16, 16);
    const pegMat = new MeshStandardMaterial({
      color: new Color(PEG_COLORS[colorIdx]),
      emissive: new Color(PEG_COLORS[colorIdx]),
      emissiveIntensity: 0.5,
      metalness: 0.3,
      roughness: 0.4,
    });
    const pegMesh = new Mesh(pegGeo, pegMat);
    pegMesh.position.set(x, y, 0.02);
    pegMesh.scale.set(0, 0, 0);
    this.boardGroup.add(pegMesh);
    this.pegMeshes[row][col] = pegMesh;

    this.onPegPlaced?.(row, col, colorIdx);
  }

  removePeg(row: number, col: number) {
    if (row !== this.currentGuessRow || this.isGameOver) return;
    if (this.guessBoard[row][col] === null) return;

    this.guessBoard[row][col] = null;
    if (this.pegMeshes[row][col]) {
      this.boardGroup.remove(this.pegMeshes[row][col]!);
      this.pegMeshes[row][col] = null;
    }
  }

  canSubmitGuess(): boolean {
    if (this.isGameOver || this.currentGuessRow >= this.maxGuesses) return false;
    return this.guessBoard[this.currentGuessRow].every(v => v !== null);
  }

  submitGuess(): { exact: number; partial: number } | null {
    if (!this.canSubmitGuess()) return null;

    const guess = this.guessBoard[this.currentGuessRow] as number[];
    const secret = [...this.secretCode];
    let exact = 0;
    let partial = 0;

    // Count exact matches first
    const secretRemaining: number[] = [];
    const guessRemaining: number[] = [];
    for (let i = 0; i < this.codeLength; i++) {
      if (guess[i] === secret[i]) {
        exact++;
      } else {
        secretRemaining.push(secret[i]);
        guessRemaining.push(guess[i]);
      }
    }

    // Count partial matches
    const secretCounts: Record<number, number> = {};
    for (const s of secretRemaining) {
      secretCounts[s] = (secretCounts[s] || 0) + 1;
    }
    for (const g of guessRemaining) {
      if (secretCounts[g] && secretCounts[g] > 0) {
        partial++;
        secretCounts[g]--;
      }
    }

    const feedback = { exact, partial };
    this.feedbackBoard.push(feedback);
    this.moveCount++;

    if (this.currentGuessRow === 0) {
      this.firstGuessFeedback = feedback;
    }

    // Display feedback pegs
    this.displayFeedback(this.currentGuessRow, exact, partial);

    this.onGuessSubmitted?.(this.currentGuessRow, exact, partial);

    // Check win/lose
    if (exact === this.codeLength) {
      this.isGameOver = true;
      this.isWin = true;
      this.revealSecret();
      this.recordResult(true);
      this.onWin?.();
    } else {
      this.currentGuessRow++;
      if (this.currentGuessRow >= this.maxGuesses) {
        this.isGameOver = true;
        this.isWin = false;
        this.revealSecret();
        this.recordResult(false);
        this.onLose?.();
      } else {
        this.currentPegSlot = 0;
        this.updateCursorPosition();
        this.updateActiveRowHighlight();
      }
    }

    return feedback;
  }

  displayFeedback(row: number, exact: number, partial: number) {
    if (!this.feedbackMeshes[row] || !this.feedbackMeshes[row][0]) return;
    const fbPegs = this.feedbackMeshes[row][0];
    let idx = 0;

    // Exact matches = bright white
    for (let i = 0; i < exact; i++) {
      if (idx < fbPegs.length) {
        const mat = fbPegs[idx].material as MeshStandardMaterial;
        mat.color.set('#ffffff');
        mat.emissive.set('#ffffff');
        mat.emissiveIntensity = 0.8;
        mat.opacity = 1.0;
        fbPegs[idx].scale.set(1.2, 1.2, 1.2);
        idx++;
      }
    }

    // Partial matches = colored (scheme accent)
    const scheme = COLOR_SCHEMES[this.colorScheme];
    for (let i = 0; i < partial; i++) {
      if (idx < fbPegs.length) {
        const mat = fbPegs[idx].material as MeshStandardMaterial;
        mat.color.set(scheme.accent);
        mat.emissive.set(scheme.accent);
        mat.emissiveIntensity = 0.6;
        mat.opacity = 0.9;
        fbPegs[idx].scale.set(1.1, 1.1, 1.1);
        idx++;
      }
    }
  }

  revealSecret() {
    if (this.secretCoverMesh) {
      this.secretCoverMesh.visible = false;
    }
  }

  recordResult(won: boolean) {
    this.stats.gamesPlayed++;
    if (won) {
      this.stats.wins++;
      this.stats.winStreak++;
      if (this.stats.winStreak > this.stats.bestStreak) {
        this.stats.bestStreak = this.stats.winStreak;
      }
      const elapsed = this.gameElapsed;
      if (this.stats.fastestWin === 0 || elapsed < this.stats.fastestWin) {
        this.stats.fastestWin = elapsed;
      }
    } else {
      this.stats.losses++;
      this.stats.winStreak = 0;
    }
    this.stats.totalGuesses += this.moveCount;
    if (won && this.moveCount <= this.codeLength) {
      this.stats.perfectGames++;
    }

    // By difficulty
    const dk = this.difficulty;
    if (!this.stats.byDifficulty[dk]) this.stats.byDifficulty[dk] = { played: 0, won: 0 };
    this.stats.byDifficulty[dk].played++;
    if (won) this.stats.byDifficulty[dk].won++;

    // By mode
    const mk = this.gameMode;
    if (!this.stats.byMode[mk]) this.stats.byMode[mk] = { played: 0, won: 0 };
    this.stats.byMode[mk].played++;
    if (won) this.stats.byMode[mk].won++;

    this.saveStats();
    this.checkAchievements(won);
  }

  checkAchievements(won: boolean) {
    const tryUnlock = (id: string) => {
      if (!this.unlockedAchievements.has(id)) {
        this.unlockedAchievements.add(id);
        this.pendingAchievement = id;
        this.saveAchievements();
      }
    };

    if (won) {
      tryUnlock('first_win');
      if (this.difficulty === 'easy') tryUnlock('win_easy');
      if (this.difficulty === 'medium') tryUnlock('win_medium');
      if (this.difficulty === 'hard') tryUnlock('win_hard');
      if (this.moveCount <= 4) tryUnlock('perfect_4');
      if (this.moveCount <= 3) tryUnlock('perfect_3');
      if (this.moveCount <= 2) tryUnlock('perfect_2');
      if (this.moveCount <= 1) tryUnlock('perfect_1');
      if (this.stats.winStreak >= 3) tryUnlock('win_streak_3');
      if (this.stats.winStreak >= 5) tryUnlock('win_streak_5');
      if (this.stats.winStreak >= 10) tryUnlock('win_streak_10');
      if (this.gameMode === 'speed') tryUnlock('speed_win');
      if (this.gameElapsed < 30) tryUnlock('fast_win');
      if (this.gameMode === 'challenge') tryUnlock('challenge_win');

      // Check all exact (no partials) in any guess
      for (const fb of this.feedbackBoard) {
        if (fb.exact === this.codeLength) tryUnlock('all_exact');
      }

      // Zero info start
      if (this.firstGuessFeedback && this.firstGuessFeedback.exact === 0 && this.firstGuessFeedback.partial === 0) {
        tryUnlock('no_hints');
      }

      // All difficulties
      const byD = this.stats.byDifficulty;
      if (byD['easy']?.won && byD['medium']?.won && byD['hard']?.won) {
        tryUnlock('all_diffs');
      }
    }

    if (this.stats.gamesPlayed >= 10) tryUnlock('play_10');
    if (this.stats.gamesPlayed >= 25) tryUnlock('play_25');
    if (this.stats.gamesPlayed >= 50) tryUnlock('play_50');
  }

  // Peg placement animation tracking
  private animatingPegs: { mesh: Mesh; target: number; current: number }[] = [];

  update(delta: number) {
    if (!this.isGameOver) {
      this.gameElapsed = (performance.now() - this.gameStartTime) / 1000;
      if (this.gameMode === 'speed') {
        this.speedTimer = Math.max(0, 120 - this.gameElapsed);
        if (this.speedTimer <= 0) {
          this.isGameOver = true;
          this.isWin = false;
          this.revealSecret();
          this.recordResult(false);
          this.onLose?.();
        }
      }
    }

    // Animate peg placements
    for (let i = this.animatingPegs.length - 1; i >= 0; i--) {
      const ap = this.animatingPegs[i];
      ap.current += delta * 8;
      if (ap.current >= ap.target) {
        ap.mesh.scale.set(ap.target, ap.target, ap.target);
        this.animatingPegs.splice(i, 1);
      } else {
        const t = ap.current / ap.target;
        const bounce = t < 0.7 ? t / 0.7 : 1 + Math.sin((t - 0.7) / 0.3 * Math.PI) * 0.15;
        const s = ap.target * bounce;
        ap.mesh.scale.set(s, s, s);
      }
    }

    // Cursor pulse
    if (this.cursorMesh && this.cursorMesh.visible) {
      const pulse = 0.7 + Math.sin(performance.now() * 0.004) * 0.3;
      (this.cursorMesh.material as MeshStandardMaterial).opacity = pulse;
    }

    // Selection ring pulse
    if (this.selectionRing) {
      const pulse = 0.6 + Math.sin(performance.now() * 0.003) * 0.3;
      (this.selectionRing.material as MeshStandardMaterial).opacity = pulse;
    }

    // Input handling
    this.inputCooldown = Math.max(0, this.inputCooldown - delta);
    this.confirmCooldown = Math.max(0, this.confirmCooldown - delta);

    if (!this.isGameOver && this.currentGuessRow < this.maxGuesses) {
      this.handleInput();
    }
  }

  handleInput() {
    const kb = this.world.input.keyboard;

    // Keyboard: left/right to select color
    if (this.inputCooldown <= 0) {
      if (kb.getKeyDown('ArrowLeft') || kb.getKeyDown('KeyA')) {
        this.selectedColor = (this.selectedColor - 1 + this.numColors) % this.numColors;
        this.updateSelectionRing();
        this.onColorSelected?.(this.selectedColor);
        this.inputCooldown = 0.15;
      }
      if (kb.getKeyDown('ArrowRight') || kb.getKeyDown('KeyD')) {
        this.selectedColor = (this.selectedColor + 1) % this.numColors;
        this.updateSelectionRing();
        this.onColorSelected?.(this.selectedColor);
        this.inputCooldown = 0.15;
      }
      // Up/down to navigate slots
      if (kb.getKeyDown('ArrowUp') || kb.getKeyDown('KeyW')) {
        this.currentPegSlot = (this.currentPegSlot + 1) % this.codeLength;
        this.updateCursorPosition();
        this.inputCooldown = 0.15;
      }
      if (kb.getKeyDown('ArrowDown') || kb.getKeyDown('KeyS')) {
        this.currentPegSlot = (this.currentPegSlot - 1 + this.codeLength) % this.codeLength;
        this.updateCursorPosition();
        this.inputCooldown = 0.15;
      }
    }

    // Space/Enter to place peg
    if (this.confirmCooldown <= 0) {
      if (kb.getKeyDown('Space') || kb.getKeyDown('Enter')) {
        this.placePeg(this.currentGuessRow, this.currentPegSlot, this.selectedColor);
        this.animatingPegs.push({
          mesh: this.pegMeshes[this.currentGuessRow][this.currentPegSlot]!,
          target: 1,
          current: 0,
        });
        // Auto-advance to next empty slot
        this.advanceToNextSlot();
        this.confirmCooldown = 0.15;
      }

      // Z to undo last peg in current row
      if (kb.getKeyDown('KeyZ')) {
        this.undoLastPeg();
        this.confirmCooldown = 0.15;
      }

      // R to submit guess
      if (kb.getKeyDown('KeyR')) {
        if (this.canSubmitGuess()) {
          this.submitGuess();
          this.confirmCooldown = 0.3;
        }
      }
    }

    // XR controller input
    const right = this.world.input.xr.gamepads.right;
    const left = this.world.input.xr.gamepads.left;

    if (right) {
      // Thumbstick left/right for color selection
      const stick = right.getAxesValues(InputComponent.Thumbstick);
      if (stick && this.inputCooldown <= 0) {
        if (stick.x > 0.5) {
          this.selectedColor = (this.selectedColor + 1) % this.numColors;
          this.updateSelectionRing();
          this.onColorSelected?.(this.selectedColor);
          this.inputCooldown = 0.2;
        } else if (stick.x < -0.5) {
          this.selectedColor = (this.selectedColor - 1 + this.numColors) % this.numColors;
          this.updateSelectionRing();
          this.onColorSelected?.(this.selectedColor);
          this.inputCooldown = 0.2;
        }
        // Thumbstick up/down for slot navigation
        if (stick.y > 0.5) {
          this.currentPegSlot = (this.currentPegSlot + 1) % this.codeLength;
          this.updateCursorPosition();
          this.inputCooldown = 0.2;
        } else if (stick.y < -0.5) {
          this.currentPegSlot = (this.currentPegSlot - 1 + this.codeLength) % this.codeLength;
          this.updateCursorPosition();
          this.inputCooldown = 0.2;
        }
      }

      // A button to place peg
      if (right.getButtonDown(InputComponent.A_Button) && this.confirmCooldown <= 0) {
        this.placePeg(this.currentGuessRow, this.currentPegSlot, this.selectedColor);
        if (this.pegMeshes[this.currentGuessRow][this.currentPegSlot]) {
          this.animatingPegs.push({
            mesh: this.pegMeshes[this.currentGuessRow][this.currentPegSlot]!,
            target: 1,
            current: 0,
          });
        }
        this.advanceToNextSlot();
        this.confirmCooldown = 0.15;
      }

      // B button for submit
      if (right.getButtonDown(InputComponent.B_Button) && this.confirmCooldown <= 0) {
        if (this.canSubmitGuess()) {
          this.submitGuess();
          this.confirmCooldown = 0.3;
        }
      }
    }

    if (left) {
      // Y button for undo
      if (left.getButtonDown(InputComponent.B_Button) && this.confirmCooldown <= 0) {
        this.undoLastPeg();
        this.confirmCooldown = 0.15;
      }
    }

    // Ray interaction - check for slot/palette clicks
    for (const entity of this.queries.interactables.entities) {
      if ((entity as any)._isPalette) {
        const idx = (entity as any)._paletteIdx as number;
        if (entity.hasComponent(Hovered)) {
          this.hoveredPalette = idx;
          // Scale up on hover
          if (this.paletteMeshes[idx]) {
            this.paletteMeshes[idx].scale.set(1.2, 1.2, 1.2);
          }
        } else if (this.hoveredPalette === idx) {
          this.hoveredPalette = null;
          if (this.paletteMeshes[idx]) {
            this.paletteMeshes[idx].scale.set(1, 1, 1);
          }
        }
        if (entity.hasComponent(Pressed)) {
          this.selectedColor = idx;
          this.updateSelectionRing();
          this.onColorSelected?.(idx);
        }
      } else {
        const row = (entity as any)._slotRow as number;
        const col = (entity as any)._slotCol as number;
        if (row === this.currentGuessRow) {
          if (entity.hasComponent(Pressed)) {
            this.currentPegSlot = col;
            this.placePeg(row, col, this.selectedColor);
            if (this.pegMeshes[row][col]) {
              this.animatingPegs.push({
                mesh: this.pegMeshes[row][col]!,
                target: 1,
                current: 0,
              });
            }
            this.advanceToNextSlot();
            this.updateCursorPosition();
          }
        }
      }
    }
  }

  advanceToNextSlot() {
    // Move to next empty slot, or stay if all filled
    for (let i = 1; i <= this.codeLength; i++) {
      const next = (this.currentPegSlot + i) % this.codeLength;
      if (this.guessBoard[this.currentGuessRow][next] === null) {
        this.currentPegSlot = next;
        this.updateCursorPosition();
        return;
      }
    }
    // All filled, stay put
    this.updateCursorPosition();
  }

  undoLastPeg() {
    const row = this.currentGuessRow;
    // Find last filled slot
    for (let c = this.codeLength - 1; c >= 0; c--) {
      if (this.guessBoard[row][c] !== null) {
        this.removePeg(row, c);
        this.currentPegSlot = c;
        this.updateCursorPosition();
        return;
      }
    }
  }

  getGuessCount(): number { return this.moveCount; }
  getMaxGuesses(): number { return this.maxGuesses; }
  getCodeLength(): number { return this.codeLength; }
  getNumColors(): number { return this.numColors; }
  getElapsed(): number { return this.gameElapsed; }
  getSpeedTimer(): number { return this.speedTimer; }
  getSelectedColor(): number { return this.selectedColor; }
  getSelectedColorName(): string { return PEG_COLOR_NAMES[this.selectedColor] || '?'; }
  getSecretCode(): number[] { return this.secretCode; }
  getSecretColorNames(): string { return this.secretCode.map(c => PEG_COLOR_NAMES[c]).join(', '); }
  getCurrentRow(): number { return this.currentGuessRow; }
  getLastFeedback(): { exact: number; partial: number } | null {
    return this.feedbackBoard.length > 0 ? this.feedbackBoard[this.feedbackBoard.length - 1] : null;
  }

  loadStats(): GameStats {
    try {
      const d = localStorage.getItem('neon-mind-stats');
      if (d) return JSON.parse(d);
    } catch {}
    return {
      gamesPlayed: 0, wins: 0, losses: 0, winStreak: 0, bestStreak: 0,
      totalGuesses: 0, perfectGames: 0, fastestWin: 0,
      byDifficulty: {}, byMode: {},
    };
  }

  saveStats() {
    try { localStorage.setItem('neon-mind-stats', JSON.stringify(this.stats)); } catch {}
  }

  loadAchievements(): string[] {
    try {
      const d = localStorage.getItem('neon-mind-achievements');
      if (d) return JSON.parse(d);
    } catch {}
    return [];
  }

  saveAchievements() {
    try { localStorage.setItem('neon-mind-achievements', JSON.stringify([...this.unlockedAchievements])); } catch {}
  }
}
