import {
  createSystem,
  Mesh,
  SphereGeometry,
  CylinderGeometry,
  MeshStandardMaterial,
  Color,
  Group,
  BoxGeometry,
  AdditiveBlending,
} from '@iwsdk/core';

interface ShootingStar {
  mesh: Mesh;
  trail: Mesh;
  vel: { x: number; y: number; z: number };
  life: number;
  maxLife: number;
}

interface GridWavePulse {
  center: { x: number; z: number };
  radius: number;
  speed: number;
  maxRadius: number;
  intensity: number;
  life: number;
}

interface FloorReactive {
  mesh: Mesh;
  baseEmissive: number;
  targetEmissive: number;
  baseX: number;
  baseZ: number;
}

export class EnvironmentSystem extends createSystem({}) {
  // Shooting stars
  private stars: ShootingStar[] = [];
  private starSpawnTimer = 0;
  private starSpawnInterval = 3 + Math.random() * 4; // 3-7 seconds

  // Grid wave pulses
  private wavePulses: GridWavePulse[] = [];

  // Reactive floor tiles
  private floorTiles: FloorReactive[] = [];
  private floorGroup!: Group;

  // Ambient haze pillars (volumetric light shafts)
  private hazeMeshes: Mesh[] = [];

  init() {
    this.floorGroup = new Group();
    this.world.scene.add(this.floorGroup);

    // Create reactive floor tile grid (sparse, for wave effect)
    const tileCount = 12;
    const spacing = 1.2;
    for (let xi = -tileCount / 2; xi < tileCount / 2; xi++) {
      for (let zi = -tileCount / 2; zi < tileCount / 2; zi++) {
        // Skip tiles too close to center (where board is)
        const dist = Math.sqrt((xi * spacing) ** 2 + ((zi * spacing) + 2) ** 2);
        if (dist < 1.5) continue;
        if (dist > 6) continue;

        // Only place a subset of tiles for performance
        if (Math.random() > 0.35) continue;

        const geo = new BoxGeometry(0.6, 0.003, 0.6);
        const mat = new MeshStandardMaterial({
          color: new Color('#0a1228'),
          emissive: new Color('#00aaff'),
          emissiveIntensity: 0,
          transparent: true,
          opacity: 0.04,
          metalness: 0.9,
          roughness: 0.2,
        });
        const tile = new Mesh(geo, mat);
        const tx = xi * spacing + (Math.random() - 0.5) * 0.3;
        const tz = zi * spacing - 2 + (Math.random() - 0.5) * 0.3;
        tile.position.set(tx, 0.025, tz);
        this.floorGroup.add(tile);

        this.floorTiles.push({
          mesh: tile,
          baseEmissive: 0,
          targetEmissive: 0,
          baseX: tx,
          baseZ: tz,
        });
      }
    }

    // Create volumetric light shafts (haze beams from ceiling)
    for (let i = 0; i < 3; i++) {
      const hazeGeo = new CylinderGeometry(0.15, 0.4, 4.5, 8, 1, true);
      const hazeMat = new MeshStandardMaterial({
        color: new Color(i === 0 ? '#00aaff' : i === 1 ? '#aa00ff' : '#00ffaa'),
        emissive: new Color(i === 0 ? '#00aaff' : i === 1 ? '#aa00ff' : '#00ffaa'),
        emissiveIntensity: 0.15,
        transparent: true,
        opacity: 0.02,
        blending: AdditiveBlending,
        side: 2, // DoubleSide value
      });
      const haze = new Mesh(hazeGeo, hazeMat);
      const angle = (i / 3) * Math.PI * 2 + Math.PI / 4;
      haze.position.set(
        Math.cos(angle) * 3.5,
        2.3,
        Math.sin(angle) * 3.5 - 2,
      );
      haze.rotation.x = (Math.random() - 0.5) * 0.1;
      haze.rotation.z = (Math.random() - 0.5) * 0.1;
      this.world.scene.add(haze);
      this.hazeMeshes.push(haze);
    }
  }

