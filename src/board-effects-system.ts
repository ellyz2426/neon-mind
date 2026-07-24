import {
  createSystem,
  Mesh,
  SphereGeometry,
  MeshStandardMaterial,
  Color,
  Group,
  LineSegments,
  BufferGeometry,
  Float32BufferAttribute,
  LineBasicMaterial,
  RingGeometry,
  DoubleSide,
  AdditiveBlending,
} from '@iwsdk/core';
import { GameSystem, COLOR_SCHEMES } from './game-system.js';

// Submission flash ring that expands outward from the board
interface FlashRing {
  mesh: Mesh;
  life: number;
  maxLife: number;
  baseY: number;
}

// Victory ring concentric expansion
interface VictoryRing {
  mesh: Mesh;
  life: number;
  maxLife: number;
  delay: number;
  started: boolean;
}

// Row completion checkmark indicator
interface RowCheckmark {
  mesh: Mesh;
  row: number;
  animTimer: number;
}

export class BoardEffectsSystem extends createSystem({}) {
  private gameRef: GameSystem | null = null;
  private flashRings: FlashRing[] = [];
  private victoryRings: VictoryRing[] = [];
  private rowCheckmarks: RowCheckmark[] = [];
  private prevRow = 0;
  private prevGameOver = false;
  private prevIsWin = false;

  // Neon border pulse on the backboard
  private borderLines: LineSegments | null = null;
  private borderPulsePhase = 0;
  private borderIntensity = 0.3;
  private borderTargetIntensity = 0.3;

  // Board vertical position tracking for camera follow
  private boardCameraTarget = 1.6;
  private lastCameraY = 1.6;

  init() {
    this.gameRef = this.world.getSystem(GameSystem) as unknown as GameSystem;
  }

  // Called when game starts to set up border effects
  setupBorderEffect(boardGroup: Group, bbW: number, bbH: number, bbCenterY: number) {
    // Create a pulsing neon border around the backboard
    const halfW = bbW / 2;
    const halfH = bbH / 2;
    const z = -0.015;

    const pts = new Float32Array([
      -halfW, bbCenterY - halfH, z,   halfW, bbCenterY - halfH, z,
       halfW, bbCenterY - halfH, z,   halfW, bbCenterY + halfH, z,
       halfW, bbCenterY + halfH, z,  -halfW, bbCenterY + halfH, z,
      -halfW, bbCenterY + halfH, z,  -halfW, bbCenterY - halfH, z,
    ]);

    const geo = new BufferGeometry();
    geo.setAttribute('position', new Float32BufferAttribute(pts, 3));

    const mat = new LineBasicMaterial({
      color: new Color('#00ffff'),
      transparent: true,
      opacity: 0.3,
    });

    if (this.borderLines) {
      boardGroup.remove(this.borderLines);
    }
    this.borderLines = new LineSegments(geo, mat);
    boardGroup.add(this.borderLines);
  }

  // Trigger a submission flash effect
  triggerSubmitFlash(y: number) {
    const ringGeo = new RingGeometry(0.05, 0.12, 32);
    const ringMat = new MeshStandardMaterial({
      color: new Color('#00ffff'),
      emissive: new Color('#00ffff'),
      emissiveIntensity: 1.5,
      transparent: true,
      opacity: 0.8,
      side: DoubleSide,
      blending: AdditiveBlending,
    });
    const ring = new Mesh(ringGeo, ringMat);
    ring.position.set(0, y, -1.98);
    ring.rotation.x = 0;
    this.world.scene.add(ring);

    this.flashRings.push({
      mesh: ring,
      life: 0.6,
      maxLife: 0.6,
      baseY: y,
    });

    // Pulse the border brighter on submission
    this.borderTargetIntensity = 1.0;
  }

  // Trigger victory expanding rings
  triggerVictoryRings() {
    const boardZ = -2.0;
    const boardY = this.gameRef ? this.gameRef.BOARD_Y + this.gameRef.currentGuessRow * this.gameRef.ROW_SPACING : 1.5;

    for (let i = 0; i < 5; i++) {
      const ringGeo = new RingGeometry(0.1, 0.15, 48);
      const hue = i * 0.15;
      const color = new Color().setHSL(hue, 1, 0.7);
      const ringMat = new MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 2.0,
        transparent: true,
        opacity: 0.9,
        side: DoubleSide,
        blending: AdditiveBlending,
      });
      const ring = new Mesh(ringGeo, ringMat);
      ring.position.set(0, boardY, boardZ + 0.05);
      ring.rotation.x = 0;
      ring.scale.set(0, 0, 0);
      this.world.scene.add(ring);

