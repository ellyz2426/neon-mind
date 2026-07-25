import {
  World,
  PanelUI,
  Group,
  PointLight,
  AmbientLight,
  Color,
  Fog,
  GridHelper,
  MeshStandardMaterial,
  Mesh,
  BoxGeometry,
  CylinderGeometry,
  LineSegments,
  EdgesGeometry,
  LineBasicMaterial,
  SphereGeometry,
  createSystem,
} from '@iwsdk/core';
import { GameSystem, COLOR_SCHEMES, type ColorScheme } from './game-system.js';
import { UISystem } from './ui-system.js';
import { AudioSystem } from './audio-system.js';
import { EffectsSystem } from './effects-system.js';
import { BoardEffectsSystem } from './board-effects-system.js';
import { AmbientMusicSystem } from './ambient-music-system.js';

const container = document.getElementById('scene-container') as HTMLDivElement;
const world = await World.create(container, {
  xr: { offer: 'once' },
  features: { locomotion: { browserControls: true } },
  render: {
    camera: { position: [0, 1.6, 0], lookAt: [0, 1.2, -2] },
  },
});

// === Lighting ===
const ambient = new AmbientLight(0x111133, 0.4);
world.scene.add(ambient);

const l1 = new PointLight(0x00ffff, 2, 15);
l1.position.set(-2, 3, -2);
world.scene.add(l1);

const l2 = new PointLight(0xff00ff, 1.5, 15);
l2.position.set(2, 3, -2);
world.scene.add(l2);

const l3 = new PointLight(0x4444ff, 1, 10);
l3.position.set(0, 4, 0);
world.scene.add(l3);

// Dynamic game light - follows the active row
const gameLight = new PointLight(0x00ffcc, 0.5, 5);
gameLight.position.set(0, 1.5, -1.5);
world.scene.add(gameLight);

// === Floor ===
const floorGeo = new BoxGeometry(20, 0.001, 20, 1, 1, 1);
const floorMat = new MeshStandardMaterial({
  color: new Color('#040410'),
  emissive: new Color('#010108'),
  emissiveIntensity: 0.2,
  metalness: 0.8,
  roughness: 0.3,
});
const floor = new Mesh(floorGeo, floorMat);
floor.position.y = 0.01;
world.scene.add(floor);

// === Grid ===
const grid = new GridHelper(14, 28, 0x112244, 0x0a1122);
grid.position.y = 0.02;
world.scene.add(grid);

// === Floor glow pool (subtle reflection under the board) ===
const poolGeo = new BoxGeometry(2.5, 0.002, 1.2, 1, 1, 1);
const poolMat = new MeshStandardMaterial({
  color: new Color('#00ccff'),
  emissive: new Color('#00ccff'),
  emissiveIntensity: 0.15,
  transparent: true,
  opacity: 0.08,
  metalness: 0,
  roughness: 1,
});
const pool = new Mesh(poolGeo, poolMat);
pool.position.set(0, 0.03, -2);
world.scene.add(pool);

// === Speed Mode Timer Bar ===
const timerBarWidth = 2.0;
const timerBarGeo = new BoxGeometry(timerBarWidth, 0.02, 0.06);
const timerBarMat = new MeshStandardMaterial({
  color: new Color('#00ffcc'),
  emissive: new Color('#00ffcc'),
  emissiveIntensity: 0.8,
  transparent: true,
  opacity: 0.7,
  metalness: 0.3,
  roughness: 0.4,
});
const timerBarMesh = new Mesh(timerBarGeo, timerBarMat);
timerBarMesh.position.set(0, 0.62, -1.98);
timerBarMesh.visible = false;
world.scene.add(timerBarMesh);

// Timer bar backdrop
const timerBgGeo = new BoxGeometry(timerBarWidth + 0.06, 0.035, 0.04);
const timerBgMat = new MeshStandardMaterial({
  color: new Color('#0a0a1e'),
  emissive: new Color('#050510'),
  emissiveIntensity: 0.2,
  transparent: true,
  opacity: 0.6,
  metalness: 0.8,
  roughness: 0.3,
});
const timerBgMesh = new Mesh(timerBgGeo, timerBgMat);
timerBgMesh.position.set(0, 0.62, -1.985);
timerBgMesh.visible = false;
world.scene.add(timerBgMesh);

