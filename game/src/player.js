import { clamp } from './utils.js';

// Player acceleration, crouch, jump, camera angles, and capsule collision.
export function createPlayer() {
  return {
    name: 'YOU',
    team: 'blue',
    p: { x: 0, y: 0, z: 32 },
    v: { x: 0, y: 0, z: 0 },
    yaw: 0,
    pitch: 0,
    health: 100,
    armor: 0,
    hasArmor: false,
    alive: true,
    onGround: true,
    step(dt, keys, look, colliders) {
      this.yaw -= look[0] * 0.0021;
      this.pitch = clamp(this.pitch - look[1] * 0.0021, -1.42, 1.42);
      const forward = Number(keys.has('KeyW')) - Number(keys.has('KeyS'));
      const strafe = Number(keys.has('KeyD')) - Number(keys.has('KeyA'));
      const crouch = keys.has('ControlLeft') || keys.has('ControlRight');
      const speed = crouch ? 2.1 : keys.has('ShiftLeft') ? 3 : 5.1;
      const size = Math.hypot(forward, strafe) || 1;
      const wantedX = (-Math.sin(this.yaw) * forward + Math.cos(this.yaw) * strafe) / size * speed;
      const wantedZ = (-Math.cos(this.yaw) * forward - Math.sin(this.yaw) * strafe) / size * speed;
      const accel = this.onGround ? 10 : 3;
      this.v.x += (wantedX - this.v.x) * Math.min(1, accel * dt);
      this.v.z += (wantedZ - this.v.z) * Math.min(1, accel * dt);
      if (!forward && !strafe && this.onGround) {
        this.v.x *= Math.max(0, 1 - 8 * dt);
        this.v.z *= Math.max(0, 1 - 8 * dt);
      }
      if (keys.has('Space') && this.onGround) {
        this.v.y = 6;
        this.onGround = false;
      }
      this.v.y -= 18 * dt;
      const nextX = this.p.x + this.v.x * dt;
      const nextZ = this.p.z + this.v.z * dt;
      const overlaps = (x, z) => colliders.some((box) =>
        x + 0.34 > box.x1 && x - 0.34 < box.x2 &&
        z + 0.34 > box.z1 && z - 0.34 < box.z2 &&
        this.p.y < box.y2 && this.p.y + 1.65 > box.y1);
      if (!overlaps(nextX, this.p.z)) this.p.x = nextX;
      else this.v.x = 0;
      if (!overlaps(this.p.x, nextZ)) this.p.z = nextZ;
      else this.v.z = 0;
      this.p.y += this.v.y * dt;
      if (this.p.y <= 0) {
        this.p.y = 0;
        this.v.y = 0;
        this.onGround = true;
      }
    },
  };
}