      this.victoryRings.push({
        mesh: ring,
        life: 2.0,
        maxLife: 2.0,
        delay: i * 0.2,
        started: false,
      });
    }
  }

  // Add a checkmark indicator on a completed row
  addRowCheckmark(boardGroup: Group, rowY: number, x: number, row: number) {
    // Small glowing sphere as a "complete" indicator
    const geo = new SphereGeometry(0.02, 8, 8);
    const mat = new MeshStandardMaterial({
      color: new Color('#00ff88'),
      emissive: new Color('#00ff88'),
      emissiveIntensity: 1.0,
      transparent: true,
      opacity: 0,
    });
    const mesh = new Mesh(geo, mat);
    mesh.position.set(x, rowY, 0.03);
    mesh.scale.set(0, 0, 0);
    boardGroup.add(mesh);

    this.rowCheckmarks.push({ mesh, row, animTimer: 0 });
  }

  clearEffects() {
    for (const fr of this.flashRings) {
      this.world.scene.remove(fr.mesh);
    }
    this.flashRings = [];

    for (const vr of this.victoryRings) {
      this.world.scene.remove(vr.mesh);
    }
    this.victoryRings = [];

    for (const rc of this.rowCheckmarks) {
      // These are in boardGroup which gets cleared separately
    }
    this.rowCheckmarks = [];

    if (this.borderLines) {
      this.borderLines.parent?.remove(this.borderLines);
      this.borderLines = null;
    }

    this.prevRow = 0;
    this.prevGameOver = false;
    this.prevIsWin = false;
  }

  // Get the ideal camera Y for the current game state
  getIdealCameraY(): number {
    if (!this.gameRef) return 1.6;

    // For boards with <= 10 rows, default position is fine
    if (this.gameRef.getMaxGuesses() <= 10) return 1.6;

    // For tall boards, follow the active row
    const activeRowY = this.gameRef.BOARD_Y + this.gameRef.currentGuessRow * this.gameRef.ROW_SPACING;
    // Keep camera centered roughly on the active row area
    return Math.max(1.6, activeRowY + 0.3);
  }

  update(delta: number) {
    if (!this.gameRef) return;

    // Detect row change → submission flash
    if (this.gameRef.currentGuessRow !== this.prevRow && !this.gameRef.isGameOver && this.prevRow < this.gameRef.currentGuessRow) {
      const flashY = this.gameRef.BOARD_Y + (this.gameRef.currentGuessRow - 1) * this.gameRef.ROW_SPACING + 0.1;
      this.triggerSubmitFlash(flashY);
    }
    this.prevRow = this.gameRef.currentGuessRow;

    // Detect victory
    if (this.gameRef.isGameOver && this.gameRef.isWin && !this.prevIsWin) {
      this.triggerVictoryRings();
    }
    this.prevIsWin = this.gameRef.isWin;
    this.prevGameOver = this.gameRef.isGameOver;

    // Animate flash rings
    for (let i = this.flashRings.length - 1; i >= 0; i--) {
      const fr = this.flashRings[i];
      fr.life -= delta;
      if (fr.life <= 0) {
        this.world.scene.remove(fr.mesh);
        this.flashRings.splice(i, 1);
        continue;
      }
      const t = 1 - fr.life / fr.maxLife;
      const scale = 1 + t * 8;
      fr.mesh.scale.set(scale, scale, 1);
      const mat = fr.mesh.material as MeshStandardMaterial;
      mat.opacity = (1 - t) * 0.6;
      mat.emissiveIntensity = (1 - t) * 2;
    }

    // Animate victory rings
    for (let i = this.victoryRings.length - 1; i >= 0; i--) {
      const vr = this.victoryRings[i];
      if (vr.delay > 0) {
        vr.delay -= delta;
        continue;
      }
      if (!vr.started) {
        vr.started = true;
      }
      vr.life -= delta;
      if (vr.life <= 0) {
        this.world.scene.remove(vr.mesh);
        this.victoryRings.splice(i, 1);
        continue;
      }
      const t = 1 - vr.life / vr.maxLife;
      const scale = t * 12;
      vr.mesh.scale.set(scale, scale, 1);
      const mat = vr.mesh.material as MeshStandardMaterial;
      mat.opacity = (1 - t * t) * 0.7;
      mat.emissiveIntensity = (1 - t) * 2.5;
    }

    // Animate row checkmarks (fade in + scale up)
    for (const rc of this.rowCheckmarks) {
      if (rc.animTimer < 1) {
        rc.animTimer += delta * 3;
        const t = Math.min(1, rc.animTimer);
        const ease = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) * (-2 * t + 2) / 2;
        rc.mesh.scale.set(ease, ease, ease);
        (rc.mesh.material as MeshStandardMaterial).opacity = ease * 0.8;
      }
      // Subtle pulse on completed checkmarks
      if (rc.animTimer >= 1) {
        const pulse = 0.6 + Math.sin(performance.now() * 0.002 + rc.row) * 0.2;
        (rc.mesh.material as MeshStandardMaterial).opacity = pulse;
      }
    }

    // Pulsing neon border
    if (this.borderLines) {
      this.borderPulsePhase += delta * 2;
      // Ease border intensity back to resting level
      this.borderIntensity += (this.borderTargetIntensity - this.borderIntensity) * delta * 3;
      if (Math.abs(this.borderIntensity - this.borderTargetIntensity) < 0.01) {
        this.borderTargetIntensity = 0.3;
      }

      const pulse = this.borderIntensity * (0.7 + Math.sin(this.borderPulsePhase) * 0.3);
      const mat = this.borderLines.material as LineBasicMaterial;
      mat.opacity = pulse;

      // Color follows current scheme
      const scheme = COLOR_SCHEMES[this.gameRef.colorScheme];
      mat.color.set(scheme.accent);
    }
  }
}