  // Trigger a grid wave pulse from a position
  triggerWave(x: number, z: number, intensity: number = 1.0) {
    this.wavePulses.push({
      center: { x, z },
      radius: 0,
      speed: 4.0,
      maxRadius: 8,
      intensity,
      life: 1.0,
    });
  }

  // Trigger a wave on guess submission (called from index.ts)
  triggerSubmitWave() {
    this.triggerWave(0, -2, 0.8);
  }

  // Trigger victory wave burst
  triggerVictoryWave() {
    this.triggerWave(0, -2, 1.5);
    // Secondary delayed ripple
    setTimeout(() => this.triggerWave(0, -2, 1.0), 300);
  }

  // Trigger defeat wave (dimmer, slower)
  triggerDefeatWave() {
    this.wavePulses.push({
      center: { x: 0, z: -2 },
      radius: 0,
      speed: 2.0,
      maxRadius: 6,
      intensity: 0.4,
      life: 1.0,
    });
  }

  // Update theme color for floor tiles and haze
  setThemeColor(color: string) {
    const c = new Color(color);
    for (const tile of this.floorTiles) {
      (tile.mesh.material as MeshStandardMaterial).emissive.copy(c);
    }
  }

  update(delta: number) {
    const now = performance.now() * 0.001;

    // === Shooting star spawning ===
    this.starSpawnTimer += delta;
    if (this.starSpawnTimer >= this.starSpawnInterval) {
      this.starSpawnTimer = 0;
      this.starSpawnInterval = 3 + Math.random() * 5;
      this.spawnShootingStar();
    }

    // === Update shooting stars ===
    for (let i = this.stars.length - 1; i >= 0; i--) {
      const star = this.stars[i];
      star.life -= delta;
      if (star.life <= 0) {
        this.world.scene.remove(star.mesh);
        this.world.scene.remove(star.trail);
        this.stars.splice(i, 1);
        continue;
      }

      star.mesh.position.x += star.vel.x * delta;
      star.mesh.position.y += star.vel.y * delta;
      star.mesh.position.z += star.vel.z * delta;

      // Trail follows slightly behind
      star.trail.position.x = star.mesh.position.x - star.vel.x * 0.08;
      star.trail.position.y = star.mesh.position.y - star.vel.y * 0.08;
      star.trail.position.z = star.mesh.position.z - star.vel.z * 0.08;

      const t = star.life / star.maxLife;
      const fade = t < 0.3 ? t / 0.3 : (t > 0.8 ? (1 - t) / 0.2 : 1);
      (star.mesh.material as MeshStandardMaterial).opacity = fade * 0.8;
      (star.trail.material as MeshStandardMaterial).opacity = fade * 0.3;

      // Shrink trail as it dies
      const trailScale = 0.3 + t * 0.7;
      star.trail.scale.set(trailScale, 1, trailScale);
    }

    // === Update grid wave pulses ===
    for (let i = this.wavePulses.length - 1; i >= 0; i--) {
      const wave = this.wavePulses[i];
      wave.radius += wave.speed * delta;
      wave.life -= delta * 0.5;

      if (wave.radius > wave.maxRadius || wave.life <= 0) {
        this.wavePulses.splice(i, 1);
        continue;
      }
    }

    // === Update reactive floor tiles ===
    for (const tile of this.floorTiles) {
      let waveEffect = 0;

      // Calculate wave influence from all active pulses
      for (const wave of this.wavePulses) {
        const dx = tile.baseX - wave.center.x;
        const dz = tile.baseZ - wave.center.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        const waveFront = wave.radius;
        const waveWidth = 1.5;
        const distFromWave = Math.abs(dist - waveFront);

        if (distFromWave < waveWidth) {
          const influence = (1 - distFromWave / waveWidth) * wave.intensity * wave.life;
          waveEffect = Math.max(waveEffect, influence);
        }
      }

      // Smooth tile reactive glow
      tile.targetEmissive = waveEffect;
      tile.baseEmissive += (tile.targetEmissive - tile.baseEmissive) * delta * 8;

      const mat = tile.mesh.material as MeshStandardMaterial;
      mat.emissiveIntensity = tile.baseEmissive * 0.8;
      mat.opacity = 0.03 + tile.baseEmissive * 0.15;
    }

    // === Animate volumetric light shafts ===
    for (let i = 0; i < this.hazeMeshes.length; i++) {
      const haze = this.hazeMeshes[i];
      const mat = haze.material as MeshStandardMaterial;
      const pulse = 0.015 + Math.sin(now * 0.3 + i * 2.1) * 0.008;
      mat.opacity = pulse;
      // Very slow rotation drift
      haze.rotation.y += delta * 0.02 * (i % 2 === 0 ? 1 : -1);
    }
  }

