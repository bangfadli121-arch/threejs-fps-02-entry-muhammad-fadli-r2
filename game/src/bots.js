import * as T from 'three';
import { P } from './palette.js';

// Bot roster, body hit zones, tactical routes, and reaction timing.
export function createBots(scene, waypoints, random, waypointEdges) {
  const bots = [];
  const spawns = [
    [-4, 0, 30], [-8, 0, 32], [5, 0, 31], [9, 0, 29],
    [-32, 0, 1], [-31, 0, -4], [32, 0, 3], [31, 0, -4], [3, 0, -32],
  ];

  for (let index = 0; index < 9; index += 1) {
    const team = index < 4 ? 'blue' : 'red';
    const group = new T.Group();
    const uniform = new T.MeshStandardMaterial({ color: team === 'blue' ? P.blue : P.red, roughness: 0.62 });
    const skin = new T.MeshStandardMaterial({ color: '#d5a477', roughness: 0.75 });
    const legs = new T.Mesh(new T.BoxGeometry(0.52, 0.58, 0.42), uniform);
    legs.position.y = 0.3;
    legs.userData.zone = 'legs';
    const body = new T.Mesh(new T.BoxGeometry(0.58, 0.78, 0.38), uniform);
    body.position.y = 0.96;
    body.userData.zone = 'body';
    const head = new T.Mesh(new T.SphereGeometry(0.23, 12, 10), skin);
    head.position.y = 1.56;
    head.userData.zone = 'head';
    group.add(legs, body, head);
    group.traverse((mesh) => {
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });
    const spawn = { x: spawns[index][0], y: 0, z: spawns[index][2] };
    group.position.set(spawn.x, spawn.y, spawn.z);
    scene.add(group);
    const routeStart = team === 'blue' ? 0 : 4;
    bots.push({
      name: `${team === 'blue' ? 'SABLE' : 'RAIDER'} ${index < 4 ? index + 1 : index - 3}`,
      team,
      g: group,
      hp: 100,
      money: 800,
      armor: 0,
      gun: index % 3 === 0 ? 'SMG' : 'Rifle',
      spawn,
      waypoints,
      waypointEdges,
      route: routeStart + index % 4,
      phase: random() * Math.PI * 2,
      alive: true,
      error: 0.008 + random() * 0.018,
      reaction: 0.4 + random() * 0.5,
      reactionLeft: 0,
      fireLeft: random() * 0.6,
      target: null,
      objective: null,
      update(dt, target, distance, points, colliders, rng) {
        this.phase += dt;
        if (target !== this.target) {
          this.target = target;
          this.reactionLeft = target ? this.reaction : 0;
        } else if (target) {
          this.reactionLeft = Math.max(0, this.reactionLeft - dt);
        }
        const current = this.g.position;
        let destination = points[this.route % points.length];
        if (this.objective) {
          destination = [this.objective.x, 0, this.objective.z];
        } else if (target && distance < 24) {
          // Hold a covered angle, then make a short side peek before moving again.
          const peek = Math.floor(this.phase / 2) % 2 ? 1.8 : -1.8;
          destination = [current.x + peek, 0, current.z];
        } else if (target && distance >= 24) {
          destination = points[(this.route + 2) % points.length];
        }
        const dx = destination[0] - current.x;
        const dz = destination[2] - current.z;
        const length = Math.hypot(dx, dz);
        if (length > 1.2) {
          const speed = target ? 1.7 : 2.5;
          const nx = current.x + dx / length * speed * dt;
          const nz = current.z + dz / length * speed * dt;
          const blockedX = colliders.some((box) => nx + 0.4 > box.x1 && nx - 0.4 < box.x2 && current.z + 0.4 > box.z1 && current.z - 0.4 < box.z2 && box.y2 > 0.2 && box.y1 < 1.8);
          const blockedZ = colliders.some((box) => current.x + 0.4 > box.x1 && current.x - 0.4 < box.x2 && nz + 0.4 > box.z1 && nz - 0.4 < box.z2 && box.y2 > 0.2 && box.y1 < 1.8);
          if (!blockedX) current.x = nx;
          if (!blockedZ) current.z = nz;
          if (blockedX && blockedZ) this.advanceRoute(rng);
        } else {
          this.advanceRoute(rng);
        }
        if (target) {
          const tx = target.p ? target.p.x : target.g.position.x;
          const tz = target.p ? target.p.z : target.g.position.z;
          this.g.rotation.y = Math.atan2(tx - current.x, tz - current.z);
        }
      },
      advanceRoute(rng) {
        const neighbors = this.waypointEdges[this.route];
        this.route = neighbors[Math.floor(rng() * neighbors.length)];
      },
    });
  }
  return bots;
}
