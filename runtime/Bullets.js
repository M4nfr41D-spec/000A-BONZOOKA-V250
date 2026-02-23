// Copyright (c) Manfred Foissner. All rights reserved.
// License: See LICENSE.txt in the project root.

// ============================================================
// BULLETS.js - Projectile System
// ============================================================

import { State } from './State.js';
import { Enemies } from './Enemies.js';
import { Player } from './Player.js';
import { SpatialHash } from './SpatialHash.js';

export const Bullets = {
  // Spawn a new bullet
  spawn(config) {
    State.bullets.push({
      x: config.x,
      y: config.y,
      vx: config.vx || 0,
      vy: config.vy || -500,
      damage: config.damage || 10,
      size: config.size || 4,
      pierce: config.piercing || 0,
      hits: 0,
      isCrit: config.crit || false,
      isPlayer: config.isPlayer !== false,
      bulletType: config.bulletType || 'laser'
    });
  },
  
  // Spawn enemy bullet
  spawnEnemy(config) {
    State.enemyBullets.push({
      x: config.x,
      y: config.y,
      vx: config.vx || 0,
      vy: config.vy || 200,
      damage: config.damage || 10,
      size: config.size || 6,
      bulletType: config.bulletType || 'enemy'
    });
  },
  
  // Update all bullets
  update(dt, canvas) {
    // Player bullets
    for (let i = State.bullets.length - 1; i >= 0; i--) {
      const b = State.bullets[i];
      
      b.x += b.vx * dt;
      b.y += b.vy * dt;      // Off screen (world mode uses zone bounds)
      const zone = State.world?.currentZone;
      if (zone) {
        const margin = 200;
        if (b.y < -margin || b.y > zone.height + margin || b.x < -margin || b.x > zone.width + margin) {
          State.bullets.splice(i, 1);
          continue;
        }
      } else {
        if (b.y < -20 || b.y > canvas.height + 20 || b.x < -20 || b.x > canvas.width + 20) {
          State.bullets.splice(i, 1);
          continue;
        }
      }
      // ── Spatial hash accelerated collision (falls back to brute-force if grid unavailable) ──
      const grid = State._spatialGrid;
      const queryR = Math.max(b.size, 10) + 80; // covers largest asteroid/enemy radius

      // Check collision with asteroid props (player bullets only)
      if (b.isPlayer) {
        let hitAsteroid = false;
        const nearby = grid
          ? SpatialHash.query(grid, b.x, b.y, queryR)
          : (zone?.asteroids || []);
        for (const a of nearby) {
          if (!a || a.destroyed || a.dead !== undefined) continue; // skip enemies (they have .dead)
          const distA = Math.hypot(b.x - a.x, b.y - a.y);
          if (distA < (b.size + (a.radius || 50))) {
            // Damage asteroid
            a.hp = (typeof a.hp === 'number') ? a.hp - b.damage : 0;

            // Small impact feedback (keep it cheap)
            State.particles.push({
              x: b.x,
              y: b.y,
              vx: (Math.random() - 0.5) * 80,
              vy: (Math.random() - 0.5) * 80,
              life: 0.18,
              maxLife: 0.18,
              color: '#cccccc',
              size: 2
            });

            // Destroyed -> drop scrap pickup
            if (a.hp <= 0) {
              a.destroyed = true;
              const acfg = State.data.config?.asteroids || {};
              const sMin = (typeof acfg.scrapMin === 'number') ? acfg.scrapMin : 2;
              const sMax = (typeof acfg.scrapMax === 'number') ? acfg.scrapMax : 6;
              const sizeFactor = Math.max(0.7, Math.min(1.6, (a.radius || 50) / 50));
              const value = Math.floor((sMin + Math.random() * (sMax - sMin + 1)) * sizeFactor);
              State.pickups.push({
                type: 'scrap',
                x: a.x,
                y: a.y,
                vx: (Math.random() - 0.5) * 60,
                vy: (Math.random() - 0.5) * 60,
                life: 12,
                value: Math.max(1, value)
              });
            }

            // Player bullets stop on impact (per your default)
            State.bullets.splice(i, 1);
            hitAsteroid = true;
            break;
          }
        }
        if (hitAsteroid) continue;
      }

      // Check collision with enemies (spatial hash query or fallback)
      const nearbyEnemies = grid
        ? SpatialHash.query(grid, b.x, b.y, queryR)
        : State.enemies;
      for (const e of nearbyEnemies) {
        if (e.dead || e.destroyed !== undefined) continue; // skip asteroids (they have .destroyed)
        
        const dist = Math.hypot(b.x - e.x, b.y - e.y);
        if (dist < b.size + e.size) {
          // Hit!
          const killData = Enemies.damage(e, b.damage, b.isCrit);
          
          // Spawn damage number
          this.spawnDamageNumber(b.x, b.y, b.damage, b.isCrit);
          
          // Handle kill rewards
          if (killData) {
            this.onEnemyKilled(killData);
          }
          
          b.hits++;
          if (b.hits > b.pierce) {
            State.bullets.splice(i, 1);
          }
          break;
        }
      }
    }
    
    // Enemy bullets
    for (let i = State.enemyBullets.length - 1; i >= 0; i--) {
      const b = State.enemyBullets[i];
      
      b.x += b.vx * dt;
      b.y += b.vy * dt;      // Off screen (world mode uses zone bounds)
      const zone = State.world?.currentZone;
      if (zone) {
        const margin = 200;
        if (b.y < -margin || b.y > zone.height + margin || b.x < -margin || b.x > zone.width + margin) {
          State.enemyBullets.splice(i, 1);
          continue;
        }
      } else {
        if (b.y < -20 || b.y > canvas.height + 20 || b.x < -20 || b.x > canvas.width + 20) {
          State.enemyBullets.splice(i, 1);
          continue;
        }
      }
      // Check collision with player
      const p = State.player;
      const dist = Math.hypot(b.x - p.x, b.y - p.y);
      if (dist < b.size + 15) {
        Player.takeDamage(b.damage);
        if (b.dot) Player.applyDot(b.dot);
        State.enemyBullets.splice(i, 1);
      }
    }
  },
  
  // Spawn floating damage number
  spawnDamageNumber(x, y, damage, isCrit) {
    const cfg = State.data.config?.effects?.damageNumbers || {};
    
    // Config values with Diablo-style defaults
    const baseSize = cfg.baseSize || 16;
    const critSize = cfg.critSize || 28;
    const normalColor = cfg.normalColor || '#ffffff';
    const critColor = cfg.critColor || '#ffcc00';
    const bigHitColor = cfg.bigHitColor || '#ff6600';
    const floatSpeed = cfg.floatSpeed || 120;
    const duration = cfg.duration || 0.9;
    const spread = cfg.spread || 30;
    
    // Big hit threshold (relative to player damage)
    const bigHitThreshold = State.player.damage * 3;
    const isBigHit = damage >= bigHitThreshold;
    
    let color = normalColor;
    let size = baseSize;
    
    if (isCrit) {
      color = critColor;
      size = critSize;
    }
    if (isBigHit) {
      color = bigHitColor;
      size = critSize + 4;
    }
    
    State.particles.push({
      x: x + (Math.random() - 0.5) * spread,
      y: y,
      vx: (Math.random() - 0.5) * 50,
      vy: -floatSpeed,
      life: duration,
      maxLife: duration,
      text: Math.round(damage).toString(),
      isText: true,
      color: color,
      size: size,
      isCrit: isCrit,
      scale: isCrit ? 1.5 : 1.0  // For punch animation
    });
  },
  
  // Handle enemy kill rewards
  onEnemyKilled(killData) {
    const cfg = State.data.config;
    
    // XP
    import('./Leveling.js').then(module => {
      module.Leveling.addXP(killData.xp);
    });
    
    // Cells
    const baseCells = cfg?.economy?.cellsPerKill || 3;
    let cells = baseCells;
    if (killData.isElite) cells *= 3;
    if (killData.isBoss) cells *= 10;
    State.run.cells += Math.floor(cells);
    
    // Scrap
    const baseScrap = cfg?.economy?.scrapPerKill || 5;
    let scrap = baseScrap;
    if (killData.isElite) scrap *= (cfg?.economy?.eliteScrapMult || 3);
    if (killData.isBoss) scrap *= (cfg?.economy?.bossScrapMult || 10);
    State.run.scrapEarned += Math.floor(scrap);
    
    // Loot drop check
    this.checkLootDrop(killData);
  },
  
  // Check for item drop (with pity + anti-exploit integration)
  checkLootDrop(killData) {
    const cfg = State.data.config?.loot;
    if (!cfg) return;

    let dropChance = cfg.baseDropChance || 0.03;
    if (killData.isElite) dropChance = cfg.eliteDropChance || 0.25;
    if (killData.isBoss) dropChance = cfg.bossDropChance || 1.0;

    // Apply luck
    dropChance *= (1 + (State.player.luck || 0) * 0.02);

    // Anti-exploit: seed farming nerf (if module loaded)
    if (State.meta.antiExploit) {
      const currentSeed = State.run.currentSeed;
      if (currentSeed) {
        const hist = State.meta.antiExploit.seedHistory || [];
        const maxReuse = State.data.config?.antiExploit?.maxSeedReuse || 3;
        const reuseCount = hist.filter(s => s.seed === currentSeed).length;
        if (reuseCount > maxReuse) {
          dropChance *= Math.max(0.1, 1 / reuseCount);
        }
      }
    }

    // Pity: increment kill counter even if no drop
    if (State.meta.pity) {
      State.meta.pity.killsSinceRare++;
      State.meta.pity.killsSinceLegendary++;
      State.meta.pity.killsSinceUnique++;
    }

    if (Math.random() < dropChance) {
      // Spawn pickup (Items.generateRandom handles pity + ilvl internally)
      State.pickups.push({
        type: 'item',
        x: killData.x,
        y: killData.y,
        vx: (Math.random() - 0.5) * 50,
        vy: -50 + Math.random() * 30,
        life: 10,
        rarity: killData.isBoss ? 'legendary' : null,
        rarityFloor: killData.isElite ? 'rare' : null,
        ilvl: State.run.currentDepth || State.meta.level || 1
      });
    }
    
    // Always drop cells pickup
    State.pickups.push({
      type: 'cells',
      x: killData.x + (Math.random() - 0.5) * 20,
      y: killData.y,
      vx: (Math.random() - 0.5) * 40,
      vy: -30 + Math.random() * 20,
      value: killData.isBoss ? 50 : (killData.isElite ? 20 : 5),
      life: 8
    });
    
    // Chance for scrap pickup
    if (Math.random() < 0.3 || killData.isElite || killData.isBoss) {
      State.pickups.push({
        type: 'scrap',
        x: killData.x + (Math.random() - 0.5) * 20,
        y: killData.y,
        vx: (Math.random() - 0.5) * 40,
        vy: -30 + Math.random() * 20,
        value: killData.isBoss ? 100 : (killData.isElite ? 30 : 10),
        life: 10
      });
    }
  },
  
  // Draw all bullets
  draw(ctx) {
    const t = performance.now() * 0.001;

    // === PLAYER BULLETS (type-specific) ===
    for (const b of State.bullets) {
      const type = b.bulletType || 'laser';
      const s = b.size;
      const ang = Math.atan2(b.vy, b.vx);

      ctx.save();

      switch (type) {
        case 'laser': {
          // Bright cyan bolt with glow trail
          const trailLen = 12;
          const g = ctx.createLinearGradient(
            b.x - Math.cos(ang) * trailLen, b.y - Math.sin(ang) * trailLen,
            b.x, b.y
          );
          g.addColorStop(0, 'rgba(0,200,255,0)');
          g.addColorStop(1, 'rgba(0,255,255,0.9)');
          ctx.strokeStyle = g;
          ctx.lineWidth = s * 1.5;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(b.x - Math.cos(ang) * trailLen, b.y - Math.sin(ang) * trailLen);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
          // Core dot
          ctx.fillStyle = '#ffffff';
          ctx.shadowColor = '#00ffff';
          ctx.shadowBlur = 8;
          ctx.beginPath();
          ctx.arc(b.x, b.y, s * 0.6, 0, Math.PI * 2);
          ctx.fill();
          break;
        }
        case 'plasma': {
          // Wobbly green-yellow plasma blob
          const wobble = Math.sin(t * 20 + b.x * 0.1) * 2;
          ctx.fillStyle = '#88ff44';
          ctx.shadowColor = '#88ff00';
          ctx.shadowBlur = 12;
          ctx.beginPath();
          ctx.arc(b.x + wobble * 0.3, b.y, s, 0, Math.PI * 2);
          ctx.fill();
          // Inner bright core
          ctx.fillStyle = '#eeffaa';
          ctx.beginPath();
          ctx.arc(b.x, b.y, s * 0.4, 0, Math.PI * 2);
          ctx.fill();
          break;
        }
        case 'railgun': {
          // Thin bright line + sparks
          const trailLen = 22;
          ctx.strokeStyle = '#ffddff';
          ctx.shadowColor = '#cc88ff';
          ctx.shadowBlur = 6;
          ctx.lineWidth = 1.5;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(b.x - Math.cos(ang) * trailLen, b.y - Math.sin(ang) * trailLen);
          ctx.lineTo(b.x + Math.cos(ang) * 3, b.y + Math.sin(ang) * 3);
          ctx.stroke();
          // Tip flash
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(b.x, b.y, 2, 0, Math.PI * 2);
          ctx.fill();
          break;
        }
        case 'missile': {
          // Small triangle + orange exhaust
          ctx.translate(b.x, b.y);
          ctx.rotate(ang + Math.PI / 2);
          // Exhaust
          ctx.fillStyle = 'rgba(255,150,0,0.6)';
          ctx.beginPath();
          ctx.moveTo(-2, 4); ctx.lineTo(0, 10 + Math.random() * 4); ctx.lineTo(2, 4);
          ctx.fill();
          // Body
          ctx.fillStyle = '#ffaa33';
          ctx.shadowColor = '#ff6600';
          ctx.shadowBlur = 6;
          ctx.beginPath();
          ctx.moveTo(0, -s * 1.5); ctx.lineTo(-s * 0.7, s); ctx.lineTo(s * 0.7, s);
          ctx.closePath();
          ctx.fill();
          break;
        }
        case 'gatling': {
          // Small fast yellow dots
          ctx.fillStyle = '#ffee44';
          ctx.shadowColor = '#ffcc00';
          ctx.shadowBlur = 4;
          ctx.beginPath();
          ctx.arc(b.x, b.y, s * 0.7, 0, Math.PI * 2);
          ctx.fill();
          break;
        }
        case 'nova': {
          // Pulsing energy sphere
          const pulse = 0.8 + Math.sin(t * 15 + b.x) * 0.3;
          ctx.fillStyle = `rgba(180,100,255,${0.7 * pulse})`;
          ctx.shadowColor = '#aa66ff';
          ctx.shadowBlur = 14;
          ctx.beginPath();
          ctx.arc(b.x, b.y, s * pulse, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#eeddff';
          ctx.beginPath();
          ctx.arc(b.x, b.y, s * 0.3, 0, Math.PI * 2);
          ctx.fill();
          break;
        }
        default: {
          // Fallback circle
          ctx.fillStyle = '#00ffff';
          ctx.shadowColor = '#00ffff';
          ctx.shadowBlur = 8;
          ctx.beginPath();
          ctx.arc(b.x, b.y, s, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Crit sparkle
      if (b.isCrit) {
        ctx.fillStyle = '#ffffff';
        ctx.globalAlpha = 0.5 + Math.sin(t * 30) * 0.3;
        ctx.beginPath();
        ctx.arc(b.x + (Math.random() - 0.5) * 4, b.y + (Math.random() - 0.5) * 4, 1.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      ctx.shadowBlur = 0;
      ctx.restore();
    }

    // === ENEMY BULLETS ===
    for (const b of State.enemyBullets) {
      const s = b.size;
      ctx.save();

      // Red-orange energy bolt
      const ang = Math.atan2(b.vy, b.vx);
      const trailLen = 8;

      // Trail
      ctx.globalAlpha = 0.4;
      const g = ctx.createLinearGradient(
        b.x - Math.cos(ang) * trailLen, b.y - Math.sin(ang) * trailLen,
        b.x, b.y
      );
      g.addColorStop(0, 'rgba(255,50,0,0)');
      g.addColorStop(1, 'rgba(255,80,20,0.7)');
      ctx.strokeStyle = g;
      ctx.lineWidth = s;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(b.x - Math.cos(ang) * trailLen, b.y - Math.sin(ang) * trailLen);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.globalAlpha = 1;

      // Core
      ctx.fillStyle = '#ff4444';
      ctx.shadowColor = '#ff0000';
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(b.x, b.y, s * 0.7, 0, Math.PI * 2);
      ctx.fill();

      // Hot center
      ctx.fillStyle = '#ffaa66';
      ctx.beginPath();
      ctx.arc(b.x, b.y, s * 0.3, 0, Math.PI * 2);
      ctx.fill();

      ctx.shadowBlur = 0;
      ctx.restore();
    }
  }
};

export default Bullets;
