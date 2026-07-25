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
  BoxGeometry,
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

// Board shake state
interface ShakeState {
  timer: number;
  intensity: number;
  frequency: number;
  offsetX: number;
  offsetY: number;
}

// Victory cascade glow
interface CascadeGlow {
  row: number;
  timer: number;
  delay: number;
  started: boolean;
}

// Defeat dimming state
interface DefeatDimState {
  active: boolean;
  timer: number;
  sagOffset: number;
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

  // Board shake
  private shake: ShakeState = { timer: 0, intensity: 0, frequency: 0, offsetX: 0, offsetY: 0 };
  private boardBaseX = 0;
  private boardBaseY = 1.0;

  // Victory cascade — sequential row illumination
  private cascadeGlows: CascadeGlow[] = [];
  private victorySweepTimer = 0;
  private victorySweepActive = false;
  private victoryGlowBar: Mesh | null = null;

  // Defeat dimming
  private defeatDim: DefeatDimState = { active: false, timer: 0, sagOffset: 0 };

  init() {
    this.gameRef = this.world.getSystem(GameSystem) as unknown as GameSystem;
  }

  // Called when game starts to set up border effects
  setupBorderEffect(boardGroup: Group, bbW: number, bbH: number, bbCenterY: number) {
    this.boardBaseX = boardGroup.position.x;
    this.boardBaseY = boardGroup.position.y;

    // Reset effect states on new game
    this.shake = { timer: 0, intensity: 0, frequency: 0, offsetX: 0, offsetY: 0 };
    this.cascadeGlows = [];
    this.victorySweepActive = false;
    this.victorySweepTimer = 0;
    this.defeatDim = { active: false, timer: 0, sagOffset: 0 };
    if (this.victoryGlowBar) {
      this.world.scene.remove(this.victoryGlowBar);
      this.victoryGlowBar = null;
    }

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

  // Trigger board shake on submission
  triggerShake(intensity: number = 0.008, duration: number = 0.25, frequency: number = 30) {
    this.shake.timer = duration;
    this.shake.intensity = intensity;
    this.shake.frequency = frequency;
  }

  // Trigger victory cascade — sequentially illuminate all completed rows
  triggerVictoryCascade() {
    if (!this.gameRef) return;
    this.cascadeGlows = [];
    this.victorySweepActive = true;
    this.victorySweepTimer = 0;

    const numRows = this.gameRef.currentGuessRow + 1;
    for (let r = 0; r < numRows; r++) {
      this.cascadeGlows.push({
        row: r,
        timer: 0,
        delay: r * 0.08,
        started: false,
      });
    }

    // Create a sweeping glow bar behind the board
    const barGeo = new BoxGeometry(2.5, 0.04, 0.02);
    const barMat = new MeshStandardMaterial({
      color: new Color('#00ff88'),
      emissive: new Color('#00ff88'),
      emissiveIntensity: 2.0,
      transparent: true,
      opacity: 0,
      blending: AdditiveBlending,
    });
    this.victoryGlowBar = new Mesh(barGeo, barMat);
    this.victoryGlowBar.position.set(0, this.gameRef.BOARD_Y + 0.1, -1.99);
    this.world.scene.add(this.victoryGlowBar);
  }

  // Trigger defeat dimming sequence
  triggerDefeatSequence() {
    this.defeatDim = { active: true, timer: 0, sagOffset: 0 };
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

    if (this.victoryGlowBar) {
      this.world.scene.remove(this.victoryGlowBar);
      this.victoryGlowBar = null;
    }

    this.cascadeGlows = [];
    this.victorySweepActive = false;
    this.defeatDim = { active: false, timer: 0, sagOffset: 0 };
    this.shake = { timer: 0, intensity: 0, frequency: 0, offsetX: 0, offsetY: 0 };

    this.prevRow = 0;
    this.prevGameOver = false;
    this.prevIsWin = false;
  }

  // Get the ideal camera Y for the current game state
  getIdealCameraY(): number {
    if (!this.gameRef) return 1.6;
    if (this.gameRef.getMaxGuesses() <= 10) return 1.6;
    const activeRowY = this.gameRef.BOARD_Y + this.gameRef.currentGuessRow * this.gameRef.ROW_SPACING;
    return Math.max(1.6, activeRowY + 0.3);
  }

  update(delta: number) {
    if (!this.gameRef) return;

    // Detect row change → submission flash + shake
    if (this.gameRef.currentGuessRow !== this.prevRow && !this.gameRef.isGameOver && this.prevRow < this.gameRef.currentGuessRow) {
      const flashY = this.gameRef.BOARD_Y + (this.gameRef.currentGuessRow - 1) * this.gameRef.ROW_SPACING + 0.1;
      this.triggerSubmitFlash(flashY);
      // Shake intensity scales with progress toward the solution
      const progress = this.gameRef.getProgressRatio();
      const shakeIntensity = 0.004 + progress * 0.012;
      this.triggerShake(shakeIntensity, 0.2 + progress * 0.1, 25 + progress * 15);
    }
    this.prevRow = this.gameRef.currentGuessRow;

    // Detect victory
    if (this.gameRef.isGameOver && this.gameRef.isWin && !this.prevIsWin) {
      this.triggerVictoryRings();
      this.triggerVictoryCascade();
      this.triggerShake(0.015, 0.4, 20);
    }

    // Detect defeat
    if (this.gameRef.isGameOver && !this.gameRef.isWin && !this.prevGameOver) {
      this.triggerDefeatSequence();
    }

    this.prevIsWin = this.gameRef.isWin;
    this.prevGameOver = this.gameRef.isGameOver;

    // === Board shake ===
    if (this.shake.timer > 0) {
      this.shake.timer -= delta;
      const decay = Math.max(0, this.shake.timer / 0.3);
      const t = performance.now() * 0.001 * this.shake.frequency;
      this.shake.offsetX = Math.sin(t * 6.28) * this.shake.intensity * decay;
      this.shake.offsetY = Math.cos(t * 4.17) * this.shake.intensity * decay * 0.7;

      if (this.gameRef.boardGroup) {
        this.gameRef.boardGroup.position.x = this.boardBaseX + this.shake.offsetX;
        if (!this.defeatDim.active) {
          this.gameRef.boardGroup.position.y = this.boardBaseY + this.shake.offsetY;
        }
      }
    } else if (this.shake.offsetX !== 0 || this.shake.offsetY !== 0) {
      this.shake.offsetX = 0;
      this.shake.offsetY = 0;
      if (this.gameRef.boardGroup && !this.defeatDim.active) {
        this.gameRef.boardGroup.position.x = this.boardBaseX;
        this.gameRef.boardGroup.position.y = this.boardBaseY;
      }
    }

    // === Defeat dimming + sag ===
    if (this.defeatDim.active) {
      this.defeatDim.timer += delta;
      const dt = Math.min(1, this.defeatDim.timer * 0.8);
      // Board sags down slightly
      const targetSag = -0.04;
      this.defeatDim.sagOffset += (targetSag - this.defeatDim.sagOffset) * delta * 2;
      if (this.gameRef.boardGroup) {
        this.gameRef.boardGroup.position.y = this.boardBaseY + this.defeatDim.sagOffset;
      }
      // Dim all row glow meshes to red
      for (let r = 0; r < this.gameRef.rowGlowMeshes.length; r++) {
        const glow = this.gameRef.rowGlowMeshes[r];
        const mat = glow.material as MeshStandardMaterial;
        mat.color.lerp(new Color('#ff2244'), delta * 1.5);
        mat.emissive.lerp(new Color('#ff2244'), delta * 1.5);
        mat.emissiveIntensity = 0.1 + (1 - dt) * 0.2;
        mat.opacity = 0.03 + (1 - dt) * 0.05;
      }
      // Border goes red and dims
      if (this.borderLines) {
        const bmat = this.borderLines.material as LineBasicMaterial;
        bmat.color.lerp(new Color('#ff2244'), delta * 2);
        bmat.opacity = 0.15 + Math.sin(performance.now() * 0.003) * 0.05;
      }
    }

    // === Victory cascade — sequential row illumination ===
    if (this.victorySweepActive) {
      this.victorySweepTimer += delta;
      let allDone = true;
      for (const cg of this.cascadeGlows) {
        if (this.victorySweepTimer < cg.delay) { allDone = false; continue; }
        if (!cg.started) cg.started = true;
        cg.timer += delta;
        if (cg.row < this.gameRef.rowGlowMeshes.length) {
          const glow = this.gameRef.rowGlowMeshes[cg.row];
          const mat = glow.material as MeshStandardMaterial;
          const ct = Math.min(1, cg.timer * 3);
          if (ct < 0.5) {
            const flash = ct * 2;
            mat.color.set('#00ff88');
            mat.emissive.set('#00ff88');
            mat.emissiveIntensity = flash * 1.5;
            mat.opacity = flash * 0.3;
          } else {
            const settle = (ct - 0.5) * 2;
            mat.color.lerp(new Color('#ffcc00'), settle * 0.5);
            mat.emissive.lerp(new Color('#ffcc00'), settle * 0.5);
            mat.emissiveIntensity = 1.5 - settle * 1.0;
            mat.opacity = 0.3 - settle * 0.15;
          }
        }
        if (cg.timer < 1.0) allDone = false;
      }
      // Sweep glow bar upward
      if (this.victoryGlowBar && this.cascadeGlows.length > 0) {
        const sweepProgress = Math.min(1, this.victorySweepTimer / (this.cascadeGlows.length * 0.08 + 0.5));
        const sweepY = this.gameRef.BOARD_Y + 0.1 + sweepProgress * (this.gameRef.currentGuessRow * this.gameRef.ROW_SPACING + 0.3);
        this.victoryGlowBar.position.y = sweepY;
        const barMat = this.victoryGlowBar.material as MeshStandardMaterial;
        if (sweepProgress < 0.9) {
          barMat.opacity = 0.4 + Math.sin(performance.now() * 0.008) * 0.15;
        } else {
          barMat.opacity *= 0.95;
        }
      }
      // Border goes gold during victory
      if (this.borderLines) {
        const bmat = this.borderLines.material as LineBasicMaterial;
        bmat.color.lerp(new Color('#ffcc00'), delta * 3);
        bmat.opacity = 0.6 + Math.sin(performance.now() * 0.005) * 0.2;
      }
      if (allDone) this.victorySweepActive = false;
    }

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
      if (rc.animTimer >= 1) {
        const pulse = 0.6 + Math.sin(performance.now() * 0.002 + rc.row) * 0.2;
        (rc.mesh.material as MeshStandardMaterial).opacity = pulse;
      }
    }

    // Pulsing neon border (normal state, not victory/defeat)
    if (this.borderLines && !this.victorySweepActive && !this.defeatDim.active) {
      this.borderPulsePhase += delta * 2;
      this.borderIntensity += (this.borderTargetIntensity - this.borderIntensity) * delta * 3;
      if (Math.abs(this.borderIntensity - this.borderTargetIntensity) < 0.01) {
        this.borderTargetIntensity = 0.3;
      }
      const pulse = this.borderIntensity * (0.7 + Math.sin(this.borderPulsePhase) * 0.3);
      const mat = this.borderLines.material as LineBasicMaterial;
      mat.opacity = pulse;
      const scheme = COLOR_SCHEMES[this.gameRef.colorScheme];
      mat.color.set(scheme.accent);
    }
  }
}
