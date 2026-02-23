// Copyright (c) Manfred Foissner. All rights reserved.
// License: See LICENSE.txt in the project root.

// ============================================================
// PLAYER.js - Player Ship + Rendering (v2.5.0 Visual Upgrade)
// ============================================================

import { State } from './State.js';
import { Bullets } from './Bullets.js';
import { Particles } from './Particles.js';

export const Player = {
  fireTimer: 0,
  _hitFlash: 0,
  _thrustAnim: 0,

  init() {
    const p = State.player;
    p.hp = p.maxHP;
    p.shield = p.maxShield || 0;
    p.vx = 0;
    p.vy = 0;
    this.fireTimer = 0;
    this._hitFlash = 0;
    this._thrustAnim = 0;
  },

  update(dt, input) {
    const p = State.player;
    const s = State.computed || {};

    let ax = 0, ay = 0;
    if (input.left)  ax -= 1;
    if (input.right) ax += 1;
    if (input.up)    ay -= 1;
    if (input.down)  ay += 1;
    const len = Math.sqrt(ax * ax + ay * ay) || 1;
    ax /= len; ay /= len;

    const accel = 1800, drag = 6;
    p.vx += ax * accel * dt;
    p.vy += ay * accel * dt;
    p.vx -= p.vx * drag * dt;
    p.vy -= p.vy * drag * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;

    const world = State.world || {};
    const w = world.width || 4000, h = world.height || 4000;
    p.x = Math.max(p.radius, Math.min(w - p.radius, p.x));
    p.y = Math.max(p.radius, Math.min(h - p.radius, p.y));

    if (typeof input.mouseX === 'number') {
      p.angle = Math.atan2(input.mouseY - p.screenY, input.mouseX - p.screenX);
    }

    // Thrust lerp
    const isMoving = Math.abs(p.vx) > 15 || Math.abs(p.vy) > 15;
    this._thrustAnim += ((isMoving ? 1 : 0) - this._thrustAnim) * Math.min(1, dt * 8);

    if (this._hitFlash > 0) this._hitFlash -= dt;

    // Auto-fire
    const fireRate = s.fireRate || 5;
    this.fireTimer -= dt;
    if (input.fire && this.fireTimer <= 0) {
      this.fire();
      this.fireTimer = 1 / fireRate;
    }

    // Shield regen
    const maxShield = s.maxShield || p.maxShield || 0;
    if (maxShield > 0 && p.shield < maxShield) {
      p.shield = Math.min(maxShield, p.shield + (s.shieldRegen || 5) * dt);
    }

    // Engine trail
    if (isMoving && Math.random() < 0.5) {
      const bx = p.x - Math.cos(p.angle) * 18;
      const by = p.y - Math.sin(p.angle) * 18;
      Particles.trail(bx, by, '#00ccff', 2);
    }
  },

  fire() {
    const p = State.player;
    const s = State.computed || {};
    const dmg = s.damage || 10;
    const spd = 800;
    const proj = s.projectiles || 1;
    const isCrit = Math.random() < (s.critChance || 0);
    const critMult = s.critDamage || 2;

    const weaponId = State.meta?.equipment?.weapon;
    const weapon = weaponId ? State.meta.stash?.find(i => i.id === weaponId) : null;
    const wt = weapon?.baseId || 'laser_cannon';

    let bulletType = 'laser';
    if (wt.includes('plasma') || wt.includes('spreader')) bulletType = 'plasma';
    else if (wt.includes('rail')) bulletType = 'railgun';
    else if (wt.includes('missile')) bulletType = 'missile';
    else if (wt.includes('gatling')) bulletType = 'gatling';
    else if (wt.includes('nova')) bulletType = 'nova';

    const spread = proj > 1 ? 0.15 : 0;
    for (let i = 0; i < proj; i++) {
      const ao = proj > 1 ? (i - (proj - 1) / 2) * spread : 0;
      const a = p.angle + ao;
      Bullets.spawn({
        x: p.x + Math.cos(a) * 22,
        y: p.y + Math.sin(a) * 22,
        vx: Math.cos(a) * spd,
        vy: Math.sin(a) * spd,
        damage: isCrit ? dmg * critMult : dmg,
        size: bulletType === 'railgun' ? 2 : (bulletType === 'plasma' ? 6 : 4),
        crit: isCrit,
        piercing: s.pierce || 0,
        isPlayer: true,
        bulletType
      });
    }
    Particles.spawn(p.x + Math.cos(p.angle) * 24, p.y + Math.sin(p.angle) * 24, 'muzzle');
  },

  takeDamage(amount) {
    const p = State.player;
    if (p.shield > 0) {
      const absorbed = Math.min(p.shield, amount);
      p.shield -= absorbed;
      amount -= absorbed;
      if (absorbed > 0) Particles.ring(p.x, p.y, '#00ccff', p.radius + 10);
    }
    if (amount > 0) {
      p.hp -= amount;
      this._hitFlash = 0.15;
      Particles.spawn(p.x, p.y, 'playerHit');
    }
    return p.hp <= 0;
  },

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

      // Left exhaust plume
      const g1 = ctx.createLinearGradient(-7, 14, -7, 14 + len);
      g1.addColorStop(0, 'rgba(0,220,255,0.9)');
      g1.addColorStop(0.5, 'rgba(0,120,255,0.5)');
      g1.addColorStop(1, 'rgba(0,60,200,0)');
      ctx.fillStyle = g1;
      ctx.beginPath();
      ctx.moveTo(-10, 13); ctx.lineTo(-7, 13 + len); ctx.lineTo(-4, 13);
      ctx.fill();

      // Right exhaust plume
      const g2 = ctx.createLinearGradient(7, 14, 7, 14 + len);
      g2.addColorStop(0, 'rgba(0,220,255,0.9)');
      g2.addColorStop(0.5, 'rgba(0,120,255,0.5)');
      g2.addColorStop(1, 'rgba(0,60,200,0)');
      ctx.fillStyle = g2;
      ctx.beginPath();
      ctx.moveTo(4, 13); ctx.lineTo(7, 13 + len * 0.85); ctx.lineTo(10, 13);
      ctx.fill();

      // Bright core lines
      ctx.strokeStyle = 'rgba(200,240,255,0.7)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-7, 14); ctx.lineTo(-7, 14 + len * 0.5);
      ctx.moveTo(7, 14); ctx.lineTo(7, 14 + len * 0.45);
      ctx.stroke();
    }

    // === WING LAYER (wide, dark) ===
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
    ctx.strokeStyle = '#00889966';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Wing stripe accents
    ctx.strokeStyle = 'rgba(0,200,255,0.3)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(-3, -10); ctx.lineTo(-12, 12);
    ctx.moveTo(3, -10); ctx.lineTo(12, 12);
    ctx.stroke();

    // === HULL (main body, narrow) ===
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

    // Engine nacelle glow
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
      // Hex outline
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = i * Math.PI / 3 - Math.PI / 6;
        const hx = p.x + Math.cos(a) * r;
        const hy = p.y + Math.sin(a) * r;
        i === 0 ? ctx.moveTo(hx, hy) : ctx.lineTo(hx, hy);
      }
      ctx.closePath();
      ctx.stroke();
      // Glow
      ctx.shadowColor = '#00ccff';
      ctx.shadowBlur = 12;
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.restore();
    }
  }
};

export default Player;
