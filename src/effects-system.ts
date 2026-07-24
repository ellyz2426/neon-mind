import {
  createSystem,
  Mesh,
  SphereGeometry,
  MeshStandardMaterial,
  Color,
  Group,
  AdditiveBlending,
} from '@iwsdk/core';

interface Particle {
  mesh: Mesh;
  vel: { x: number; y: number; z: number };
  life: number;
  maxLife: number;
}

export class EffectsSystem extends createSystem({}) {
  private particles: Particle[] = [];
  private ambientOrbs: Mesh[] = [];
  private ambientGroup!: Group;

  init() {
    this.ambientGroup = new Group();
    this.world.scene.add(this.ambientGroup);

    // Create ambient floating orbs — varied colors
    const orbColors = ['#00ffff', '#ff00ff', '#4466ff', '#00ff88', '#ffcc00', '#ff6644'];
    for (let i = 0; i < 20; i++) {
      const size = 0.015 + Math.random() * 0.025;
      const geo = new SphereGeometry(size, 8, 8);
      const color = orbColors[i % orbColors.length];
      const mat = new MeshStandardMaterial({
        color: new Color(color),
        emissive: new Color(color),
        emissiveIntensity: 0.8,
        transparent: true,
        opacity: 0.2 + Math.random() * 0.3,
        blending: AdditiveBlending,
      });
      const orb = new Mesh(geo, mat);
      orb.position.set(
        (Math.random() - 0.5) * 10,
        0.3 + Math.random() * 3.5,
        -5 + Math.random() * 5,
      );
      (orb as any)._phase = Math.random() * Math.PI * 2;
      (orb as any)._speed = 0.2 + Math.random() * 0.6;
      (orb as any)._baseY = orb.position.y;
      (orb as any)._driftX = (Math.random() - 0.5) * 0.3;
      this.ambientGroup.add(orb);
      this.ambientOrbs.push(orb);
    }
  }

  burstAt(x: number, y: number, z: number) {
    const burstColors = ['#00ffff', '#ffffff', '#88ddff'];
    for (let i = 0; i < 12; i++) {
      const geo = new SphereGeometry(0.012, 6, 6);
      const color = burstColors[i % burstColors.length];
      const mat = new MeshStandardMaterial({
        color: new Color(color),
        emissive: new Color(color),
        emissiveIntensity: 1.0,
        transparent: true,
        opacity: 1,
        blending: AdditiveBlending,
      });
      const mesh = new Mesh(geo, mat);
      mesh.position.set(x, y, z);
      this.world.scene.add(mesh);

      const angle = Math.random() * Math.PI * 2;
      const elevation = (Math.random() - 0.3) * Math.PI;
      const speed = 0.5 + Math.random() * 1.5;
      this.particles.push({
        mesh,
        vel: {
          x: Math.cos(angle) * Math.cos(elevation) * speed * 0.4,
          y: Math.sin(elevation) * speed + 0.5,
          z: Math.sin(angle) * Math.cos(elevation) * speed * 0.4,
        },
        life: 0.8 + Math.random() * 0.4,
        maxLife: 1.2,
      });
    }
  }

  celebrate() {
    for (let i = 0; i < 40; i++) {
      const geo = new SphereGeometry(0.018, 6, 6);
      const hue = Math.random();
      const color = new Color().setHSL(hue, 1, 0.6);
      const mat = new MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 1.0,
        transparent: true,
        opacity: 1,
        blending: AdditiveBlending,
      });
      const mesh = new Mesh(geo, mat);
      mesh.position.set(
        (Math.random() - 0.5) * 2.5,
        0.8 + Math.random() * 2.5,
        -2 + Math.random() * 0.8,
      );
      this.world.scene.add(mesh);

      this.particles.push({
        mesh,
        vel: {
          x: (Math.random() - 0.5) * 3,
          y: 2.5 + Math.random() * 4,
          z: (Math.random() - 0.5) * 1.5,
        },
        life: 2 + Math.random() * 0.5,
        maxLife: 2.5,
      });
    }
  }

  defeat() {
    for (let i = 0; i < 20; i++) {
      const geo = new SphereGeometry(0.012, 6, 6);
      const shade = 0.3 + Math.random() * 0.4;
      const mat = new MeshStandardMaterial({
        color: new Color(shade, 0.1, 0.15),
        emissive: new Color(shade, 0.05, 0.1),
        emissiveIntensity: 0.5,
        transparent: true,
        opacity: 0.7,
        blending: AdditiveBlending,
      });
      const mesh = new Mesh(geo, mat);
      mesh.position.set(
        (Math.random() - 0.5) * 2,
        1.5 + Math.random(),
        -2,
      );
      this.world.scene.add(mesh);

      this.particles.push({
        mesh,
        vel: {
          x: (Math.random() - 0.5) * 0.5,
          y: -0.3 - Math.random() * 0.8,
          z: (Math.random() - 0.5) * 0.3,
        },
        life: 1.5 + Math.random() * 0.5,
        maxLife: 2,
      });
    }
  }

  // Hint usage sparkle
  sparkleAt(x: number, y: number, z: number) {
    for (let i = 0; i < 8; i++) {
      const geo = new SphereGeometry(0.01, 6, 6);
      const mat = new MeshStandardMaterial({
        color: new Color('#ffcc00'),
        emissive: new Color('#ffcc00'),
        emissiveIntensity: 1.5,
        transparent: true,
        opacity: 1,
        blending: AdditiveBlending,
      });
      const mesh = new Mesh(geo, mat);
      mesh.position.set(x, y, z);
      this.world.scene.add(mesh);

      const angle = (i / 8) * Math.PI * 2;
      this.particles.push({
        mesh,
        vel: {
          x: Math.cos(angle) * 0.8,
          y: 0.5 + Math.random() * 0.5,
          z: Math.sin(angle) * 0.3,
        },
        life: 0.6,
        maxLife: 0.6,
      });
    }
  }

  update(delta: number) {
    // Animate particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= delta;
      if (p.life <= 0) {
        this.world.scene.remove(p.mesh);
        this.particles.splice(i, 1);
        continue;
      }

      p.mesh.position.x += p.vel.x * delta;
      p.mesh.position.y += p.vel.y * delta;
      p.mesh.position.z += p.vel.z * delta;
      p.vel.y -= 2.5 * delta; // gravity

      const t = p.life / p.maxLife;
      (p.mesh.material as MeshStandardMaterial).opacity = t * t; // Quadratic fade
      const s = 0.3 + t * 0.7;
      p.mesh.scale.set(s, s, s);
    }

    // Animate ambient orbs with drift
    const now = performance.now() * 0.001;
    for (const orb of this.ambientOrbs) {
      const phase = (orb as any)._phase as number;
      const speed = (orb as any)._speed as number;
      const baseY = (orb as any)._baseY as number;
      const driftX = (orb as any)._driftX as number;

      orb.position.y = baseY + Math.sin(now * speed + phase) * 0.2;
      orb.position.x += Math.sin(now * driftX + phase) * 0.0003;

      const pulse = 0.15 + Math.sin(now * speed * 0.7 + phase) * 0.12;
      (orb.material as MeshStandardMaterial).opacity = pulse;
    }
  }
}
