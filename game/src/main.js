import * as T from 'three';
import { createMap } from './map.js';
import { createInput } from './input.js';
import { createPlayer } from './player.js';
import { createBots } from './bots.js';
import { createWeapon, GUNS } from './weapons.js';
import { createHud } from './hud.js';
import { createEconomy, PRICES } from './economy.js';
import { createSim } from './sim.js';
import { audio } from './audio.js';
import { rng, clamp } from './utils.js';

// Deterministic demo setup and renderer.
const params = new URLSearchParams(location.search);
const shot = params.get('shot');
const random = rng(Number(params.get('seed')) || 1);
const renderer = new T.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
document.querySelector('#game').append(renderer.domElement);

const scene = new T.Scene();
const camera = new T.PerspectiveCamera(72, innerWidth / innerHeight, 0.1, 150);
scene.add(camera);
const map = createMap(scene);
const player = createPlayer();
const bots = createBots(scene, map.waypoints, random, map.waypointEdges);
const weapon = createWeapon(scene);
const hud = createHud();
const input = createInput(renderer.domElement);
const economy = createEconomy();
const sim = createSim();
const sound = audio();

// Match state shared by player, bots, rounds, and HUD.
const playerTeam = 'blue';
const playerSpawn = { x: 0, y: 0, z: 32 };
const bombSpot = { A: { x: -25, z: -24 }, B: { x: 25, z: 24 } };
const targetMeshes = [];
const feed = [];
let kills = 0;
let deaths = 0;
let buyOpen = false;
let scopeOpen = false;
let smokeCount = 0;
let flashCount = 0;
let hasKit = false;
let lossStreak = 0;
let plantProgress = 0;
let defuseProgress = 0;
let lastPhase = sim.rounds.phase;
let accumulator = 0;
let previousTime = performance.now();
let footstepTimer = 0;

// Bot mesh ownership supports hit location, team checks, and name display.
for (const bot of bots) {
  bot.g.traverse((mesh) => {
    if (mesh.isMesh) {
      mesh.userData.bot = bot;
      targetMeshes.push(mesh);
    }
  });
}

const tracerRay = new T.Raycaster();
tracerRay.far = 100;
const vector = new T.Vector3();
const rayDirection = new T.Vector3();

// Damage, armor, death, and kill-feed rules.
function addFeed(killer, gun, victim) {
  feed.unshift(`${killer}  ›  ${gun}  ›  ${victim}`);
  if (feed.length > 5) feed.length = 5;
}

function damageBot(bot, amount, shooter, gun) {
  if (!bot.alive || bot.team === shooter.team) return;
  bot.hp -= amount;
  if (bot.hp > 0) return;
  bot.alive = false;
  bot.g.visible = false;
  const killer = shooter === player ? 'YOU' : shooter.name;
  addFeed(killer, gun, bot.name);
  if (shooter === player) {
    kills += 1;
    economy.money += 300;
    hud.kill();
  }
}

function damagePlayer(amount, shooter, point) {
  if (player.health <= 0) return;
  const absorbed = Math.min(player.armor, amount * 0.65);
  player.armor -= absorbed;
  player.health = Math.max(0, player.health - (amount - absorbed));
  hud.damage(Math.atan2(point.x - player.p.x, point.z - player.p.z) - player.yaw);
  sound.play('hurt');
  if (player.health <= 0) {
    player.health = 0;
    deaths += 1;
    addFeed(shooter.name, shooter.gun || 'Rifle', 'YOU');
  }
}

function zoneDamage(mesh, baseDamage, armored) {
  const bot = mesh.userData.bot;
  if (!bot) return baseDamage;
  if (mesh.userData.zone === 'head') return baseDamage * (armored ? 2 : 4);
  if (mesh.userData.zone === 'legs') return baseDamage * 0.75;
  return baseDamage;
}

