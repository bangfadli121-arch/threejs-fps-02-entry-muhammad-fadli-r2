// Persistent tactical HUD, hit feedback, scope, damage direction, and kill feed.
export function createHud() {
  const root = document.getElementById('hud');
  let scope = false;
  let hitTimer = 0;
  let killTimer = 0;
  let hurtTimer = 0;
  let damageAngle = 0;
  let flashOn = false;
  return {
    update(state) {
      const crossSize = Math.round(10 + state.move * 4 + state.recoil * 12);
      const feed = state.feed.map((line) => `<div>${line}</div>`).join('');
      const roster = state.roster.map((bot) => `<span class="${bot.alive ? 'alive' : 'dead'}">${bot.name}</span>`).join(' ');
      root.innerHTML = `<div class="top"><b>SANDLINE YARD</b><span>ROUND ${state.round} · ${state.score}</span><span>${state.phase}</span><span>${state.time}</span></div>
        <div class="feed">${feed}</div><div class="roster">${roster}</div>
        <div class="bottom"><span>♥ ${state.hp} &nbsp; ◈ ${state.armor}</span><span>$${state.money}</span><span>${state.weapon} &nbsp; ${state.mag} / ${state.reserve}</span><span>K/D ${state.kills}/${state.deaths}</span><span>G ${state.smoke} · F ${state.flash}</span></div>
        <div class="reticle" style="--gap:${crossSize}px"><i></i><i></i><i></i><i></i></div>
        <div class="hitmark ${root.classList.contains('kill') ? 'confirmed' : ''}">×</div>
        <div class="damage" style="transform:translate(-50%,-50%) rotate(${damageAngle}rad)"></div>
        <div class="scope" style="display:${scope ? 'block' : 'none'}"></div>
        <div class="flash" style="display:${flashOn ? 'block' : 'none'}"></div>
        ${state.bomb ? `<div class="bomb">${state.site} SITE · BOMB ${Math.ceil(state.bomb)}s</div>` : ''}
        ${state.progress ? `<div class="progress">${state.bomb ? 'DEFUSING' : 'PLANTING'} · ${state.progress.toFixed(1)} / 5.0</div>` : ''}
        ${state.buy ? `<div class="buy"><h2>ARMORY · $${state.money}</h2>${state.prices}<small>Press 1–8 to purchase</small></div>` : ''}
        ${state.banner ? `<div class="banner">${state.banner}</div>` : ''}
        ${state.hp <= 0 ? '<div class="death">ELIMINATED · RESPAWN NEXT ROUND</div>' : ''}`;
      root.style.setProperty('--reticle-size', `${crossSize}px`);
    },
    show() {
      root.hidden = false;
    },
    scoped(value) {
      scope = value;
    },
    hit(killed = false) {
      root.classList.add(killed ? 'kill' : 'hit');
      clearTimeout(killed ? killTimer : hitTimer);
      const timer = setTimeout(() => root.classList.remove(killed ? 'kill' : 'hit'), killed ? 320 : 110);
      if (killed) killTimer = timer;
      else hitTimer = timer;
    },
    kill() {
      this.hit(true);
    },
    damage(angle = 0) {
      damageAngle = angle;
      root.classList.add('hurt');
      clearTimeout(hurtTimer);
      hurtTimer = setTimeout(() => root.classList.remove('hurt'), 320);
    },
    flash(value) {
      flashOn = value;
    },
  };
}
