<!-- Copyright (c) Manfred Foissner. All rights reserved. License: See LICENSE.txt -->

# BONZOOKAA v2.5 - Exploration ARPG Roadmap

## &#x2705; PHASE 1: Core Architecture (DONE)

| System | File | Status |
|--------|------|--------|
| Seeded Random | `runtime/world/SeededRandom.js` | &#x2705; |
| Camera System | `runtime/world/Camera.js` | &#x2705; |
| Map Generator | `runtime/world/MapGenerator.js` | &#x2705; |
| World Manager | `runtime/world/World.js` | &#x2705; |
| Scene Manager | `runtime/world/SceneManager.js` | &#x2705; |
| Background System | `runtime/world/Background.js` | &#x2705; |
| Depth Rules | `runtime/world/DepthRules.js` | &#x2705; |
| Acts/Tiers Config | `data/acts.json` | &#x2705; |
| Hub Modal | `index.html` | &#x2705; |
| Game Loop | `main.js` | &#x2705; |
| Enemy Level Scaling | `runtime/Enemies.js` | &#x2705; |
| Spatial Hash | `runtime/SpatialHash.js` | &#x2705; |
| Loot System | `runtime/Items.js` | &#x2705; |
| Affix System | `data/affixes.json` | &#x2705; |
| Rarity Tiers | `data/rarities.json` | &#x2705; |
| Skill Trees | `data/skills.json` | &#x2705; |
| Pilot Stats | `data/pilotStats.json` | &#x2705; |
| Save/Load | `runtime/Save.js` | &#x2705; |
| Contracts | `runtime/Contracts.js` | &#x2705; |
| Crafting System | `data/crafting.json` | &#x2705; |
| Vendor System | `index.html` (modal) | &#x2705; |

---

## &#x2705; PHASE 2: Infinite Progression (DONE - v2.4.0)