// Bullet line-of-sight checks respect map cover and active smoke clouds.
function blocked(from, to) {
  vector.subVectors(to, from);
  const distance = vector.length();
  if (!distance) return false;
  rayDirection.copy(vector).normalize();
  tracerRay.set(from, rayDirection);
  tracerRay.far = distance;
  if (tracerRay.intersectObjects(map.solids, false).length) return true;
  return weapon.smokes.some((cloud) => {
    const center = cloud.mesh.position;
    const t = clamp(vector.copy(center).sub(from).dot(rayDirection), 0, distance);
    return center.distanceToSquared(from.clone().addScaledVector(rayDirection, t)) < cloud.radius * cloud.radius;
  });
}

function muzzlePosition(actor, out) {
  if (actor === player) {
    camera.getWorldPosition(out);
    return out;
  }
  return out.set(actor.g.position.x, actor.g.position.y + 1.35, actor.g.position.z);
}

function fireActor(actor, target, isPlayer = false) {
  if (isPlayer) {
    if (!weapon.canFire) return false;
    const definition = GUNS[weapon.kind] || GUNS.Rifle;
    const start = camera.position.clone();
    camera.getWorldDirection(rayDirection);
    const spread = weapon.spread(Math.hypot(player.v.x, player.v.z), !player.onGround);
    rayDirection.x += (random() - 0.5) * spread;
    rayDirection.y += (random() - 0.5) * spread;
    rayDirection.z += (random() - 0.5) * spread;
    rayDirection.normalize();
    tracerRay.set(start, rayDirection);
    tracerRay.far = 90;
    const botHit = tracerRay.intersectObjects(targetMeshes, false).find((entry) => entry.object.userData.bot?.alive);
    const wallHit = tracerRay.intersectObjects(map.solids, false)[0];
    const hit = botHit && (!wallHit || botHit.distance < wallHit.distance) ? botHit : null;
    const end = hit ? hit.point : wallHit ? wallHit.point : start.clone().addScaledVector(rayDirection, 90);
    weapon.tracer(start, end, '#ffd27c');
    sound.play('shot');
    if (hit) {
      const bot = hit.object.userData.bot;
      if (bot.team !== actor.team) {
        const head = hit.object.userData.zone === 'head';
        damageBot(bot, zoneDamage(hit.object, definition[2], head && bot.armor > 0), actor, weapon.kind);
        hud.hit(!bot.alive);
      }
    }
    weapon.consume();
    weapon.kick(player);
    return true;
  }
  if (!target) return false;
  const gun = isPlayer ? weapon.kind : actor.gun;
  const definition = GUNS[gun] || GUNS.Rifle;
  const start = muzzlePosition(actor, new T.Vector3());
  const aimAt = target === player
    ? new T.Vector3(player.p.x, player.p.y + 1.35, player.p.z)
    : new T.Vector3(target.g.position.x, target.g.position.y + 1.2, target.g.position.z);
  if (blocked(start, aimAt)) return false;
  rayDirection.subVectors(aimAt, start).normalize();
  const spread = isPlayer
    ? weapon.spread(Math.hypot(player.v.x, player.v.z), !player.onGround)
    : actor.error * (1 + start.distanceTo(aimAt) * 0.014);
  rayDirection.x += (random() - 0.5) * spread;
  rayDirection.y += (random() - 0.5) * spread;
  rayDirection.z += (random() - 0.5) * spread;
  rayDirection.normalize();
  const end = start.clone().addScaledVector(rayDirection, 90);
  tracerRay.set(start, rayDirection);
  tracerRay.far = 90;
  const candidates = target === player ? [] : targetMeshes;
  const hit = tracerRay.intersectObjects(candidates, false).find((entry) => entry.object.userData.bot?.alive);
  if (hit) end.copy(hit.point);
  else if (target === player) end.copy(aimAt);
  weapon.tracer(start, end, isPlayer ? '#ffd27c' : '#ff7358');
  sound.play('shot');
  if (target === player && rayDirection.distanceTo(aimAt.clone().sub(start).normalize()) < 0.14) {
    damagePlayer(definition[2], actor, start);
  } else if (hit) {
    const bot = hit.object.userData.bot;
    if (bot.team !== actor.team) {
      const head = hit.object.userData.zone === 'head';
      const damage = zoneDamage(hit.object, definition[2], head && bot.armor > 0);
      damageBot(bot, damage, actor, gun);
      if (isPlayer) hud.hit(bot.hp <= 0);
    }
  }
  if (isPlayer) {
    weapon.consume();
    weapon.kick(player);
  }
  return true;
}

