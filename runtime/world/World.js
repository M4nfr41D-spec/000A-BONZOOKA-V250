// Copyright (c) Manfred Foissner. All rights reserved.
// License: See LICENSE.txt in the project root.

// ============================================================
// World.js - Zone & Enemy Spawn Management
// ============================================================
// Manages current zone, spawns enemies when player approaches

import { State } from '../State.js';
import { MapGenerator } from './MapGenerator.js';
import { Camera } from './Camera.js';
import { SeededRandom } from './SeededRandom.js';
import { DepthRules } from './DepthRules.js';
import { SpatialHash } from '../SpatialHash.js';

// Shared spatial grid – rebuilt every frame in update()
let _grid = null;

export const World = {
  currentZone: null,
  currentAct: null,
  zoneIndex: 0,
  
  // Spatial hash for O(1) collision queries
  get grid() { return _grid; },
  
  // Spawning config
  spawnRadius: 600,      // Distance to trigger spawn
  despawnRadius: 1200,   // Distance to despawn (performance)
  activeEnemies: [],     // Currently active enemies from spawns
  
  // Initialize world with act config
  async init(actId, seed = null) {
    // ── NEW: Tier-based infinite zones ──
    // actId can be a tierId, a legacy actId, or a portal startZone number
    const acts = State.data.acts;
    let startZone = 0;
    let tierConfig = null;

    // Check if called with a portal startZone (number)
    if (typeof actId === 'number') {
      startZone = actId - 1; // convert 1-based depth to 0-based index
      tierConfig = this.getTierForDepth(actId);
    }
    // Check for new tier-based format
    else if (acts?.tiers) {
      const portal = acts.portals?.find(p => p.id === actId || p.tierId === actId);
      if (portal) {
        startZone = (portal.startZone || 1) - 1;
        tierConfig = acts.tiers.find(t => t.id === portal.tierId);
      }
      // Fallback: try legacy act lookup
      if (!tierConfig && acts[actId]) {
        tierConfig = acts[actId];
      }
      // Fallback: first tier
      if (!tierConfig && acts.tiers.length > 0) {
        tierConfig = acts.tiers[0];
      }
    }
    // Legacy: old act-based format
    else if (acts?.[actId]) {
      tierConfig = acts[actId];
    }

    if (!tierConfig) {
      console.error(`No tier/act config found for: ${actId}`);
      return false;
    }

    this.currentAct = { ...tierConfig };
    this.currentAct.id = tierConfig.id || actId;

    // Use provided seed or generate from tier + timestamp
    const actSeed = seed || SeededRandom.fromString(this.currentAct.id + '_' + Date.now());
    this.currentAct.seed = actSeed;

    // Start at the specified zone
    this.zoneIndex = startZone;
    this.loadZone(startZone);
    
    return true;
  },

  /**
   * Get the tier config for a given depth (1-based zone number).
   * Tiers define zone ranges; the last tier extends to infinity.
   */
  getTierForDepth(depth) {
    const tiers = State.data.acts?.tiers;
    if (!tiers || !tiers.length) return this.currentAct; // fallback

    for (let i = tiers.length - 1; i >= 0; i--) {
      if (depth >= tiers[i].zoneStart) return tiers[i];
    }
    return tiers[0];
  },
  
  // Load/generate a zone (endless via depth)
  loadZone(index) {
    // Depth is 1-based
    const depth = index + 1;

    // ── Auto-switch tier based on depth ──
    const newTier = this.getTierForDepth(depth);
    if (newTier && newTier.id !== this.currentAct?.id) {
      console.log(`[WORLD] Tier transition: ${this.currentAct?.name} -> ${newTier.name} at depth ${depth}`);
      const prevSeed = this.currentAct?.seed;
      this.currentAct = { ...newTier };
      this.currentAct.seed = prevSeed; // Keep seed chain continuous

      // Unlock next portal if entering its tier
      const portals = State.data.acts?.portals;
      if (portals) {
        const portal = portals.find(p => p.tierId === newTier.id);
        if (portal && !portal.unlocked) {
          portal.unlocked = true;
          if (!State.meta.portalsUnlocked) State.meta.portalsUnlocked = {};
          State.meta.portalsUnlocked[portal.id] = true;
          State.ui?.showAnnouncement?.('NEW PORTAL UNLOCKED: ' + portal.name);
        }
      }
    }

    const zoneSeed = MapGenerator.createZoneSeed(this.currentAct.seed, index);

    // Hybrid milestone unlocks (weighted randomness)
    DepthRules.maybeUnlock(depth, this.currentAct);
    DepthRules.recordDepth(depth);

    // Boss interval: configurable per tier (default 5)
    const bossInterval = this.currentAct.bossEvery || this.currentAct.zones || 5;
    const isBossZone = (depth % bossInterval) === 0;

    // Sample active modifiers for this zone
    const activeMods = DepthRules.sampleActive(depth, this.currentAct);

    if (isBossZone) {
      this.currentZone = MapGenerator.generateBossZone(this.currentAct, zoneSeed, { depth, mods: activeMods });
    } else {
      this.currentZone = MapGenerator.generate(this.currentAct, zoneSeed, { depth, mods: activeMods });
    }

    this.currentZone.depth = depth;
    this.currentZone.mods = activeMods;

    this.zoneIndex = index;
    this.activeEnemies = [];
    State.world.zoneIndex = index;
    State.world.currentZone = this.currentZone;

    // Position player at spawn
    State.player.x = this.currentZone.spawn.x;
    State.player.y = this.currentZone.spawn.y;
    State.player.vx = 0;
    State.player.vy = 0;

    // Snap camera to player
    const canvas = document.getElementById('gameCanvas');
    const screenW = canvas?.width || 800;
    const screenH = canvas?.height || 600;
    Camera.snapTo(
      State.player.x - screenW / 2,
      State.player.y - screenH / 2
    );

    // Reset zone-combat counters
    this.spawnedEnemyCount = 0;
    this.spawnedEliteCount = 0;
    this.bossSpawned = false;

    // ── AntiExploit: track seed usage for farming detection ──
    try {
      import('../AntiExploit.js').then(mod => {
        if (mod?.AntiExploit) {
          mod.AntiExploit.onZoneEnter(zoneSeed);
          mod.AntiExploit.snapshot();
        }
      });
    } catch (e) { /* AntiExploit not loaded yet – safe to skip */ }
  },
  
  // Update - handle proximity spawning
  update(dt) {
    if (!this.currentZone) return;
    
    const player = State.player;
    
    // Check enemy spawns
    for (const spawn of this.currentZone.enemySpawns) {
      if (spawn.killed) continue;
      
      const dist = Math.hypot(player.x - spawn.x, player.y - spawn.y);
      
      // Spawn if player close
      if (!spawn.active && dist < this.spawnRadius) {
        this.spawnEnemy(spawn, false);
      }
      
      // Despawn if too far (and not engaged)
      if (spawn.active && dist > this.despawnRadius) {
        // Only despawn when the enemy is effectively "idle" at home.
        // If it was engaged, force a return so it doesn't vanish mid-behavior.
        const enemy = State.enemies.find(e => e.id === spawn.enemyId);
        if (enemy) {
          if (enemy.aiState === 'aggro') enemy.aiState = 'return';

          const distHome = Math.hypot(enemy.x - spawn.x, enemy.y - spawn.y);
          const homeThreshold = enemy.returnThreshold || 60;
          if (enemy.aiState !== 'aggro' && distHome <= homeThreshold) {
            this.despawnEnemy(spawn);
          }
        } else {
          this.despawnEnemy(spawn);
        }
      }
    }
    
    // Check elite spawns
    for (const spawn of this.currentZone.eliteSpawns) {
      if (spawn.killed) continue;
      
      const dist = Math.hypot(player.x - spawn.x, player.y - spawn.y);
      
      if (!spawn.active && dist < this.spawnRadius) {
        this.spawnEnemy(spawn, true);
      }
    }
    
    // Check boss spawn
    if (this.currentZone.bossSpawn && !this.currentZone.bossSpawn.killed) {
      const spawn = this.currentZone.bossSpawn;
      const dist = Math.hypot(player.x - spawn.x, player.y - spawn.y);
      
      if (!spawn.active && dist < this.spawnRadius * 1.5) {
        this.spawnBoss(spawn);
      }
    }
    
    // Check exit collision
    if (this.currentZone.exit) {
      const exit = this.currentZone.exit;
      const dist = Math.hypot(player.x - exit.x, player.y - exit.y);
      
      if (dist < 50) {
        this.onExitReached();
      }
    }
    
    // Check portal collision
    for (const portal of this.currentZone.portals) {
      const dist = Math.hypot(player.x - portal.x, player.y - portal.y);
      if (dist < 60) {
        this.onPortalEnter(portal);
      }
    }

    // ── Player vs Obstacle collision (pushback + mine detonation) ──
    const pRadius = player.radius || 15;
    const obstacles = this.currentZone.obstacles;
    if (obstacles) {
      for (let i = obstacles.length - 1; i >= 0; i--) {
        const obs = obstacles[i];
        if (!obs || obs.destroyed) continue;

        const dx = player.x - obs.x;
        const dy = player.y - obs.y;
        const dist = Math.hypot(dx, dy);
        const minDist = pRadius + (obs.radius || 30);

        if (dist < minDist && dist > 0.1) {
          if (obs.type === 'mine') {
            // MINE DETONATION
            const { Player: PlayerMod, Particles: ParticlesMod } = State.modules;
            const dmg = obs.damage || 15;
            if (PlayerMod) PlayerMod.takeDamage(dmg);
            if (ParticlesMod) {
              ParticlesMod.explosion(obs.x, obs.y, '#ff4400', 18);
              ParticlesMod.ring(obs.x, obs.y, '#ffcc00', 45);
              if (ParticlesMod.screenShake != null) ParticlesMod.screenShake = Math.max(ParticlesMod.screenShake || 0, 5);
            }
            obs.destroyed = true;
            // Splash damage to nearby enemies
            for (const e of State.enemies) {
              if (e.dead) continue;
              const eDist = Math.hypot(e.x - obs.x, e.y - obs.y);
              if (eDist < 100) {
                const { Enemies: EnemiesMod } = State.modules;
                if (EnemiesMod) EnemiesMod.damage(e, dmg * 0.6, false);
              }
            }
          } else {
            // SOLID OBSTACLE: push player out
            const overlap = minDist - dist;
            const nx = dx / dist;
            const ny = dy / dist;
            player.x += nx * overlap;
            player.y += ny * overlap;
            // Dampen velocity into the obstacle
            const dot = player.vx * nx + player.vy * ny;
            if (dot < 0) {
              player.vx -= nx * dot * 0.8;
              player.vy -= ny * dot * 0.8;
            }
          }
        }
      }
    }
    
    // Enemy AI (patrol/aggro/return) is handled in Enemies.update() for exploration mode.
    
    // ── Rebuild spatial hash for this frame ──
    // Enemies, asteroids, and player are indexed so Bullets.js
    // can do O(1) proximity queries instead of brute-force O(n²).
    if (!_grid) _grid = SpatialHash.create(128);
    SpatialHash.clear(_grid);
    for (const e of State.enemies) {
      if (!e.dead) SpatialHash.insert(_grid, e);
    }
    const zoneAst = this.currentZone?.asteroids;
    if (Array.isArray(zoneAst)) {
      for (const a of zoneAst) {
        if (a && !a.destroyed) SpatialHash.insert(_grid, a);
      }
    }
    // Expose grid for cross-module queries (Bullets.js)
    State._spatialGrid = _grid;
  },
  
  // Spawn regular enemy
  spawnEnemy(spawn, isElite = false) {
    const { Enemies } = State.modules;
    
    // Calculate level based on player
    const playerLvl = State.meta.level || 1;
    let enemyLvl;
    
    if (isElite) {
      enemyLvl = playerLvl; // Elite = same level
    } else {
      enemyLvl = Math.max(1, playerLvl - 1 - Math.floor(Math.random() * 2));
    }
    
    // Create enemy
    const enemy = Enemies.spawn(spawn.type, spawn.x, spawn.y, isElite, false);
    enemy.spawnRef = spawn;
    enemy.level = enemyLvl;

    // World AI baseline (patrol -> aggro -> return)
    const patrolType = spawn.patrol || (isElite ? 'circle' : 'wander');
    const patrolRadius = spawn.patrolRadius || (isElite ? 140 : 110);

    enemy.homeX = spawn.x;
    enemy.homeY = spawn.y;
    enemy.aiState = 'patrol';
    enemy.patrol = patrolType;
    enemy.patrolRadius = patrolRadius;
    enemy.patrolAngle = Math.random() * Math.PI * 2;
    enemy.patrolDir = Math.random() < 0.5 ? -1 : 1;
    enemy.patrolTimer = 0;
    enemy.wanderTarget = null;
    enemy.wanderTimer = 0;

    // Engagement envelope (tuned for exploration)
    enemy.aggroRange = spawn.aggroRange || (isElite ? 520 : 420);
    enemy.attackRange = spawn.attackRange || enemy.aggroRange;
    enemy.disengageRange = spawn.disengageRange || enemy.aggroRange * 1.65;
    enemy.leashRange = spawn.leashRange || Math.max(enemy.aggroRange * 2.2, patrolRadius * 5);
    enemy.returnThreshold = Math.max(40, enemy.size * 1.2);
    
    // Scale stats by level difference
    const levelScale = Math.pow(1.1, enemyLvl - 1);
    enemy.hp *= levelScale;
    enemy.maxHP *= levelScale;
    enemy.damage *= levelScale;
    enemy.xp = Math.floor(enemy.xp * levelScale);
    
    spawn.active = true;
    spawn.enemyId = enemy.id;
    
    this.activeEnemies.push(enemy);
  },
  
  // Spawn boss
  spawnBoss(spawn) {
    const { Enemies } = State.modules;
    
    const playerLvl = State.meta.level || 1;
    const bossLvl = playerLvl + Math.floor(Math.random() * 6); // +0 to +5
    
    const enemy = Enemies.spawn(spawn.type, spawn.x, spawn.y, false, true);
    enemy.spawnRef = spawn;
    enemy.level = bossLvl;

    // Boss AI baseline
    enemy.homeX = spawn.x;
    enemy.homeY = spawn.y;
    enemy.aiState = 'patrol';
    enemy.patrol = spawn.patrol || 'circle';
    enemy.patrolRadius = spawn.patrolRadius || 220;
    enemy.patrolAngle = Math.random() * Math.PI * 2;
    enemy.patrolDir = 1;
    enemy.patrolTimer = 0;

    enemy.aggroRange = spawn.aggroRange || 750;
    enemy.attackRange = spawn.attackRange || enemy.aggroRange;
    enemy.disengageRange = spawn.disengageRange || enemy.aggroRange * 1.5;
    enemy.leashRange = spawn.leashRange || Math.max(enemy.aggroRange * 2.0, enemy.patrolRadius * 6);
    enemy.returnThreshold = Math.max(60, enemy.size * 1.2);

    // Scale boss
    const levelScale = Math.pow(1.15, bossLvl - 1);
    enemy.hp *= levelScale;
    enemy.maxHP *= levelScale;
    enemy.damage *= levelScale;
    
    spawn.active = true;
    spawn.enemyId = enemy.id;
    
    // Announce boss
    State.ui?.showAnnouncement?.(`[!] ${enemy.name || 'BOSS'} APPEARS!`);
  },
  
  // Despawn enemy (too far)
  despawnEnemy(spawn) {
    // Remove from State.enemies
    const idx = State.enemies.findIndex(e => e.id === spawn.enemyId);
    if (idx !== -1) {
      State.enemies.splice(idx, 1);
    }
    
    spawn.active = false;
    spawn.enemyId = null;
    
    // Remove from active list
    this.activeEnemies = this.activeEnemies.filter(e => e.spawnRef !== spawn);
  },
  
  // Called when enemy dies
  onEnemyKilled(enemy) {
    if (enemy.spawnRef) {
      enemy.spawnRef.killed = true;
      enemy.spawnRef.active = false;
    }
    
    // Check if boss
    if (enemy.isBoss && this.currentZone.bossSpawn) {
      this.onBossKilled();
    }
  },
  
  // Boss killed - spawn portal to NEXT ZONE (not hub!)
  onBossKilled() {
    const nextDepth = this.zoneIndex + 2; // current index + 1 = current depth, +1 = next
    State.ui?.showAnnouncement?.('BOSS DEFEATED! Portal to Zone ' + nextDepth);
    
    // Spawn portal that advances to next zone
    this.currentZone.portals.push({
      x: this.currentZone.width / 2,
      y: this.currentZone.height / 2,
      destination: 'nextZone',
      type: 'victory'
    });

    // Also grant option to return to hub (small side portal)
    this.currentZone.portals.push({
      x: this.currentZone.width / 2 - 120,
      y: this.currentZone.height / 2 + 80,
      destination: 'hub',
      type: 'hub'
    });
  },
  
  // Player reached zone exit
  onExitReached() {
    const nextZone = this.zoneIndex + 1;
    State.meta.highestZone = Math.max(State.meta.highestZone || 0, nextZone + 1);
    this.loadZone(nextZone);
  },
  
  // Player entered portal
  onPortalEnter(portal) {
    if (portal.destination === 'hub') {
      // Transition to hub — save progress first
      State.meta.highestZone = Math.max(State.meta.highestZone || 0, this.zoneIndex + 1);
      State.scene = 'hub';
      State.ui?.renderHub?.();
    } else if (portal.destination === 'nextZone') {
      // Advance to next zone (endless progression!)
      const nextIndex = this.zoneIndex + 1;
      console.log(`[WORLD] Portal -> Zone ${nextIndex + 1}`);
      this.loadZone(nextIndex);
    } else if (typeof portal.destination === 'number') {
      // Jump to specific zone depth
      this.loadZone(portal.destination - 1);
    } else if (portal.destination) {
      // Load specific act/zone (legacy)
      this.init(portal.destination);
    }
  },
  
  // Update enemy patrol behavior
  updateEnemyPatrols(dt) {
    for (const enemy of this.activeEnemies) {
      if (!enemy.patrol || enemy.dead) continue;
      
      switch (enemy.patrol) {
        case 'circle':
          enemy.patrolAngle += dt * 0.5;
          enemy.x = enemy.patrolOrigin.x + Math.cos(enemy.patrolAngle) * enemy.patrolRadius;
          enemy.y = enemy.patrolOrigin.y + Math.sin(enemy.patrolAngle) * enemy.patrolRadius;
          break;
          
        case 'line':
          enemy.patrolAngle += dt * 0.8;
          enemy.x = enemy.patrolOrigin.x + Math.sin(enemy.patrolAngle) * enemy.patrolRadius;
          break;
          
        case 'wander':
          // Random direction changes
          if (Math.random() < dt * 0.5) {
            enemy.vx = (Math.random() - 0.5) * enemy.speed;
            enemy.vy = (Math.random() - 0.5) * enemy.speed;
          }
          // Stay near origin
          const dist = Math.hypot(
            enemy.x - enemy.patrolOrigin.x,
            enemy.y - enemy.patrolOrigin.y
          );
          if (dist > enemy.patrolRadius) {
            const angle = Math.atan2(
              enemy.patrolOrigin.y - enemy.y,
              enemy.patrolOrigin.x - enemy.x
            );
            enemy.vx = Math.cos(angle) * enemy.speed * 0.5;
            enemy.vy = Math.sin(angle) * enemy.speed * 0.5;
          }
          break;
      }
    }
  },
  
  // Draw zone elements (obstacles, decorations)
  draw(ctx, screenW, screenH) {
    if (!this.currentZone) return;
    // Draw decorations (behind everything)
    for (const dec of this.currentZone.decorations) {
      if (!Camera.isVisible(dec.x, dec.y, 200, screenW, screenH)) continue;
      
      ctx.globalAlpha = dec.alpha;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(dec.x, dec.y, 5 * dec.scale, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    
    // Draw obstacles
    for (const obs of this.currentZone.obstacles) {
      if (!Camera.isVisible(obs.x, obs.y, 100, screenW, screenH)) continue;
      
      ctx.save();
      ctx.translate(obs.x, obs.y);
      ctx.rotate(obs.rotation || 0);
      
      // Draw based on type
      switch (obs.type) {
        case 'asteroid': {
          // Multi-layer asteroid with craters
          const r = obs.radius;
          // Base shape (irregular circle via noise)
          const grad = ctx.createRadialGradient(r * 0.3, -r * 0.3, r * 0.1, 0, 0, r);
          grad.addColorStop(0, '#8899aa');
          grad.addColorStop(0.6, '#556677');
          grad.addColorStop(1, '#334455');
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(0, 0, r, 0, Math.PI * 2);
          ctx.fill();
          // Crater marks
          ctx.fillStyle = 'rgba(0,0,0,0.2)';
          ctx.beginPath(); ctx.arc(r * 0.3, r * 0.2, r * 0.25, 0, Math.PI * 2); ctx.fill();
          ctx.beginPath(); ctx.arc(-r * 0.2, -r * 0.3, r * 0.15, 0, Math.PI * 2); ctx.fill();
          // Edge highlight
          ctx.strokeStyle = 'rgba(150,170,190,0.3)';
          ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.arc(0, 0, r, -0.5, 1.2); ctx.stroke();
          break;
        }
        case 'debris': {
          // Tumbling metal shard
          const r = obs.radius;
          ctx.fillStyle = '#556677';
          ctx.beginPath();
          ctx.moveTo(-r, -r * 0.3);
          ctx.lineTo(-r * 0.3, -r * 0.6);
          ctx.lineTo(r * 0.8, -r * 0.2);
          ctx.lineTo(r, r * 0.5);
          ctx.lineTo(-r * 0.5, r * 0.4);
          ctx.closePath();
          ctx.fill();
          ctx.strokeStyle = '#778899';
          ctx.lineWidth = 1;
          ctx.stroke();
          break;
        }
        case 'mine': {
          // Pulsing danger mine
          const pulse = 0.8 + Math.sin(Date.now() * 0.005) * 0.2;
          const r = obs.radius;
          ctx.fillStyle = '#cc2222';
          ctx.shadowColor = '#ff4444';
          ctx.shadowBlur = 12 * pulse;
          ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
          // Danger symbol - inner ring
          ctx.strokeStyle = '#ffcc00';
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(0, 0, r * 0.55, 0, Math.PI * 2); ctx.stroke();
          // Core
          ctx.fillStyle = '#ffdd00';
          ctx.beginPath(); ctx.arc(0, 0, r * 0.25, 0, Math.PI * 2); ctx.fill();
          ctx.shadowBlur = 0;
          break;
        }
        case 'pillar': {
          // Ancient pillar / space station ruin
          const r = obs.radius;
          const grad = ctx.createRadialGradient(0, 0, r * 0.2, 0, 0, r);
          grad.addColorStop(0, '#99aabb');
          grad.addColorStop(1, '#556677');
          ctx.fillStyle = grad;
          ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
          // Ring detail
          ctx.strokeStyle = '#aabbcc';
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(0, 0, r * 0.7, 0, Math.PI * 2); ctx.stroke();
          ctx.strokeStyle = 'rgba(0,200,255,0.15)';
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.arc(0, 0, r * 0.85, 0, Math.PI * 2); ctx.stroke();
          break;
        }
      }
      
      ctx.restore();
    }
    
    // Draw exit marker
    if (this.currentZone.exit) {
      const exit = this.currentZone.exit;
      const t = Date.now() * 0.001;
      const pulse = 0.7 + Math.sin(t * 3) * 0.3;
      // Outer glow ring
      ctx.strokeStyle = 'rgba(0,255,136,0.3)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(exit.x, exit.y, 38 + Math.sin(t * 2) * 4, 0, Math.PI * 2);
      ctx.stroke();
      // Main circle
      const exitGrad = ctx.createRadialGradient(exit.x, exit.y, 5, exit.x, exit.y, 30);
      exitGrad.addColorStop(0, 'rgba(0,255,180,0.8)');
      exitGrad.addColorStop(0.7, 'rgba(0,200,100,0.4)');
      exitGrad.addColorStop(1, 'rgba(0,100,50,0)');
      ctx.fillStyle = exitGrad;
      ctx.shadowColor = '#00ff88';
      ctx.shadowBlur = 25 * pulse;
      ctx.beginPath();
      ctx.arc(exit.x, exit.y, 30, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      // Label
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 12px Orbitron';
      ctx.textAlign = 'center';
      ctx.fillText('EXIT', exit.x, exit.y + 4);
    }
    
    // Draw portals
    for (const portal of this.currentZone.portals) {
      const t = Date.now() * 0.001;
      const pulse = Math.sin(t * 2.5) * 0.3 + 0.7;
      const isHub = portal.type === 'hub' || portal.destination === 'hub';
      const isVictory = portal.type === 'victory';
      const baseR = isHub ? 22 : 36;
      const r = baseR * (0.9 + pulse * 0.1);

      const color = isVictory ? '#ffdd00' : (isHub ? '#4488cc' : '#8800ff');
      const colorDim = isVictory ? 'rgba(255,200,0,0)' : (isHub ? 'rgba(60,120,200,0)' : 'rgba(100,0,200,0)');

      // Swirl rings (rotating)
      ctx.save();
      ctx.translate(portal.x, portal.y);
      for (let ring = 0; ring < 3; ring++) {
        const ringR = r + ring * 6;
        const ringAlpha = 0.15 - ring * 0.04;
        ctx.globalAlpha = ringAlpha * pulse;
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(0, 0, ringR, t * (1 + ring * 0.5), t * (1 + ring * 0.5) + Math.PI * 1.3);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      // Core gradient
      const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(0.3, color);
      grad.addColorStop(1, colorDim);
      ctx.fillStyle = grad;
      ctx.shadowColor = color;
      ctx.shadowBlur = 30 * pulse;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Label
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold ' + (isHub ? '9' : '11') + 'px Orbitron';
      ctx.textAlign = 'center';
      const label = isHub ? 'HUB' : ('ZONE ' + (this.zoneIndex + 2));
      ctx.fillText(label, 0, 4);
      ctx.restore();
    }
  },
  
  // Draw parallax background layers
  drawParallaxBackground(ctx, screenW, screenH) {
    if (!this.currentZone?.parallax) return;
    
    const parallax = this.currentZone.parallax;
    const camX = Camera.getX();
    const camY = Camera.getY();
    
    // Layer 0: Background color
    ctx.fillStyle = parallax.background.color;
    ctx.fillRect(0, 0, screenW, screenH);
    
    // Layer 0: Deep stars
    const bgOffsetX = camX * parallax.background.scrollSpeed;
    const bgOffsetY = camY * parallax.background.scrollSpeed;
    
    ctx.fillStyle = '#ffffff';
    for (const star of parallax.background.stars) {
      const x = ((star.x - bgOffsetX) % screenW + screenW) % screenW;
      const y = ((star.y - bgOffsetY) % screenH + screenH) % screenH;
      
      let brightness = star.brightness;
      if (star.twinkle) {
        brightness *= 0.5 + Math.sin(Date.now() / 500 + star.x) * 0.5;
      }
      
      ctx.globalAlpha = brightness;
      ctx.beginPath();
      ctx.arc(x, y, star.size, 0, Math.PI * 2);
      ctx.fill();
    }
    
    // Layer 1: Mid stars
    const midOffsetX = camX * parallax.midground.scrollSpeed;
    const midOffsetY = camY * parallax.midground.scrollSpeed;
    
    for (const star of parallax.midground.stars) {
      const x = ((star.x - midOffsetX) % screenW + screenW) % screenW;
      const y = ((star.y - midOffsetY) % screenH + screenH) % screenH;
      
      ctx.globalAlpha = star.brightness;
      ctx.beginPath();
      ctx.arc(x, y, star.size * 1.2, 0, Math.PI * 2);
      ctx.fill();
    }
    
    ctx.globalAlpha = 1;
  },

  drawParallaxForeground(ctx, screenW, screenH) {
    if (!this.currentZone?.parallax) return;
    
    const parallax = this.currentZone.parallax;
    const camX = Camera.getX();
    const camY = Camera.getY();
    
        // Layer 2: Nebula wisps
    if (parallax.foreground.objects) {
      const fgOffsetX = camX * parallax.foreground.scrollSpeed;
      const fgOffsetY = camY * parallax.foreground.scrollSpeed;
      
      for (const wisp of parallax.foreground.objects) {
        const x = wisp.x - fgOffsetX;
        const y = wisp.y - fgOffsetY;
        
        ctx.globalAlpha = wisp.alpha;
        ctx.fillStyle = wisp.color;
        ctx.beginPath();
        ctx.ellipse(x, y, wisp.width / 2, wisp.height / 2, wisp.rotation, 0, Math.PI * 2);
        ctx.fill();
      }
      
      ctx.globalAlpha = 1;
    }
  },

  drawParallax(ctx, screenW, screenH) {
    // Back-compat: some callers still use drawParallax()
    this.drawParallaxBackground(ctx, screenW, screenH);
    this.drawParallaxForeground(ctx, screenW, screenH);
  }
};

export default World;