  private spawnShootingStar() {
    // Spawn from a random edge of the ceiling area
    const side = Math.floor(Math.random() * 4);
    let sx: number, sy: number, sz: number;
    let vx: number, vy: number, vz: number;

    const ceilY = 4.2 + Math.random() * 0.4;
    const speed = 4 + Math.random() * 6;

    switch (side) {
      case 0: // Left to right
        sx = -6; sy = ceilY; sz = -2 + (Math.random() - 0.5) * 6;
        vx = speed; vy = -0.5 - Math.random() * 0.5; vz = (Math.random() - 0.5) * 2;
        break;
      case 1: // Right to left
        sx = 6; sy = ceilY; sz = -2 + (Math.random() - 0.5) * 6;
        vx = -speed; vy = -0.5 - Math.random() * 0.5; vz = (Math.random() - 0.5) * 2;
        break;
      case 2: // Front to back
        sx = (Math.random() - 0.5) * 8; sy = ceilY; sz = 3;
        vx = (Math.random() - 0.5) * 3; vy = -0.3 - Math.random() * 0.4; vz = -speed;
        break;
      default: // Back to front
        sx = (Math.random() - 0.5) * 8; sy = ceilY; sz = -7;
        vx = (Math.random() - 0.5) * 3; vy = -0.3 - Math.random() * 0.4; vz = speed;
        break;
    }

    // Star head
    const colors = ['#ffffff', '#aaddff', '#ffddaa', '#ddddff'];
    const starColor = colors[Math.floor(Math.random() * colors.length)];
    const headGeo = new SphereGeometry(0.02, 6, 6);
    const headMat = new MeshStandardMaterial({
      color: new Color(starColor),
      emissive: new Color(starColor),
      emissiveIntensity: 2.0,
      transparent: true,
      opacity: 0.8,
      blending: AdditiveBlending,
    });
    const head = new Mesh(headGeo, headMat);
    head.position.set(sx, sy, sz);
    this.world.scene.add(head);

    // Trail (stretched sphere behind the head)
    const trailGeo = new CylinderGeometry(0.003, 0.015, 0.4, 6);
    const trailMat = new MeshStandardMaterial({
      color: new Color(starColor),
      emissive: new Color(starColor),
      emissiveIntensity: 1.0,
      transparent: true,
      opacity: 0.3,
      blending: AdditiveBlending,
    });
    const trail = new Mesh(trailGeo, trailMat);
    trail.position.set(sx, sy, sz);
    // Orient trail along velocity
    const angle = Math.atan2(vz, vx);
    trail.rotation.z = -Math.PI / 2;
    trail.rotation.y = -angle;
    this.world.scene.add(trail);

    this.stars.push({
      mesh: head,
      trail,
      vel: { x: vx, y: vy, z: vz },
      life: 1.0 + Math.random() * 0.5,
      maxLife: 1.5,
    });
  }
}
