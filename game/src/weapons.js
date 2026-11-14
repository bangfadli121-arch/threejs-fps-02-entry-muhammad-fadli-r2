import * as T from 'three';

// Weapon stats: magazine, reserve, body damage, and seconds between shots.
export const GUNS = {
  Pistol: [12, 36, 38, 0.24],
  SMG: [25, 100, 21, 0.09],
  Rifle: [30, 90, 34, 0.105],
  Sniper: [5, 15, 90, 0.9],
};

// Tracers, recoil, reloads, smoke clouds, and flash grenades.
export function createWeapon(scene) {
  const tracers = [];
  const grenades = [];
  const smokes = [];
  const ray = new T.Raycaster();
  const direction = new T.Vector3();
  const bombMaterial = new T.MeshStandardMaterial({ color: '#e4a447', emissive: '#7a3219', emissiveIntensity: 1.2 });
  const bombMarker = new T.Mesh(new T.CylinderGeometry(0.22, 0.28, 0.2, 12), bombMaterial);
  bombMarker.visible = false;
  scene.add(bombMarker);
  const state = { kind: 'Rifle', mag: 30, reserve: 90, cool: 0, reloadLeft: 0, recoil: 0, shots: 0, flashLeft: 0, flashOrigin: new T.Vector3() };

  function tracer(start, end, color = '#ffd27c') {
    const geometry = new T.BufferGeometry().setFromPoints([start.clone(), end.clone()]);
    const material = new T.LineBasicMaterial({ color, transparent: true, opacity: 0.95 });
    const line = new T.Line(geometry, material);
    scene.add(line);
    tracers.push({ line, left: 0.16 });
  }

  function throwGrenade(origin, aim, kind) {
    const mesh = new T.Mesh(
      new T.SphereGeometry(0.16, 12, 10),
      new T.MeshStandardMaterial({ color: kind === 'smoke' ? '#415b66' : '#d8ddcf', metalness: 0.35, roughness: 0.4 }),
    );
    mesh.position.copy(origin).addScaledVector(aim, 0.7);
    scene.add(mesh);
    grenades.push({ mesh, velocity: aim.clone().multiplyScalar(10).add(new T.Vector3(0, 4, 0)), kind, fuse: 1.15 });
  }

  function tickGrenades(dt, sound) {
    for (let index = grenades.length - 1; index >= 0; index -= 1) {
      const grenade = grenades[index];
      grenade.fuse -= dt;
      grenade.velocity.y -= 10 * dt;
      grenade.mesh.position.addScaledVector(grenade.velocity, dt);
      if (grenade.mesh.position.y < 0.2) {
        grenade.mesh.position.y = 0.2;
        grenade.velocity.y = Math.abs(grenade.velocity.y) * 0.35;
        grenade.velocity.x *= 0.72;
        grenade.velocity.z *= 0.72;
      }
      if (grenade.fuse > 0) continue;
      const position = grenade.mesh.position.clone();
      scene.remove(grenade.mesh);
      if (grenade.kind === 'smoke') {
        const cloud = new T.Mesh(
          new T.SphereGeometry(4, 20, 16),
          new T.MeshBasicMaterial({ color: '#5b676a', transparent: false, depthWrite: true }),
        );
        cloud.position.copy(position);
        cloud.position.y = 2.7;
        scene.add(cloud);
        smokes.push({ mesh: cloud, radius: 4, left: 12 });
        sound.play('beep');
      } else {
        state.flashLeft = 2;
        state.flashOrigin.copy(position);
        sound.play('ring');
      }
      grenades.splice(index, 1);
    }
    for (let index = smokes.length - 1; index >= 0; index -= 1) {
      const cloud = smokes[index];
      cloud.left -= dt;
      if (cloud.left <= 0) {
        scene.remove(cloud.mesh);
        smokes.splice(index, 1);
      }
    }
  }

  return {
    get kind() { return state.kind; },
    get mag() { return state.mag; },
    get reserve() { return state.reserve; },
    get smokes() { return smokes; },
    get flashLeft() { return state.flashLeft; },
    get flashOrigin() { return state.flashOrigin; },
    get canFire() { return state.cool === 0 && state.reloadLeft === 0 && state.mag > 0; },
    tracer,
    throwGrenade,
    tickGrenades(dt, sound) {
      tickGrenades(dt, sound);
      state.flashLeft = Math.max(0, state.flashLeft - dt);
    },
    equip(kind) {
      if (!GUNS[kind]) return;
      state.kind = kind;
      state.mag = GUNS[kind][0];
      state.reserve = GUNS[kind][1];
      state.cool = 0;
      state.shots = 0;
    },
    consume() {
      if (state.mag > 0) state.mag -= 1;
      state.cool = GUNS[state.kind][3];
      state.shots += 1;
    },
    kick(player) {
      const buildup = Math.min(1, state.shots * 0.08);
      player.pitch = Math.min(1.4, player.pitch + 0.004 + buildup * 0.014);
      player.yaw += (state.shots % 2 ? 1 : -1) * (0.003 + buildup * 0.008);
      state.recoil = Math.min(1, state.recoil + 0.16);
    },
    spread(speed, airborne) {
      return 0.002 + Math.min(1, speed / 5) * 0.035 + (airborne ? 0.04 : 0) + state.recoil * 0.022;
    },
    tick(dt) {
      state.cool = Math.max(0, state.cool - dt);
      state.recoil = Math.max(0, state.recoil - dt * 0.7);
      if (state.cool === 0 && state.shots > 0) state.shots = Math.max(0, state.shots - dt * 3);
      if (state.reloadLeft > 0) {
        state.reloadLeft -= dt;
        if (state.reloadLeft <= 0) {
          const needed = GUNS[state.kind][0] - state.mag;
          const amount = Math.min(needed, state.reserve);
          state.mag += amount;
          state.reserve -= amount;
        }
      }
      for (let index = tracers.length - 1; index >= 0; index -= 1) {
        tracers[index].left -= dt;
        if (tracers[index].left <= 0) {
          scene.remove(tracers[index].line);
          tracers[index].line.geometry.dispose();
          tracers[index].line.material.dispose();
          tracers.splice(index, 1);
        }
      }
    },
    reload() {
      if (state.reloadLeft > 0 || state.mag >= GUNS[state.kind][0] || state.reserve <= 0) return;
      state.reloadLeft = state.kind === 'Sniper' ? 2.6 : 1.8;
    },
    resetMagazine() {
      state.mag = GUNS[state.kind][0];
      state.reserve = GUNS[state.kind][1];
      state.cool = 0;
      state.reloadLeft = 0;
      state.shots = 0;
    },
    clearGrenades() {
      for (const grenade of grenades) scene.remove(grenade.mesh);
      for (const smoke of smokes) scene.remove(smoke.mesh);
      grenades.length = 0;
      smokes.length = 0;
      bombMarker.visible = false;
    },
    setBombMarker(x, z) {
      bombMarker.position.set(x, 0.12, z);
      bombMarker.visible = true;
    },
  };
}