// Timer bar edge glow
const timerEdgeGeo = new EdgesGeometry(timerBgGeo);
const timerEdgeMat = new LineBasicMaterial({
  color: new Color('#224466'),
  transparent: true,
  opacity: 0.4,
});
const timerEdgeMesh = new LineSegments(timerEdgeGeo, timerEdgeMat);
timerEdgeMesh.position.copy(timerBgMesh.position);
timerEdgeMesh.visible = false;
world.scene.add(timerEdgeMesh);

// === Fog ===
world.scene.fog = new Fog(0x000011, 6, 20);

// === Pillars with neon trim ===
const pillarPositions: [number, number][] = [];
for (let i = 0; i < 6; i++) {
  const angle = (i / 6) * Math.PI * 2 + Math.PI / 6;
  const px = Math.cos(angle) * 4.5;
  const pz = Math.sin(angle) * 4.5 - 2;
  pillarPositions.push([px, pz]);

  const pillarGeo = new BoxGeometry(0.06, 4.5, 0.06);
  const pillarMat = new MeshStandardMaterial({
    color: new Color('#0a1228'),
    emissive: new Color('#0a1228'),
    emissiveIntensity: 0.2,
    metalness: 0.95,
    roughness: 0.15,
  });
  const pillar = new Mesh(pillarGeo, pillarMat);
  pillar.position.set(px, 2.25, pz);
  world.scene.add(pillar);

  // Neon edge trim
  const edgeGeo = new EdgesGeometry(pillarGeo);
  const edgeMat = new LineBasicMaterial({
    color: new Color(i % 2 === 0 ? '#00ffff' : '#ff00ff'),
    transparent: true,
    opacity: 0.25,
  });
  const edges = new LineSegments(edgeGeo, edgeMat);
  edges.position.copy(pillar.position);
  world.scene.add(edges);

  // Pillar cap glow
  const capGeo = new BoxGeometry(0.12, 0.02, 0.12);
  const capMat = new MeshStandardMaterial({
    color: new Color(i % 2 === 0 ? '#00ccff' : '#cc00ff'),
    emissive: new Color(i % 2 === 0 ? '#00ccff' : '#cc00ff'),
    emissiveIntensity: 0.8,
    transparent: true,
    opacity: 0.5,
    metalness: 0.3,
    roughness: 0.5,
  });
  const cap = new Mesh(capGeo, capMat);
  cap.position.set(px, 4.5, pz);
  world.scene.add(cap);
}

// === Ceiling frame (holodeck feel) ===
const ceilHeight = 4.6;
const ceilSpan = 5;
// Horizontal ceiling beams
for (let i = -1; i <= 1; i += 2) {
  const beamGeo = new BoxGeometry(ceilSpan * 2, 0.03, 0.03);
  const beamMat = new MeshStandardMaterial({
    color: new Color('#0a1228'),
    emissive: new Color('#112244'),
    emissiveIntensity: 0.3,
    metalness: 0.9,
    roughness: 0.2,
  });
  const beam = new Mesh(beamGeo, beamMat);
  beam.position.set(0, ceilHeight, i * ceilSpan - 2);
  world.scene.add(beam);
}
for (let i = -1; i <= 1; i += 2) {
  const beamGeo = new BoxGeometry(0.03, 0.03, ceilSpan * 2);
  const beamMat = new MeshStandardMaterial({
    color: new Color('#0a1228'),
    emissive: new Color('#112244'),
    emissiveIntensity: 0.3,
    metalness: 0.9,
    roughness: 0.2,
  });
  const beam = new Mesh(beamGeo, beamMat);
  beam.position.set(i * ceilSpan, ceilHeight, -2);
  world.scene.add(beam);
}

