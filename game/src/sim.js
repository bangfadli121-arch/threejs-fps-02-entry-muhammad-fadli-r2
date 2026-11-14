import { createRounds } from './rounds.js';

// Single owner for fixed-step tick count and round-state updates.
export function createSim() {
  return {
    rounds: createRounds(),
    ticks: 0,
    step(dt) {
      this.ticks += 1;
      this.rounds.tick(dt);
    },
  };
}