// Round transitions revive players and bots, then award the previous result.
function resetRound() {
  player.p.x = playerSpawn.x;
  player.p.y = playerSpawn.y;
  player.p.z = playerSpawn.z;
  player.v.x = player.v.y = player.v.z = 0;
  player.health = 100;
  player.armor = player.hasArmor ? 100 : 0;
  player.alive = true;
  player.yaw = 0;
  player.pitch = 0;
  plantProgress = 0;
  defuseProgress = 0;
  weapon.resetMagazine();
  weapon.clearGrenades();
  for (const bot of bots) {
    bot.kit = bot.money >= 400;
    if (bot.kit) bot.money -= 400;
    if (bot.money >= 4750 && random() < 0.25) {
      bot.gun = 'Sniper';
      bot.money -= 4750;
    } else if (bot.money >= 2700) {
      bot.gun = 'Rifle';
      bot.money -= 2700;
    } else if (bot.money >= 1500) {
      bot.gun = 'SMG';
      bot.money -= 1500;
    } else {
      bot.gun = 'Pistol';
    }
    bot.alive = true;
    bot.hp = 100;
    bot.g.visible = true;
    bot.g.position.set(bot.spawn.x, 0, bot.spawn.z);
    bot.target = null;
    bot.objective = null;
    bot.reactionLeft = 0;
    bot.fireLeft = random() * 0.5;
  }
}

function awardRound(winner) {
  const playerWon = (winner === playerTeam);
  if (playerWon) {
    economy.money += 3250;
    lossStreak = 0;
  } else {
    economy.money += 1900 + (lossStreak > 0 ? 500 : 0);
    lossStreak += 1;
  }
  for (const bot of bots) {
    bot.money += bot.team === winner ? 3250 : 1900;
  }
}

// Objective interaction is held on the site and can be interrupted by moving.
function updateObjective(dt) {
  const r = sim.rounds;
  if (r.phase !== 'live') return;
  const site = Object.entries(bombSpot).find(([, p]) => Math.hypot(player.p.x - p.x, player.p.z - p.z) < 5);
    if (!r.bomb && input.state.keys.has('KeyE') && site) {
    plantProgress += dt;
    if (plantProgress >= 5) {
      r.plant(site[0], 40);
      weapon.setBombMarker(bombSpot[site[0]].x, bombSpot[site[0]].z);
      plantProgress = 0;
      sound.play('beep');
    }
  } else plantProgress = 0;
  if (r.bomb && r.site) {
    const p = bombSpot[r.site];
    const near = Math.hypot(player.p.x - p.x, player.p.z - p.z) < 3;
    if (input.state.keys.has('KeyE') && near) {
      defuseProgress += dt;
      if (defuseProgress >= (hasKit ? 2.5 : 5)) {
        r.finish('red');
        defuseProgress = 0;
      }
    } else defuseProgress = 0;
  }
  for (const bot of bots) {
    if (!bot.alive || !bot.objective) continue;
    bot.objective.progress += dt;
      const duration = bot.objective.action === 'defuse' && bot.kit ? 2.5 : 5;
      if (bot.objective.progress >= duration) {
      if (bot.objective.action === 'plant') {
        r.plant(bot.objective.site, 40);
        weapon.setBombMarker(bombSpot[bot.objective.site].x, bombSpot[bot.objective.site].z);
      } else r.finish('red');
      bot.objective = null;
    }
  }
}

