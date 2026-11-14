import * as T from 'three';
import { P } from './palette.js';

// SANDLINE YARD geometry, desert lighting, collision data, and bot waypoint graph.
export function createMap(scene) {
  const skyCanvas = document.createElement('canvas');
  skyCanvas.width = 2;
  skyCanvas.height = 256;
  const skyContext = skyCanvas.getContext('2d');
  const skyGradient = skyContext.createLinearGradient(0, 0, 0, 256);
  skyGradient.addColorStop(0, '#718a9a');
  skyGradient.addColorStop(0.44, '#dfaa72');
  skyGradient.addColorStop(1, '#875b3f');
  skyContext.fillStyle = skyGradient;
  skyContext.fillRect(0, 0, 2, 256);
  scene.background = new T.CanvasTexture(skyCanvas);
  scene.fog = new T.Fog('#a97853', 38, 105);

  const skyFill = new T.HemisphereLight('#adc7cf', '#634532', 1.8);
  scene.add(skyFill);
  const duskSun = new T.DirectionalLight('#ffc982', 3.2);
  duskSun.position.set(-22, 28, 18);
  duskSun.castShadow = true;
  duskSun.shadow.mapSize.set(1024, 1024);
  duskSun.shadow.camera.left = -48;
  duskSun.shadow.camera.right = 48;
  duskSun.shadow.camera.top = 48;
  duskSun.shadow.camera.bottom = -48;
  scene.add(duskSun);
  const coolFill = new T.DirectionalLight('#789eb0', 1.15);
  coolFill.position.set(20, 12, -15);
  scene.add(coolFill);

  const material = (color, metalness = 0) => new T.MeshStandardMaterial({ color, roughness: 0.82, metalness });
  const materials = [
    material(P.sand),
    material(P.rust),
    material(P.steel, 0.42),
    material('#a9663c'),
    material('#364c59', 0.35),
    material('#d4a45c'),
    material('#71807c', 0.18),
  ];
  const colliders = [];
  const solids = [];

  function box(x, y, z, width, height, depth, materialIndex = 0, collides = true) {
    const mesh = new T.Mesh(new T.BoxGeometry(width, height, depth), materials[materialIndex]);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    if (collides) {
      colliders.push({
        x1: x - width / 2,
        x2: x + width / 2,
        y1: y - height / 2,
        y2: y + height / 2,
        z1: z - depth / 2,
        z2: z + depth / 2,
      });
      solids.push(mesh);
    }
    return mesh;
  }

  // Sand floor, low perimeter berms, and colored route markings.
  box(0, -0.35, 0, 90, 0.7, 90, 0);
  for (let index = 0; index < 14; index += 1) {
    const x = -42 + index * 6.5;
    box(x, 0.3, -42, 5.8, 1.2, 0.8, 3);
    box(x, 0.4, 42, 5.8, 1.5, 0.8, 3);
  }
  for (let z = -36; z <= 36; z += 8) {
    box(-44, 2, z, 1, 4, 8, 4);
    box(44, 2, z, 1, 4, 8, 4);
  }
  for (let x = -6; x <= 6; x += 3) {
    box(x, 0.012, 1, 0.16, 0.02, 38, 5, false);
  }

  // Shipping containers leave a clear center lane and flank routes.
  const containers = [
    [-14, -8, 12, 4, 5, 2],
    [15, -10, 13, 4, 5, 4],
    [-13, 10, 14, 4, 5, 4],
    [14, 12, 12, 4, 5, 2],
    [-31, -25, 10, 4, 5, 2],
    [31, -25, 10, 4, 5, 2],
    [0, 26, 18, 3, 5, 4],
    [-27, 0, 5, 3, 14, 3],
    [27, -2, 5, 3, 14, 3],
  ];
  for (const [x, z, width, height, depth, materialIndex] of containers) {
    box(x, height / 2, z, width, height, depth, materialIndex);
    for (let stripe = -1; stripe <= 1; stripe += 1) {
      box(x + stripe * width * 0.29, height / 2, z - depth / 2 - 0.012, 0.13, height * 0.86, 0.025, 5, false);
    }
    box(x, height - 0.12, z, width * 0.9, 0.12, depth * 1.02, 6, false);
  }

  // Stacked cargo, battered crates, and short walls create close tactical cover.
  for (const [x, z] of [[-6, -4], [6, 4], [-23, -15], [22, 18], [-3, 17], [4, -17]]) {
    box(x, 0.9, z, 2, 1.8, 2, 5);
    box(x, 0.35, z, 2.2, 0.3, 2.2, 3);
    box(x, 1.1, z - 1.02, 1.8, 0.08, 0.06, 1, false);
  }
  box(-2, 0.65, 3, 5, 1.3, 0.5, 3);
  box(3, 0.55, -2, 0.5, 1.1, 5, 6);

  // Painted A/B pads, bright site rings, and an industrial drain through mid.
  const sites = [
    { name: 'A', x: -25, z: -24, color: '#b65f38' },
    { name: 'B', x: 25, z: 24, color: '#477284' },
  ];
  for (const site of sites) {
    const pad = new T.Mesh(
      new T.CircleGeometry(4.8, 48),
      new T.MeshBasicMaterial({ color: site.color, transparent: true, opacity: 0.22 }),
    );
    pad.rotation.x = -Math.PI / 2;
    pad.position.set(site.x, 0.012, site.z);
    scene.add(pad);
    const ring = new T.Mesh(new T.TorusGeometry(5, 0.12, 8, 48), materials[5]);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(site.x, 0.06, site.z);
    scene.add(ring);
    const marker = new T.Mesh(new T.BoxGeometry(1.3, 0.035, 0.18), materials[5]);
    marker.position.set(site.x, 0.035, site.z + 4.1);
    scene.add(marker);
  }
  box(0, 0.03, 0, 0.22, 0.06, 62, 6, false);

  // Pipe runs and dusk floodlights add a readable industrial skyline.
  for (const [x, z, length] of [[-34, -7, 28], [34, 8, 25], [-5, -34, 20]]) {
    const pipe = new T.Mesh(new T.CylinderGeometry(0.16, 0.16, length, 12), materials[6]);
    pipe.rotation.x = Math.PI / 2;
    pipe.position.set(x, 3.2, z);
    scene.add(pipe);
    box(x, 2.55, z, 0.22, 1.3, 0.22, 4, false);
  }
  for (let index = 0; index < 8; index += 1) {
    const x = -35 + index * 10;
    box(x, 6, -35, 0.25, 12, 0.25, 4);
    const lamp = new T.PointLight('#ffc777', 20, 21);
    lamp.position.set(x, 11, -35);
    scene.add(lamp);
    box(x, 11.15, -35, 0.7, 0.18, 0.42, 5, false);
  }

  // Waypoints are linked by lane, site, and flank neighbors for bot navigation.
  const waypoints = [
    [-30, 0, 0], [-20, 0, -20], [-8, 0, -18], [0, 0, -5],
    [10, 0, -17], [24, 0, -24], [30, 0, 0], [22, 0, 20],
    [8, 0, 19], [-10, 0, 18], [-24, 0, 23], [-25, 0, -24],
  ];
  const waypointEdges = [
    [1, 9], [0, 2, 11], [1, 3, 4, 11], [2, 4, 8, 9],
    [2, 3, 5, 7], [4, 6, 11], [5, 7], [4, 6, 8],
    [3, 7, 9], [0, 3, 8, 10], [9, 11], [1, 2, 5, 10],
  ];
  return { colliders, solids, waypoints, waypointEdges, sites };
}
