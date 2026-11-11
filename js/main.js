'use strict';
// =====================================================================
//  Inicialização e laço principal
// =====================================================================

const STEP = 1 / 60;
let lastFrame = performance.now();
let acc = 0;

function loop(now) {
  const dt = Math.min(0.1, (now - lastFrame) / 1000);
  lastFrame = now;
  if (G && !G.paused) {
    acc += dt;
    let n = 0;
    while (acc >= STEP && n < 6) { step(G, STEP); acc -= STEP; n++; }
    if (n >= 6) acc = 0;
    if (G.over && G.overT > 2.5 && !endShown) showEnd();
  }
  updateCamera(dt);
  render();
  requestAnimationFrame(loop);
}

genScenery();
resize();
window.addEventListener('resize', resize);
setupInput();
setupMenu();
setupOverlays();
requestAnimationFrame(loop);

// Ganchos para testes automatizados
window.__arena = { get G() { return G; }, step, newGame, startGame, menuState };
