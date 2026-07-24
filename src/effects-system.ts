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

    // Create ambient floating orbs
    for (let i = 0; i < 15; i++) {
      const geo = new SphereGeometry(0.02 + Math.random() * 0.02, 8, 8);
      const mat = new MeshStandardMaterial({
        color: new Color('#00ffff'),
        emissive: new Color('#00ffff'),
        emissiveIntensity: 0.8,
        transparent: true,
        opacity: 0.3 + Math.random() * 0.3,
        blending: AdditiveBlending,
      });
      const orb = new Mesh(geo, mat);
      orb.position.set(
        (Math.random() - 0.5) * 8,
        0.5 + Math.random() * 3,
        -4 + Math.random() * 4,
      );
      (orb as any)._phase = Math.random() * Math.PI * 2;
      (orb as any)._speed = 0.3 + Math.random() * 0.5;
      (orb as any)._baseY = orb.position.y;
      this.ambientGroup.add(orb);
      this.ambientOrbs.push(orb);
    }
  }

  burstAt(x: number, y: number, z: number) {
    for (let i = 0; i < 10; i++) {
      const geo = new SphereGeometry(0.015, 6, 6);
      const mat = new MeshStandardMaterial({
        color: new Color('#00ffff'),
        emissive: new Color('#00ffff'),
        emissiveIntensity: 1.0,
        transparent: true,
        opacity: 1,
        blending: AdditiveBlending,
      });
      const mesh = new Mesh(geo, mat);
      mesh.position.set(x, y, z);
      this.world.scene.add(mesh);

      const angle = Math.random() * Math.PI * 2;
      const speed = 0.5 + Math.random() * 1;
      this.particles.push({
        mesh,
        vel: {
          x: Math.cos(angle) * speed * 0.3,
          y: 0.5 + Math.random() * 1.5,
          z: Math.sin(angle) * speed * 0.3,
        },
        life: 1,
        maxLife: 1,
      });
    }
  }

  celebrate() {
    for (let i = 0; i < 30; i++) {
      const geo = new SphereGeometry(0.02, 6, 6);
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
        (Math.random() - 0.5) * 2,
        1 + Math.random() * 2,
        -2 + Math.random() * 0.5,
      );
      this.world.scene.add(mesh);

      this.particles.push({
        mesh,
        vel: {
          x: (Math.random() - 0.5) * 2,
          y: 2 + Math.random() * 3,
          z: (Math.random() - 0.5) * 1,
        },
        life: 2,
        maxLife: 2,
      });
    }
  }

  defeat() {
    for (let i = 0; i < 15; i++) {
      const geo = new SphereGeometry(0.015, 6, 6);
      const mat = new MeshStandardMaterial({
        color: new Color('#ff2244'),
        emissive: new Color('#ff2244'),
        emissiveIntensity: 0.6,
        transparent: true,
        opacity: 0.8,
        blending: AdditiveBlending,
      });
      const mesh = new Mesh(geo, mat);
      mesh.position.set(
        (Math.random() - 0.5) * 1.5,
        1.5 + Math.random(),
        -2,
      );
      this.world.scene.add(mesh);

      this.particles.push({
        mesh,
        vel: {
          x: (Math.random() - 0.5) * 0.5,
          y: -0.5 - Math.random(),
          z: (Math.random() - 0.5) * 0.3,
        },
        life: 1.5,
        maxLife: 1.5,
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
      p.vel.y -= 2 * delta; // gravity

      const t = p.life / p.maxLife;
      (p.mesh.material as MeshStandardMaterial).opacity = t;
      const s = 0.5 + t * 0.5;
      p.mesh.scale.set(s, s, s);
    }

    // Animate ambient orbs
    const now = performance.now() * 0.001;
    for (const orb of this.ambientOrbs) {
      const phase = (orb as any)._phase as number;
      const speed = (orb as any)._speed as number;
      const baseY = (orb as any)._baseY as number;
      orb.position.y = baseY + Math.sin(now * speed + phase) * 0.15;
      const pulse = 0.2 + Math.sin(now * speed * 0.7 + phase) * 0.15;
      (orb.material as MeshStandardMaterial).opacity = pulse;
    }
  }
}