// === Ceiling light strips (holodeck recessed lighting) ===
const ceilLightMats: MeshStandardMaterial[] = [];
for (let i = 0; i < 4; i++) {
  const angle = (i / 4) * Math.PI * 2;
  const stripLen = 3;
  const stripGeo = new BoxGeometry(stripLen, 0.015, 0.04);
  const stripMat = new MeshStandardMaterial({
    color: new Color('#00ccff'),
    emissive: new Color('#00ccff'),
    emissiveIntensity: 0.4,
    transparent: true,
    opacity: 0.3,
    metalness: 0,
    roughness: 1,
  });
  const strip = new Mesh(stripGeo, stripMat);
  const cx = Math.cos(angle) * 2.5;
  const cz = Math.sin(angle) * 2.5 - 2;
  strip.position.set(cx, ceilHeight - 0.02, cz);
  strip.rotation.y = angle + Math.PI / 2;
  world.scene.add(strip);
  ceilLightMats.push(stripMat);
}

// === Theme Helpers ===
function applyTheme(colorIdx: number) {
  const keys: ColorScheme[] = ['cyan', 'green', 'magenta', 'gold'];
  const scheme = COLOR_SCHEMES[keys[colorIdx]];
  const pc = new Color(scheme.p1);
  const ac = new Color(scheme.p2);
  l1.color.copy(pc);
  l2.color.copy(ac);
  gameLight.color.set(scheme.accent);
  // Update ceiling light strips to match theme
  const accentColor = new Color(scheme.accent);
  for (const mat of ceilLightMats) {
    mat.color.copy(accentColor);
    mat.emissive.copy(accentColor);
  }
  // Update floor glow pool
  poolMat.color.copy(accentColor);
  poolMat.emissive.copy(accentColor);
}

// === Difficulty atmosphere adjustment ===
function applyDifficultyAtmosphere(difficulty: string) {
  // Subtle environmental differences per difficulty
  if (difficulty === 'easy') {
    ambient.intensity = 0.5;
    l3.intensity = 1.2;
    if (world.scene.fog) (world.scene.fog as Fog).near = 7;
  } else if (difficulty === 'hard') {
    ambient.intensity = 0.3;
    l3.intensity = 0.7;
    if (world.scene.fog) (world.scene.fog as Fog).near = 4;
  } else {
    // medium/default
    ambient.intensity = 0.4;
    l3.intensity = 1.0;
    if (world.scene.fog) (world.scene.fog as Fog).near = 6;
  }
}

// === Panel Entities ===
const pY = 1.4, pZ = -2.0;
const panelDefs: { key: string; config: string; pos: [number, number, number]; show: boolean }[] = [
  { key: 'menu',     config: './ui/menu.json',     pos: [0, pY, pZ],       show: true },
  { key: 'hud',      config: './ui/hud.json',      pos: [0, 2.1, -1.8],    show: false },
  { key: 'results',  config: './ui/results.json',  pos: [0, pY, pZ],       show: false },
  { key: 'settings', config: './ui/settings.json', pos: [0, pY, pZ],       show: false },
  { key: 'pause',    config: './ui/pause.json',    pos: [0, pY, pZ],       show: false },
  { key: 'achpanel', config: './ui/achpanel.json', pos: [0, pY, pZ],       show: false },
  { key: 'tutorial', config: './ui/tutorial.json', pos: [0, pY, pZ],       show: false },
  { key: 'stats',    config: './ui/stats.json',    pos: [0, pY, pZ],       show: false },
];

const panelEntities: Record<string, any> = {};
const panelPositions: Record<string, [number, number, number]> = {};

for (const pd of panelDefs) {
  const grp = new Group();
  grp.position.set(pd.pos[0], pd.show ? pd.pos[1] : -50, pd.pos[2]);
  grp.scale.set(1.4, 1.4, 1.4);
  const entity = world.createTransformEntity(grp);
  entity.addComponent(PanelUI, { config: pd.config });
  panelEntities[pd.key] = entity;
  panelPositions[pd.key] = pd.pos;
}

// === Dynamic light system - follows active game row + ceiling pulse + timer bar + mood ===
class GameLightSystem extends createSystem({}) {
  private gameRef: GameSystem | null = null;
  private ceilPulseTimer = 0;
  private ceilPulseIntensity = 0;

  // Achievement toast state
  private toastTimer = 0;
  private toastMesh: Mesh | null = null;
  private toastBgMesh: Mesh | null = null;

  // Environment mood
  private moodProgress = 0; // smoothed game progress

  init() {
    this.gameRef = this.world.getSystem(GameSystem) as unknown as GameSystem;
  }