| Feature | Status |
|---------|--------|
| Tier-based portals (P1: Z1-100, P2: Z101-250, P3: Z251+&#x221E;) | &#x2705; |
| Boss spawns TWO portals (gold next + blue hub) | &#x2705; |
| Auto-tier biome switching | &#x2705; |
| Difficulty scaling per depth | &#x2705; |

---

## &#x2705; PHASE 2.5: Data Integrity (DONE - v2.4.1)

| Fix | Status |
|-----|--------|
| JSON emoji decoding (8 files, 354+ unicode escapes) | &#x2705; |
| Hold-to-repeat stat/skill allocation | &#x2705; |
| Stash auto-refresh on pickup | &#x2705; |
| Console.log cleanup (13 files) | &#x2705; |

---

## &#x2705; PHASE 3: Visual Overhaul (DONE - v2.5.0)

| System | Changes | Status |
|--------|---------|--------|
| Player ship | Multi-layer hull/wings, dual engines, cockpit, nav lights, thrust lerp, damage flash | &#x2705; |
| Bullets | 6 weapon types (laser, plasma, railgun, missile, gatling, nova) + crit sparkle | &#x2705; |
| Enemy bullets | Gradient trail + hot center | &#x2705; |
| Particles | Screen shake, flash FX, expanding rings, float-up, drag | &#x2705; |
| Enemies | Rotating shapes, elite pulse, boss double-hex with eye, gradient HP bars, name tags | &#x2705; |
| Obstacles | Crater asteroids, metal debris, pulsing mines, ancient pillars | &#x2705; |
| Portals | Swirling arc rings, radial gradient core, animated glow | &#x2705; |
| Shield | Hex-bubble outline + glow ring | &#x2705; |
| Combat UI | Compact panels (195px/210px), ~20% more canvas, no-scroll at 1080p | &#x2705; |

---

## &#x1F527; PHASE 4: Combat Systems (NEXT)

### 4.1 Collision System
- [ ] Player vs Obstacles (slide/bounce)
- [ ] Bullets vs Obstacles (destroy/block)
- [ ] Enemy vs Obstacles (pathfinding)
- [ ] Mine explosion on contact
- [ ] Destroyable asteroids (drop scrap)

### 4.2 Enemy AI Improvements
- [ ] Aggro radius detection
- [ ] Chase + disengage behavior
- [ ] Boss phase transitions (HP thresholds)
- [ ] Boss add spawning
- [ ] Group coordination (pack AI)

### 4.3 Drone System (Player Companion)
- [ ] Drone item slot
- [ ] Combat drone (auto-fire at nearest)
- [ ] Shield drone (absorb hits)
- [ ] Repair drone (heal over time)
- [ ] Drone visual: small orbiting sprite

---

## &#x1F3AE; PHASE 5: Content Expansion

### 5.1 More Enemy Types
- [ ] Bomber (area denial mines)
- [ ] Cloaker (invisible until close)
- [ ] Summoner (spawns minions)
- [ ] Turret (stationary, high damage)
- [ ] Shielder (projects barrier)

### 5.2 More Biomes / Act Tiers
- [ ] Derelict Fleet (T2)
- [ ] Black Hole Approach (T3)
- [ ] Enemy Mothership (T3 boss)
- [ ] Unique tileset per biome
- [ ] Biome-specific hazards

### 5.3 Unique/Legendary Items
- [ ] Build-enabling uniques
- [ ] Unique drop rules (boss-only, depth-gated)
- [ ] Set items (2pc/4pc bonuses)
- [ ] Chase items with extremely low drop rates

---

## &#x1F50A; PHASE 6: Audio

### 6.1 Sound Effects
```
assets/audio/sfx/
  sfx_shoot_laser.wav
  sfx_shoot_plasma.wav
  sfx_shoot_railgun.wav
  sfx_hit_enemy.wav
  sfx_hit_player.wav
  sfx_explosion.wav
  sfx_explosion_big.wav
  sfx_pickup_item.wav
  sfx_pickup_health.wav
  sfx_portal_enter.wav
  sfx_boss_spawn.wav
  sfx_level_up.wav
  sfx_shield_break.wav
```

### 6.2 Music
```
assets/audio/music/
  music_hub.mp3
  music_combat_t1.mp3
  music_combat_t2.mp3
  music_boss.mp3
```

### 6.3 Audio Manager
- [ ] `runtime/Audio.js` - volume, crossfade, spatial
- [ ] Mute/unmute toggle
- [ ] SFX pooling (prevent overlap spam)

---

## &#x2699; PHASE 7: Performance & Polish

### 7.1 Render Optimization
- [ ] Object pooling (bullets, particles)
- [ ] Batch rendering (same-type draws)
- [ ] Offscreen canvas for static BG
- [ ] Particle LOD (reduce at high count)

### 7.2 Save System Enhancement
- [ ] Multiple save slots
- [ ] Export/import save (JSON)
- [ ] Autosave indicator
- [ ] Save migration (old mojibake items)

### 7.3 Settings Menu
- [ ] Volume sliders
- [ ] Screen shake toggle
- [ ] Damage numbers toggle
- [ ] Minimap size

---

## &#x1F3C6; PHASE 8: Endgame

### 8.1 Map Modifiers (PoE-style)
- [ ] Zone affixes (+damage, +speed, reflect, etc.)
- [ ] Risk/reward: harder mods = better loot
- [ ] Corruption system (stackable difficulty)

### 8.2 Endless Leaderboard
- [ ] Deepest zone reached
- [ ] Fastest boss kill
- [ ] Most damage dealt (per run)
- [ ] Local storage leaderboard

### 8.3 Prestige / New Game+
- [ ] Permanent stat bonuses on reset
- [ ] Unlockable ship skins
- [ ] Achievement system

---

## Priority Matrix

| Phase | Priority | Effort | Impact |
|-------|----------|--------|--------|
| 4.1 Collision | &#x1F534; HIGH | Medium | High |
| 4.2 Enemy AI | &#x1F534; HIGH | Medium | High |
| 4.3 Drones | &#x1F7E1; MED | Medium | High |
| 5.1 Enemies | &#x1F7E1; MED | Medium | High |
| 6.1 SFX | &#x1F7E1; MED | Low | High |
| 5.3 Uniques | &#x1F7E2; LOW | Medium | Medium |
| 7.1 Perf | &#x1F7E2; LOW | High | Medium |
| 8.1 Map Mods | &#x1F7E2; LOW | High | High |

---

## File Structure (v2.5.0)

```
bonzookaa/
  index.html              # Main HTML + CSS + modals
  main.js                 # Game loop + render pipeline
  runtime/
    State.js              # Global state singleton
    DataLoader.js         # JSON asset loading
    Save.js               # localStorage persistence
    Stats.js              # Computed stat engine
    Leveling.js           # XP curves + level ups
    Items.js              # Item generation + affixes
    Player.js             # Ship logic + draw (v2.5.0)
    Enemies.js            # AI + draw (v2.5.0)
    Bullets.js            # Projectiles + weapon visuals (v2.5.0)
    Pickups.js            # Drop collection
    Particles.js          # VFX engine (v2.5.0)
    Input.js              # Keyboard + mouse
    UI.js                 # HTML panel rendering
    Invariants.js         # Debug assertions
    Contracts.js          # Mission/quest system
    SpatialHash.js        # Collision grid
    world/
      index.js
      SeededRandom.js
      Camera.js
      MapGenerator.js
      World.js            # Obstacles + portals (v2.5.0)
      SceneManager.js
      Background.js       # Tiled terrain + fog + deco
      DepthRules.js
  data/
    config.json
    acts.json
    enemies.json
    items.json
    affixes.json
    skills.json
    pilotStats.json
    rarities.json
    runUpgrades.json
    slots.json
    crafting.json
    uniques.json
    packs.json
  assets/
    backgrounds/          # Tile textures
    fog/                  # Fog overlays
    asteroids_deco/       # Decorative sprites
    sprites/              # Enemy/player sprites
    audio/                # (Future)
```

---

## Version History

| Version | Date | Summary |
|---------|------|---------|
| v2.0.0 | 2025-01 | Core exploration mode |
| v2.3.0 | 2026-02 | Tier portals, background system |
| v2.4.0 | 2026-02-23 | Infinite zones, emoji HTML fix, UI overflow |
| v2.4.1 | 2026-02-23 | JSON emoji decode, hold-repeat, stash refresh |
| v2.5.0 | 2026-02-23 | Full visual overhaul (ship, bullets, particles, enemies, portals, compact UI) |

---

*Last updated: 2026-02-23*