// Economy purchases update equipment only when the balance covers the full price.
function purchase(name) {
  if (!economy.buy(name)) return;
  if (GUNS[name]) weapon.equip(name);
  if (name === 'Kevlar') {
    player.hasArmor = true;
    player.armor = 100;
  }
  if (name === 'Defuse kit') hasKit = true;
  if (name === 'Smoke') smokeCount += 1;
  if (name === 'Flash') flashCount += 1;
}

function updateBuyKeys() {
  if (input.pressed('KeyB') && sim.rounds.phase === 'freeze') buyOpen = !buyOpen;
  if (!buyOpen || sim.rounds.phase !== 'freeze') return;
  const choices = ['Pistol', 'SMG', 'Rifle', 'Sniper', 'Kevlar', 'Defuse kit', 'Smoke', 'Flash'];
  for (let i = 0; i < choices.length; i += 1) {
    if (input.pressed(`Digit${i + 1}`)) purchase(choices[i]);
  }
}

// Fixed 60 Hz simulation, bot tactics, combat, grenades, and round state.
function step(dt) {
  const r = sim.rounds;
  const look = input.look();
  if (r.phase === 'live' && player.health > 0) player.step(dt, input.state.keys, look, map.colliders);
  else if (input.state.locked) player.step(dt, new Set(), look, map.colliders);
  weapon.tick(dt);
  footstepTimer -= dt;
  if (player.health > 0 && Math.hypot(player.v.x, player.v.z) > 1.5 && player.onGround && footstepTimer <= 0) {
    sound.play('step');
    footstepTimer = input.state.keys.has('ShiftLeft') ? 0.6 : 0.36;
  }
  weapon.tickGrenades(dt, sound);
  if (weapon.flashLeft > 0) {
    camera.getWorldDirection(rayDirection);
    vector.subVectors(weapon.flashOrigin, camera.position).normalize();
    hud.flash(rayDirection.dot(vector) > 0.15);
  } else {
    hud.flash(false);
  }
  updateBuyKeys();
  updateObjective(dt);

  for (const bot of bots) {
    if (!bot.alive || r.phase !== 'live') continue;
    const opponents = bot.team === playerTeam ? bots.filter((other) => other.alive && other.team !== playerTeam) : [...bots.filter((other) => other.alive && other.team === playerTeam), ...(player.health > 0 ? [player] : [])];
    if (bot.team === playerTeam && !r.bomb) {
      const distanceA = Math.hypot(bot.g.position.x - bombSpot.A.x, bot.g.position.z - bombSpot.A.z);
      const distanceB = Math.hypot(bot.g.position.x - bombSpot.B.x, bot.g.position.z - bombSpot.B.z);
      const siteName = distanceA < distanceB ? 'A' : 'B';
      const sitePoint = bombSpot[siteName];
      if (Math.min(distanceA, distanceB) < 4 && !bot.objective) {
        bot.objective = { action: 'plant', site: siteName, x: sitePoint.x, z: sitePoint.z, progress: 0 };
      }
    }
    if (bot.team !== playerTeam && r.bomb && r.site) {
      const sitePoint = bombSpot[r.site];
      const distance = Math.hypot(bot.g.position.x - sitePoint.x, bot.g.position.z - sitePoint.z);
      if (distance < 4 && !bot.objective) {
        bot.objective = { action: 'defuse', site: r.site, x: sitePoint.x, z: sitePoint.z, progress: 0 };
      }
    }
    let closest = null;
    let closestDistance = Infinity;
    for (const enemy of opponents) {
      const pos = enemy === player ? new T.Vector3(player.p.x, 1.35, player.p.z) : new T.Vector3(enemy.g.position.x, 1.2, enemy.g.position.z);
      const own = new T.Vector3(bot.g.position.x, 1.35, bot.g.position.z);
      const distance = own.distanceTo(pos);
      if (distance < closestDistance && !blocked(own, pos)) {
        closest = enemy;
        closestDistance = distance;
      }
    }
    bot.update(dt, closest, closestDistance, map.waypoints, map.colliders, random);
    if (bot.objective && Math.hypot(bot.g.position.x - bot.objective.x, bot.g.position.z - bot.objective.z) > 3.5) {
      bot.objective.progress = 0;
    }
    if (closest) {
      bot.fireLeft -= dt;
      if (bot.fireLeft <= 0 && bot.reactionLeft <= 0) {
        fireActor(bot, closest);
        bot.fireLeft = 0.55 + random() * 0.35;
      }
    }
  }

  const blueAlive = player.health > 0 || bots.some((bot) => bot.alive && bot.team === playerTeam);
  const redAlive = bots.some((bot) => bot.alive && bot.team !== playerTeam);
  if (r.phase === 'live' && (!blueAlive || !redAlive)) r.finish(blueAlive ? 'blue' : 'red');

  if (input.pressed('KeyR')) {
    weapon.reload();
    sound.play('reload');
  }
  if (input.pressed('Digit1')) weapon.equip('Pistol');
  if (input.pressed('Digit2')) weapon.equip('SMG');
  if (input.pressed('Digit3')) weapon.equip('Rifle');
  if (input.pressed('Digit4')) weapon.equip('Sniper');
  if (input.pressed('KeyV') || input.pressed('MouseRight')) {
    scopeOpen = weapon.kind === 'Sniper' ? !scopeOpen : false;
    hud.scoped(scopeOpen);
    camera.fov = scopeOpen ? 24 : 72;
    camera.updateProjectionMatrix();
  }
  if (input.pressed('KeyG') && smokeCount > 0) {
    smokeCount -= 1;
    camera.getWorldDirection(vector);
    weapon.throwGrenade(camera.position, vector, 'smoke');
  }
  if (input.pressed('KeyF') && flashCount > 0) {
    flashCount -= 1;
    camera.getWorldDirection(vector);
    weapon.throwGrenade(camera.position, vector, 'flash');
  }
  if (input.state.firing && r.phase === 'live' && player.health > 0) fireActor(player, bots.find((bot) => bot.alive && bot.team !== playerTeam), true);
  if (r.bomb > 0 && Math.floor(r.bomb) !== Math.floor(r.bomb - dt)) sound.play('beep');
  sim.step(dt);
  if (r.phase !== 'freeze') buyOpen = false;
  if (r.phase !== lastPhase && r.phase === 'end') {
    const winner = r.winner;
    awardRound(winner);
  }
  if (r.phase !== lastPhase && r.phase === 'freeze' && !r.matchOver) resetRound();
  lastPhase = r.phase;
  hud.update(makeHudState());
}

