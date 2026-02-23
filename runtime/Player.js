// Copyright (c) Manfred Foissner. All rights reserved.
// License: See LICENSE.txt in the project root.

// ============================================================
// Player.js - Player Controller (v2.5.0 - visual upgrade only)
// ============================================================

import { State } from './State.js';
import { Input } from './Input.js';
import { Bullets } from './Bullets.js';
import { Particles } from './Particles.js';

export const Player = {
  _hitFlash: 0,
  _thrustAnim: 0,

  update(dt, canvas, explorationMode = false) {
    const p = State.player;
    const cfg = State.data.config?.player || {};

    // ========== CORRUPTION DOT ==========
    if (p.dotT && p.dotT > 0) {
      p.dotT -= dt;
      this.takeDamage(p.maxHP * (p.dotPct || 0) * dt);
      if (p.dotT <= 0) { p.dotT = 0; p.dotPct = 0; }
    }

    // ========== MOVEMENT (WASD) ==========
    const move = Input.getMovement();

    const accel = cfg.acceleration || 3000;
    const friction = cfg.friction || 0.75;
    const deadzone = cfg.deadzone || 0.1;

    if (Math.abs(move.dx) > deadzone || Math.abs(move.dy) > deadzone) {
      const targetVX = move.dx * p.speed;
      const targetVY = move.dy * p.speed;
      p.vx += (targetVX - p.vx) * Math.min(1, accel * dt / p.speed);
      p.vy += (targetVY - p.vy) * Math.min(1, accel * dt / p.speed);
    } else {
      p.vx *= friction;
      p.vy *= friction;
      if (Math.abs(p.vx) < 5) p.vx = 0;
      if (Math.abs(p.vy) < 5) p.vy = 0;
    }

    p.x += p.vx * dt;
    p.y += p.vy * dt;

    // Boundary clamping
    const margin = p.radius + 5;
    if (explorationMode) {
      const zone = State.world?.currentZone;
      if (zone) {
        p.x = Math.max(margin, Math.min(zone.width - margin, p.x));
        p.y = Math.max(margin, Math.min(zone.height - margin, p.y));
      }
    } else {
      p.x = Math.max(margin, Math.min(canvas.width - margin, p.x));
      p.y = Math.max(margin, Math.min(canvas.height - margin, p.y));
    }

    // ========== AIM (Mouse) ==========
    if (explorationMode) {
      const Camera = State.modules?.Camera;
      if (Camera) {
        const worldMouse = Camera.screenToWorld(State.input.mouseX, State.input.mouseY);
        p.angle = Math.atan2(worldMouse.y - p.y, worldMouse.x - p.x);
      } else {
        p.angle = Input.getAimAngle(p.x, p.y);
      }
    } else {
      p.angle = Input.getAimAngle(p.x, p.y);
    }

    // ========== SHOOTING ==========
    p.fireCooldown -= dt;
    if (State.input.fire && p.fireCooldown <= 0) {
      this.fire();
      p.fireCooldown = 1 / p.fireRate;
    }

    // ========== SHIELD REGEN ==========
    p.shieldRegenDelay -= dt;
    if (p.shieldRegenDelay <= 0 && p.shield < p.maxShield) {
      const regenRate = cfg.shieldRegenRate || 5;
      p.shield = Math.min(p.maxShield, p.shield + regenRate * dt);
    }

    // ========== VISUAL: thrust lerp + flash decay ==========
    const isMoving = Math.abs(p.vx) > 15 || Math.abs(p.vy) > 15;
    this._thrustAnim += ((isMoving ? 1 : 0) - this._thrustAnim) * Math.min(1, dt * 8);
    if (this._hitFlash > 0) this._hitFlash -= dt;

    // Engine trail particles
    if (isMoving && Math.random() < 0.4) {
      const bx = p.x - Math.cos(p.angle) * 18;
      const by = p.y - Math.sin(p.angle) * 18;
      Particles.trail(bx, by, '#00ccff', 2);
    }

    // Update drone companion
    this.updateDrone(dt);
  },

  fire() {
    const p = State.player;
    const baseAngle = p.angle;
    const count = p.projectiles;
    const spreadRad = (p.spread || 0) * (Math.PI / 180);

    let angles = [];
    if (count === 1) {
      angles = [baseAngle];
    } else {
      const totalSpread = spreadRad * (count - 1);
      const startAngle = baseAngle - totalSpread / 2;
      for (let i = 0; i < count; i++) {
        angles.push(startAngle + (spreadRad * i));
      }
    }

    for (const angle of angles) {
      Bullets.spawn({
        x: p.x + Math.cos(angle) * 20,
        y: p.y + Math.sin(angle) * 20,
        vx: Math.cos(angle) * p.bulletSpeed,
        vy: Math.sin(angle) * p.bulletSpeed,
        damage: p.damage,
        piercing: p.piercing,
        isPlayer: true,
        crit: Math.random() * 100 < p.critChance
      });
    }

    Particles.spawn(p.x + Math.cos(p.angle) * 22, p.y + Math.sin(p.angle) * 22, 'muzzle');
  },

  takeDamage(amount) {
    const p = State.player;
    if (State.run?.stats) State.run.stats.damageTaken += amount;

    // Shield absorbs first
    if (p.shield > 0) {
      const shieldDmg = Math.min(p.shield, amount);
      p.shield -= shieldDmg;
      amount -= shieldDmg;
      if (amount <= 0) {
        p.shieldRegenDelay = State.data.config?.player?.shieldRegenDelay || 3;
        return;
      }
    }

    p.hp -= amount;
    p.shieldRegenDelay = State.data.config?.player?.shieldRegenDelay || 3;
    this._hitFlash = 0.15;
    Particles.spawn(p.x, p.y, 'playerHit');

    if (p.hp <= 0) {
      p.hp = 0;
      Particles.spawn(p.x, p.y, 'explosion');
    }
  },

  applyDot(dot) {
    const p = State.player;
    const dur = (dot && dot.duration) ? dot.duration : 4.0;
    const pct = (dot && dot.dpsPctMaxHp) ? dot.dpsPctMaxHp : 0.01;
    p.dotT = Math.max(p.dotT || 0, dur);
    p.dotPct = Math.max(p.dotPct || 0, pct);
  },

  isDead() {
    return State.player.hp <= 0;
  },

  // ============ DRONE COMPANION SYSTEM ============
  _droneAngle: 0,
  _droneFireTimer: 0,

  updateDrone(dt) {
    const p = State.player;
    const drone = p.drone;
    if (!drone || !drone.active) return;

    // Orbit around player
    const orbitSpeed = drone.type === 'shield' ? 1.5 : 2.2;
    this._droneAngle += dt * orbitSpeed;
    const orbitR = 45;
    drone.x = p.x + Math.cos(this._droneAngle) * orbitR;
    drone.y = p.y + Math.sin(this._droneAngle) * orbitR;

    if (drone.type === 'combat') {
      // Auto-fire at nearest enemy
      this._droneFireTimer -= dt;
      if (this._droneFireTimer <= 0) {
        let nearest = null;
        let nearDist = 350; // max range
        for (const e of State.enemies) {
          if (e.dead) continue;
          const d = Math.hypot(e.x - drone.x, e.y - drone.y);
          if (d < nearDist) { nearDist = d; nearest = e; }
        }
        if (nearest) {
          const ang = Math.atan2(nearest.y - drone.y, nearest.x - drone.x);
          const spd = 500;
          Bullets.spawn({
            x: drone.x, y: drone.y,
            vx: Math.cos(ang) * spd,
            vy: Math.sin(ang) * spd,
            damage: Math.max(1, Math.floor(p.damage * (drone.damagePct || 0.25))),
            piercing: 0,
            isPlayer: true,
            crit: false,
            bulletType: 'gatling'
          });
          this._droneFireTimer = drone.fireRate || 0.5;
        }
      }
    } else if (drone.type === 'shield') {
      // Absorb nearby enemy bullets
      for (let i = State.enemyBullets.length - 1; i >= 0; i--) {
        const b = State.enemyBullets[i];
        const d = Math.hypot(b.x - drone.x, b.y - drone.y);
        if (d < 20) {
          State.enemyBullets.splice(i, 1);
          drone.absorbed = (drone.absorbed || 0) + 1;
          // Small flash
          Particles.spawn(b.x, b.y, 'muzzle');
        }
      }
    } else if (drone.type === 'repair') {
      // Heal player over time
      drone._healTimer = (drone._healTimer || 0) + dt;
      if (drone._healTimer >= 1) {
        drone._healTimer = 0;
        const healAmt = Math.max(1, Math.floor(p.maxHP * (drone.healPct || 0.02)));
        if (p.hp < p.maxHP) {
          p.hp = Math.min(p.maxHP, p.hp + healAmt);
          Particles.trail(drone.x, drone.y, '#00ff88', 3);
        }
      }
    }
  },

  drawDrone(ctx) {
    const p = State.player;
    const drone = p.drone;
    if (!drone || !drone.active) return;

    const t = performance.now() * 0.001;
    const dx = drone.x;
    const dy = drone.y;

    ctx.save();
    ctx.translate(dx, dy);

    if (drone.type === 'combat') {
      // Small aggressive triangle
      ctx.rotate(this._droneAngle * 2);
      ctx.fillStyle = '#ff8844';
      ctx.shadowColor = '#ff6622';
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.moveTo(0, -8); ctx.lineTo(-6, 6); ctx.lineTo(6, 6);
      ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;
    } else if (drone.type === 'shield') {
      // Blue hex shield icon
      ctx.rotate(t * 1.5);
      ctx.strokeStyle = '#44aaff';
      ctx.lineWidth = 2;
      ctx.shadowColor = '#44aaff';
      ctx.shadowBlur = 8;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = i * Math.PI / 3;
        i === 0 ? ctx.moveTo(Math.cos(a) * 8, Math.sin(a) * 8)
          : ctx.lineTo(Math.cos(a) * 8, Math.sin(a) * 8);
      }
      ctx.closePath();
      ctx.stroke();
      ctx.shadowBlur = 0;
    } else if (drone.type === 'repair') {
      // Green cross
      ctx.rotate(t);
      ctx.fillStyle = '#44ff88';
      ctx.shadowColor = '#00ff44';
      ctx.shadowBlur = 6;
      ctx.fillRect(-7, -2, 14, 4);
      ctx.fillRect(-2, -7, 4, 14);
      ctx.shadowBlur = 0;
    }

    ctx.restore();

    // Connection line to player
    ctx.save();
    ctx.globalAlpha = 0.12;
    ctx.strokeStyle = drone.type === 'combat' ? '#ff8844' :
      drone.type === 'shield' ? '#44aaff' : '#44ff88';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(dx, dy);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  },

  // ============ ENHANCED DRAW (v2.5.0) ============
  draw(ctx) {
    const p = State.player;
    const t = performance.now() * 0.001;
    const thrust = this._thrustAnim || 0;

    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.angle + Math.PI / 2);

    // === ENGINE EXHAUST ===
    if (thrust > 0.05) {
      const fl = 0.7 + Math.random() * 0.3;
      const len = 16 + thrust * 14 * fl;

      const g1 = ctx.createLinearGradient(-7, 14, -7, 14 + len);
      g1.addColorStop(0, 'rgba(0,220,255,0.9)');
      g1.addColorStop(0.5, 'rgba(0,120,255,0.5)');
      g1.addColorStop(1, 'rgba(0,60,200,0)');
      ctx.fillStyle = g1;
      ctx.beginPath();
      ctx.moveTo(-10, 13); ctx.lineTo(-7, 13 + len); ctx.lineTo(-4, 13);
      ctx.fill();

      const g2 = ctx.createLinearGradient(7, 14, 7, 14 + len);
      g2.addColorStop(0, 'rgba(0,220,255,0.9)');
      g2.addColorStop(0.5, 'rgba(0,120,255,0.5)');
      g2.addColorStop(1, 'rgba(0,60,200,0)');
      ctx.fillStyle = g2;
      ctx.beginPath();
      ctx.moveTo(4, 13); ctx.lineTo(7, 13 + len * 0.85); ctx.lineTo(10, 13);
      ctx.fill();

      ctx.strokeStyle = 'rgba(200,240,255,0.7)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-7, 14); ctx.lineTo(-7, 14 + len * 0.5);
      ctx.moveTo(7, 14); ctx.lineTo(7, 14 + len * 0.45);
      ctx.stroke();
    }

    // === WING LAYER ===
    ctx.beginPath();
    ctx.moveTo(0, -18);
    ctx.lineTo(-16, 12); ctx.lineTo(-12, 15);
    ctx.lineTo(0, 8);
    ctx.lineTo(12, 15); ctx.lineTo(16, 12);
    ctx.closePath();
    const wg = ctx.createLinearGradient(-16, 0, 16, 0);
    wg.addColorStop(0, '#003344');
    wg.addColorStop(0.5, '#006677');
    wg.addColorStop(1, '#003344');
    ctx.fillStyle = wg;
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,136,153,0.4)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Wing stripe accents
    ctx.strokeStyle = 'rgba(0,200,255,0.3)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(-3, -10); ctx.lineTo(-12, 12);
    ctx.moveTo(3, -10); ctx.lineTo(12, 12);
    ctx.stroke();

    // === HULL ===
    ctx.beginPath();
    ctx.moveTo(0, -21);
    ctx.lineTo(-8, 10); ctx.lineTo(0, 6); ctx.lineTo(8, 10);
    ctx.closePath();
    const hg = ctx.createLinearGradient(0, -21, 0, 10);
    hg.addColorStop(0, '#00ffcc');
    hg.addColorStop(0.4, '#00bb99');
    hg.addColorStop(1, '#005544');
    ctx.fillStyle = hg;
    ctx.fill();
    ctx.strokeStyle = '#00ffaa';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // === COCKPIT ===
    const cpulse = 0.7 + Math.sin(t * 3) * 0.3;
    ctx.shadowColor = '#00ffcc';
    ctx.shadowBlur = 8;
    ctx.fillStyle = `rgba(0,255,220,${cpulse})`;
    ctx.beginPath();
    ctx.ellipse(0, -8, 2.5, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // === NAV LIGHTS ===
    if (Math.sin(t * 4) > 0) {
      ctx.fillStyle = '#ff3333';
      ctx.beginPath(); ctx.arc(-15, 12, 1.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#33ff33';
      ctx.beginPath(); ctx.arc(15, 12, 1.5, 0, Math.PI * 2); ctx.fill();
    }

    // Engine nacelles
    ctx.fillStyle = '#00ddff';
    ctx.shadowColor = '#00ccff';
    ctx.shadowBlur = 5;
    ctx.beginPath(); ctx.arc(-7, 13, 2.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(7, 13, 2.5, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;

    // === DAMAGE FLASH ===
    if (this._hitFlash > 0) {
      ctx.globalAlpha = this._hitFlash / 0.15;
      ctx.fillStyle = '#ff4444';
      ctx.beginPath();
      ctx.moveTo(0, -21); ctx.lineTo(-16, 12); ctx.lineTo(16, 12);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    ctx.restore();

    // === SHIELD HEX BUBBLE ===
    if (p.shield > 0) {
      const pct = p.shield / (p.maxShield || 1);
      const r = p.radius + 10 + Math.sin(t * 2) * 2;
      ctx.save();
      ctx.globalAlpha = 0.12 + pct * 0.2;
      ctx.strokeStyle = '#00ccff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = i * Math.PI / 3 - Math.PI / 6;
        const hx = p.x + Math.cos(a) * r;
        const hy = p.y + Math.sin(a) * r;
        i === 0 ? ctx.moveTo(hx, hy) : ctx.lineTo(hx, hy);
      }
      ctx.closePath();
      ctx.stroke();
      ctx.shadowColor = '#00ccff';
      ctx.shadowBlur = 12;
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.restore();
    }
  }
};

export default Player;