  // Trigger a ceiling light pulse (called on game events)
  triggerCeilPulse() {
    this.ceilPulseIntensity = 1.0;
  }

  // Show achievement toast
  showAchievementToast() {
    this.toastTimer = 3.0;

    // Create toast glow effect at board position
    if (!this.toastMesh) {
      const geo = new SphereGeometry(0.04, 12, 12);
      const mat = new MeshStandardMaterial({
        color: new Color('#ffcc00'),
        emissive: new Color('#ffcc00'),
        emissiveIntensity: 2.0,
        transparent: true,
        opacity: 0,
      });
      this.toastMesh = new Mesh(geo, mat);
      this.toastMesh.position.set(0, 2.5, -1.8);
      this.world.scene.add(this.toastMesh);

      // Toast background glow
      const bgGeo = new SphereGeometry(0.12, 12, 12);
      const bgMat = new MeshStandardMaterial({
        color: new Color('#ffaa00'),
        emissive: new Color('#ffaa00'),
        emissiveIntensity: 0.6,
        transparent: true,
        opacity: 0,
      });
      this.toastBgMesh = new Mesh(bgGeo, bgMat);
      this.toastBgMesh.position.set(0, 2.5, -1.8);
      this.world.scene.add(this.toastBgMesh);
    }
  }

  update(delta: number) {
    if (!this.gameRef) return;
    if (!this.gameRef.isGameOver && this.gameRef.currentGuessRow < this.gameRef.getMaxGuesses()) {
      const rowY = this.gameRef.BOARD_Y + this.gameRef.currentGuessRow * this.gameRef.ROW_SPACING + 0.1;
      // Smoothly move game light to follow active row
      const targetY = rowY + 0.3;
      gameLight.position.y += (targetY - gameLight.position.y) * 0.05;
      gameLight.intensity = 0.6 + Math.sin(performance.now() * 0.002) * 0.1;
    } else {
      gameLight.intensity = 0.3;
    }

    // Ceiling light strips pulse
    this.ceilPulseIntensity = Math.max(0, this.ceilPulseIntensity - delta * 2);
    const basePulse = 0.25 + Math.sin(performance.now() * 0.0008) * 0.1;
    for (const mat of ceilLightMats) {
      mat.emissiveIntensity = 0.4 + this.ceilPulseIntensity * 0.8;
      mat.opacity = basePulse + this.ceilPulseIntensity * 0.3;
    }

    // === Speed mode timer bar ===
    const isSpeedMode = this.gameRef.gameMode === 'speed' && !this.gameRef.isGameOver;
    timerBarMesh.visible = isSpeedMode;
    timerBgMesh.visible = isSpeedMode;
    timerEdgeMesh.visible = isSpeedMode;

    if (isSpeedMode) {
      const danger = this.gameRef.getSpeedDanger();
      const remainRatio = 1 - danger;

      // Scale bar width based on remaining time
      timerBarMesh.scale.x = Math.max(0.01, remainRatio);
      // Shift position to keep left-aligned
      timerBarMesh.position.x = -(timerBarWidth * (1 - remainRatio)) / 2;

      // Color transition: cyan -> yellow -> red based on danger
      let barColor: Color;
      if (danger < 0.5) {
        // Cyan to yellow
        const t = danger * 2;
        barColor = new Color('#00ffcc').lerp(new Color('#ffcc00'), t);
      } else {
        // Yellow to red
        const t = (danger - 0.5) * 2;
        barColor = new Color('#ffcc00').lerp(new Color('#ff2244'), t);
      }
      timerBarMat.color.copy(barColor);
      timerBarMat.emissive.copy(barColor);

      // Pulse faster as time runs out
      const pulseSpeed = 2 + danger * 8;
      const pulse = 0.5 + Math.sin(performance.now() * 0.001 * pulseSpeed) * 0.3;
      timerBarMat.emissiveIntensity = 0.8 + danger * 1.2;
      timerBarMat.opacity = 0.5 + pulse * 0.3 + danger * 0.2;

      // Edge glow intensifies with urgency
      timerEdgeMat.color.copy(barColor);
      timerEdgeMat.opacity = 0.3 + danger * 0.5;
    }

    // === Achievement toast ===
    if (this.toastTimer > 0) {
      this.toastTimer -= delta;
      if (this.toastMesh && this.toastBgMesh) {
        const toastMat = this.toastMesh.material as MeshStandardMaterial;
        const bgMat = this.toastBgMesh.material as MeshStandardMaterial;

        if (this.toastTimer > 2.5) {
          // Fade in
          const fadeIn = (3.0 - this.toastTimer) * 2;
          toastMat.opacity = fadeIn * 0.9;
          bgMat.opacity = fadeIn * 0.3;
          const scale = 0.5 + fadeIn * 0.5;
          this.toastMesh.scale.set(scale, scale, scale);
          this.toastBgMesh.scale.set(scale * 0.8, scale * 0.8, scale * 0.8);
        } else if (this.toastTimer > 0.5) {
          // Hold with pulse
          const pulse = 0.8 + Math.sin(performance.now() * 0.005) * 0.2;
          toastMat.opacity = pulse;
          bgMat.opacity = 0.25;
          toastMat.emissiveIntensity = 1.5 + Math.sin(performance.now() * 0.003) * 0.8;
        } else {
          // Fade out
          const fadeOut = this.toastTimer * 2;
          toastMat.opacity = fadeOut * 0.9;
          bgMat.opacity = fadeOut * 0.25;
        }
      }
    } else if (this.toastMesh) {
      (this.toastMesh.material as MeshStandardMaterial).opacity = 0;
      (this.toastBgMesh!.material as MeshStandardMaterial).opacity = 0;
    }

    // === Environment mood progression ===
    if (!this.gameRef.isGameOver) {
      const targetProgress = this.gameRef.getProgressRatio();
      this.moodProgress += (targetProgress - this.moodProgress) * delta * 0.5;

      // Ambient light brightens as player gets closer to solving
      const moodAmbient = 0.35 + this.moodProgress * 0.25;
      ambient.intensity += (moodAmbient - ambient.intensity) * delta * 0.3;

      // Fog pulls back as progress increases
      if (world.scene.fog) {
        const fogNear = 5 + this.moodProgress * 3;
        (world.scene.fog as Fog).near += (fogNear - (world.scene.fog as Fog).near) * delta * 0.3;
      }

      // Floor pool glow intensifies with progress
      const poolOpacity = 0.06 + this.moodProgress * 0.12;
      poolMat.opacity += (poolOpacity - poolMat.opacity) * delta * 0.5;
      poolMat.emissiveIntensity = 0.15 + this.moodProgress * 0.3;
    }
  }
}