function makeHudState() {
  const r = sim.rounds;
  const prices = Object.entries(PRICES).map(([name, price], index) => `${index + 1}. ${name} · $${price}${economy.money < price ? ' · LOCKED' : ''}`).join('<br>');
  const result = r.matchOver ? (r.score[0] >= 8 ? 'VICTORY' : 'DEFEAT') : r.phase === 'end' ? (r.winner === playerTeam ? 'ROUND WON' : 'ROUND LOST') : '';
  return { round: r.round, score: r.score.join(' : '), time: Math.ceil(r.time), phase: r.phase.toUpperCase(), hp: player.health, armor: player.armor, money: economy.money, mag: weapon.mag, reserve: weapon.reserve, kills, deaths, bomb: r.bomb, site: r.site, buy: buyOpen, prices, banner: result, feed, weapon: weapon.kind, progress: plantProgress || defuseProgress, smoke: smokeCount, flash: flashCount, move: Math.hypot(player.v.x, player.v.z), recoil: weapon.canFire ? 0 : 1, roster: bots.map((bot) => ({ name: bot.name, alive: bot.alive })) };
}

// Demo cameras use open lane waypoints and fixed seeded combat poses.
function setDemoWaypoint(index, target) {
  const point = map.waypoints[index];
  player.p.x = point[0];
  player.p.y = point[1];
  player.p.z = point[2];
  player.yaw = Math.atan2(point[0] - target.x, point[2] - target.z);
  player.pitch = 0;
  const direction = new T.Vector3(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
  for (let distance = 0.5; distance <= 15; distance += 0.5) {
    const x = point[0] + direction.x * distance;
    const z = point[2] + direction.z * distance;
    const blockedAhead = map.colliders.some((box) =>
      x >= box.x1 && x <= box.x2 && z >= box.z1 && z <= box.z2 && box.y2 > 1 && box.y1 < 1.8);
    if (blockedAhead) return false;
  }
  return true;
}

function setupShot(name) {
  document.querySelector('#start').style.display = 'none';
  sim.rounds.phase = name === 'buy' ? 'freeze' : 'live';
  sim.rounds.time = name === 'buy' ? 8 : 105;
  buyOpen = name === 'buy';
  economy.money = name === 'buy' ? 5200 : 800;
  if (name === 'cover') {
    if (!setDemoWaypoint(3, bombSpot.A)) setDemoWaypoint(2, bombSpot.A);
    bots[0].g.position.set(-6, 0, -10);
    bots[1].g.position.set(-10, 0, -14);
    bots[4].g.position.set(-14, 0, -17);
    bots[5].g.position.set(-18, 0, -20);
  }
  if (name === 'fight') {
    const mid = map.waypoints[3];
    if (!setDemoWaypoint(3, { x: 0, z: mid[2] - 12 })) setDemoWaypoint(2, { x: -8, z: -30 });
    const fightMid = { x: player.p.x, z: player.p.z };
    const enemy = bots.find((bot) => bot.team === 'red');
    enemy.g.position.set(fightMid.x, 0, fightMid.z - 12);
    hud.hit(false);
    weapon.tracer(new T.Vector3(fightMid.x + 0.25, 1.35, fightMid.z - 0.4), new T.Vector3(fightMid.x, 1.3, fightMid.z - 12), '#ffd27c');
  }
  if (name === 'plant') {
    if (!setDemoWaypoint(2, bombSpot.A)) setDemoWaypoint(1, bombSpot.A);
    sim.rounds.plant('A', 32);
    const defender = bots.find((bot) => bot.team === 'red');
    defender.g.position.set(-12, 0, -20);
    weapon.setBombMarker(bombSpot.A.x, bombSpot.A.z);
  }
  if (name === 'cover') {
    for (const bot of bots) bot.alive = bot.g.visible = true;
  }
  lastPhase = sim.rounds.phase;
  hud.update(makeHudState());
}

// Start, pause, pointer lock, and full-frame demo entry.
const startOverlay = document.querySelector('#start');
document.querySelector('#play').addEventListener('click', () => {
  startOverlay.style.display = 'none';
  input.lock();
  sound.play('round');
});
document.addEventListener('pointerlockchange', () => {
  if (!document.pointerLockElement && !shot && !sim.rounds.matchOver) startOverlay.style.display = 'grid';
});
if (shot) setupShot(shot);

function frame(now) {
  requestAnimationFrame(frame);
  const elapsed = Math.min((now - previousTime) / 1000, 0.1);
  previousTime = now;
  if (!shot && input.state.locked) {
    accumulator += elapsed;
    while (accumulator >= 1 / 60) {
      step(1 / 60);
      accumulator -= 1 / 60;
    }
  }
  camera.position.set(player.p.x, player.p.y + 1.58, player.p.z);
  camera.rotation.set(player.pitch, player.yaw, 0, 'YXZ');
  renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
hud.update(makeHudState());
requestAnimationFrame(frame);
