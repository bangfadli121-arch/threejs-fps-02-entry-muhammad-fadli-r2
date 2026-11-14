// Round timer, bomb clock, score, overtime, and match-end state.
export function createRounds() {
  return {
    phase: 'freeze',
    time: 8,
    score: [0, 0],
    round: 1,
    bomb: 0,
    site: '',
    winner: null,
    matchOver: false,
    plant(site, seconds = 40) {
      this.bomb = seconds;
      this.site = site;
    },
    finish(team) {
      if (this.phase !== 'live' || this.matchOver) return;
      this.winner = team;
      this.score[team === 'blue' ? 0 : 1] += 1;
      this.phase = 'end';
      this.time = 5;
      this.bomb = 0;
      this.site = '';
      const tiedAtSeven = this.score[0] === 7 && this.score[1] === 7;
      this.matchOver = tiedAtSeven ? false : (Math.max(...this.score) >= 8 || this.round >= 15);
    },
    tick(dt) {
      if (this.matchOver) return;
      if (this.phase === 'freeze') {
        this.time -= dt;
        if (this.time <= 0) {
          this.phase = 'live';
          this.time = 105;
        }
      } else if (this.phase === 'live') {
        if (this.bomb > 0) {
          this.bomb -= dt;
          if (this.bomb <= 0) this.finish('blue');
        } else {
          this.time -= dt;
          if (this.time <= 0) this.finish('red');
        }
      } else if (this.phase === 'end') {
        this.time -= dt;
        if (this.time <= 0 && !this.matchOver) {
          this.round += 1;
          this.phase = 'freeze';
          this.time = 8;
          this.winner = null;
        }
      }
    },
  };
}