// === Register Systems ===
world.registerSystem(GameSystem);
world.registerSystem(UISystem);
world.registerSystem(AudioSystem);
world.registerSystem(EffectsSystem);
world.registerSystem(BoardEffectsSystem);
world.registerSystem(AmbientMusicSystem);
world.registerSystem(GameLightSystem);

// === Wire Up ===
const game = world.getSystem(GameSystem) as unknown as GameSystem;
const ui = world.getSystem(UISystem) as unknown as UISystem;
const audio = world.getSystem(AudioSystem) as unknown as AudioSystem;
const effects = world.getSystem(EffectsSystem) as unknown as EffectsSystem;
const boardEffects = world.getSystem(BoardEffectsSystem) as unknown as BoardEffectsSystem;
const ambientMusic = world.getSystem(AmbientMusicSystem) as unknown as AmbientMusicSystem;
const gameLightSys = world.getSystem(GameLightSystem) as unknown as GameLightSystem;

// Wire board effects callbacks
game.onBoardBuilt = (boardGroup, bbW, bbH, bbCenterY) => {
  boardEffects.clearEffects();
  boardEffects.setupBorderEffect(boardGroup, bbW, bbH, bbCenterY);
};
game.onRowCompleted = (boardGroup, rowY, markerX, rowIdx) => {
  boardEffects.addRowCheckmark(boardGroup, rowY, markerX, rowIdx);
  gameLightSys.triggerCeilPulse();
};

ui.setRefs({
  game,
  audio,
  effects,
  ambientMusic,
  panels: panelEntities,
  positions: panelPositions,
  onThemeChange: applyTheme,
  onDifficultyChange: applyDifficultyAtmosphere,
  onAchievementToast: () => gameLightSys.showAchievementToast(),
});
