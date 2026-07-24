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
} from '@iwsdk/core';
import { GameSystem, COLOR_SCHEMES, type ColorScheme } from './game-system.js';
import { UISystem } from './ui-system.js';
import { AudioSystem } from './audio-system.js';
import { EffectsSystem } from './effects-system.js';

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
const grid = new GridHelper(12, 24, 0x112244, 0x0a1122);
grid.position.y = 0.02;
world.scene.add(grid);

// === Fog ===
world.scene.fog = new Fog(0x000011, 5, 18);

// === Pillars ===
for (let i = 0; i < 4; i++) {
  const angle = (i / 4) * Math.PI * 2 + Math.PI / 4;
  const px = Math.cos(angle) * 4;
  const pz = Math.sin(angle) * 4 - 2;
  const pillarGeo = new BoxGeometry(0.08, 4, 0.08);
  const pillarMat = new MeshStandardMaterial({
    color: new Color('#112244'),
    emissive: new Color('#112244'),
    emissiveIntensity: 0.3,
    metalness: 0.9,
    roughness: 0.2,
  });
  const pillar = new Mesh(pillarGeo, pillarMat);
  pillar.position.set(px, 2, pz);
  world.scene.add(pillar);
}

// === Theme Helpers ===
function applyTheme(colorIdx: number) {
  const keys: ColorScheme[] = ['cyan', 'green', 'magenta', 'gold'];
  const scheme = COLOR_SCHEMES[keys[colorIdx]];
  const pc = new Color(scheme.p1);
  const ac = new Color(scheme.p2);
  l1.color.copy(pc);
  l2.color.copy(ac);
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

// === Register Systems ===
world.registerSystem(GameSystem);
world.registerSystem(UISystem);
world.registerSystem(AudioSystem);
world.registerSystem(EffectsSystem);

// === Wire Up ===
const game = world.getSystem(GameSystem) as unknown as GameSystem;
const ui = world.getSystem(UISystem) as unknown as UISystem;
const audio = world.getSystem(AudioSystem) as unknown as AudioSystem;
const effects = world.getSystem(EffectsSystem) as unknown as EffectsSystem;

ui.setRefs({
  game,
  audio,
  effects,
  panels: panelEntities,
  positions: panelPositions,
  onThemeChange: applyTheme,
});
