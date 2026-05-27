import './styles.css';

type GameState = 'ready' | 'playing' | 'gameover';
type Kind = 'ship' | 'asteroid';
type Power = 'shield' | 'double';
type Entity = { x: number; y: number; r: number; vx: number; vy: number };
type Bullet = Entity & { damage: number };
type Enemy = Entity & { kind: Kind; hp: number; score: number; rot: number };
type Particle = Entity & { life: number; maxLife: number; hue: number };
type Powerup = Entity & { kind: Power };

const canvas = document.querySelector<HTMLCanvasElement>('#game')!;
const scoreEl = document.querySelector<HTMLElement>('#score')!;
const bestEl = document.querySelector<HTMLElement>('#best')!;
const livesEl = document.querySelector<HTMLElement>('#lives')!;
const panel = document.querySelector<HTMLElement>('#panel')!;
const panelText = document.querySelector<HTMLElement>('#panelText')!;
const button = document.querySelector<HTMLButtonElement>('#primaryButton')!;
const ctx = canvas.getContext('2d', { alpha: false })!;

const ASSET_PATHS = {
  player: 'assets/player-ship.svg',
  enemy1: 'assets/enemy-ship-1.svg',
  enemy2: 'assets/enemy-ship-2.svg',
  asteroid: 'assets/asteroid.svg',
  laser: 'assets/laser.svg',
  powerup: 'assets/powerup.svg',
  background: 'assets/background.svg',
  explosion: 'assets/explosion-spritesheet.svg',
} as const;

const images: Partial<Record<keyof typeof ASSET_PATHS, HTMLImageElement>> = {};
for (const [key, src] of Object.entries(ASSET_PATHS) as Array<[keyof typeof ASSET_PATHS, string]>) {
  const img = new Image();
  img.src = src;
  img.onload = () => (images[key] = img);
}

const game = {
  state: 'ready' as GameState,
  width: 0,
  height: 0,
  dpr: 1,
  last: 0,
  score: 0,
  best: Number(localStorage.getItem('galactica-mini-best') ?? 0),
  lives: 3,
  spawn: 0,
  power: 8,
  fire: 0,
  difficulty: 1,
  shake: 0,
  bg: 0,
  shield: 0,
  double: 0,
};

const player = { x: 0, y: 0, r: 22, tx: 0, speed: 14 };
const bullets: Bullet[] = [];
const enemies: Enemy[] = [];
const particles: Particle[] = [];
const powerups: Powerup[] = [];
const stars = Array.from({ length: 90 }, () => ({ x: Math.random(), y: Math.random(), z: 0.4 + Math.random() * 1.4 }));

const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const hit = (a: { x: number; y: number; r: number }, b: { x: number; y: number; r: number }) => Math.hypot(a.x - b.x, a.y - b.y) < a.r + b.r;

function resize() {
  game.dpr = Math.min(devicePixelRatio || 1, 2);
  game.width = innerWidth;
  game.height = innerHeight;
  canvas.width = Math.floor(game.width * game.dpr);
  canvas.height = Math.floor(game.height * game.dpr);
  canvas.style.width = `${game.width}px`;
  canvas.style.height = `${game.height}px`;
  ctx.setTransform(game.dpr, 0, 0, game.dpr, 0, 0);
  player.x = game.width / 2;
  player.tx = player.x;
  player.y = game.height - Math.max(82, game.height * 0.12);
}

function ui() {
  scoreEl.textContent = String(game.score);
  bestEl.textContent = String(game.best);
  livesEl.textContent = String(game.lives);
}

function start() {
  game.state = 'playing';
  game.score = 0;
  game.lives = 3;
  game.spawn = 0;
  game.power = 8;
  game.fire = 0;
  game.difficulty = 1;
  game.shake = 0;
  game.shield = 0;
  game.double = 0;
  bullets.length = enemies.length = particles.length = powerups.length = 0;
  player.x = player.tx = game.width / 2;
  ui();
  panel.classList.add('hidden');
}

function over() {
  game.state = 'gameover';
  game.best = Math.max(game.best, game.score);
  localStorage.setItem('galactica-mini-best', String(game.best));
  ui();
  button.textContent = 'Play Again';
  panelText.textContent = `You scored ${game.score}. Drag carefully, collect powerups, and try again.`;
  panel.classList.remove('hidden');
}

function burst(x: number, y: number, count = 16, hue = 35) {
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = rand(45, 220);
    particles.push({ x, y, r: rand(1.5, 4.3), vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.25, 0.65), maxLife: 0.65, hue });
  }
}

function spawnEnemy() {
  const kind: Kind = Math.random() < 0.72 ? 'ship' : 'asteroid';
  const r = kind === 'ship' ? rand(18, 25) : rand(22, 32);
  enemies.push({ kind, x: rand(r + 12, game.width - r - 12), y: -r - 20, r, vx: rand(-28, 28), vy: rand(95, 160) * game.difficulty, hp: kind === 'ship' ? 1 : 2, score: kind === 'ship' ? 10 : 18, rot: rand(-1.5, 1.5) });
}

function spawnPower() {
  powerups.push({ kind: Math.random() < 0.55 ? 'double' : 'shield', x: rand(34, game.width - 34), y: -28, r: 17, vx: 0, vy: rand(80, 120) });
}

function fire() {
  const spread = game.double > 0 ? 13 : 0;
  bullets.push({ x: player.x - spread, y: player.y - 30, r: 5, vx: 0, vy: -540, damage: 1 });
  if (game.double > 0) bullets.push({ x: player.x + spread, y: player.y - 30, r: 5, vx: 0, vy: -540, damage: 1 });
}

function loseLife() {
  if (game.shield > 0) {
    game.shield = 0;
    burst(player.x, player.y, 18, 185);
    return;
  }
  game.lives -= 1;
  game.shake = 0.25;
  burst(player.x, player.y, 28, 8);
  ui();
  if (game.lives <= 0) over();
}

function update(dt: number) {
  game.bg += dt * 42;
  if (game.state !== 'playing') return;
  game.difficulty = 1 + Math.min(1.25, game.score / 850);
  game.spawn -= dt;
  game.power -= dt;
  game.fire -= dt;
  game.shake = Math.max(0, game.shake - dt);
  game.shield = Math.max(0, game.shield - dt);
  game.double = Math.max(0, game.double - dt);
  player.x += (player.tx - player.x) * clamp(player.speed * dt, 0, 1);

  if (game.fire <= 0) { fire(); game.fire = game.double > 0 ? 0.16 : 0.24; }
  if (game.spawn <= 0) { spawnEnemy(); game.spawn = rand(0.42, 0.86) / game.difficulty; }
  if (game.power <= 0) { spawnPower(); game.power = rand(9, 15); }

  bullets.forEach((b) => (b.y += b.vy * dt));
  powerups.forEach((p) => (p.y += p.vy * dt));
  enemies.forEach((e) => { e.x += e.vx * dt; e.y += e.vy * dt; if (e.x < e.r || e.x > game.width - e.r) e.vx *= -1; });

  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    for (let j = bullets.length - 1; j >= 0; j--) {
      const b = bullets[j];
      if (hit(e, b)) {
        bullets.splice(j, 1);
        e.hp -= b.damage;
        burst(b.x, b.y, 4, 194);
        if (e.hp <= 0) {
          game.score += e.score;
          ui();
          burst(e.x, e.y, e.kind === 'ship' ? 18 : 24, e.kind === 'ship' ? 330 : 34);
          enemies.splice(i, 1);
        }
        break;
      }
    }
  }

  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    if (hit({ ...player, r: player.r * 0.8 }, e)) { enemies.splice(i, 1); loseLife(); }
    else if (e.y > game.height + e.r) enemies.splice(i, 1);
  }

  for (let i = powerups.length - 1; i >= 0; i--) {
    const p = powerups[i];
    if (hit(player, p)) {
      if (p.kind === 'double') game.double = 8;
      if (p.kind === 'shield') game.shield = 8;
      burst(p.x, p.y, 14, p.kind === 'double' ? 194 : 135);
      powerups.splice(i, 1);
    } else if (p.y > game.height + p.r) powerups.splice(i, 1);
  }

  for (let i = bullets.length - 1; i >= 0; i--) if (bullets[i].y < -30) bullets.splice(i, 1);
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.985; p.vy *= 0.985; p.life -= dt;
    if (p.life <= 0) particles.splice(i, 1);
  }
}

function img(key: keyof typeof ASSET_PATHS, x: number, y: number, size: number, rot = 0) {
  const im = images[key];
  if (!im || !im.complete || !im.naturalWidth) return false;
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.drawImage(im, -size / 2, -size / 2, size, size); ctx.restore();
  return true;
}

function bg() {
  const im = images.background;
  if (im?.complete && im.naturalWidth) {
    const scale = Math.max(game.width / im.width, game.height / im.height);
    const w = im.width * scale, h = im.height * scale, x = (game.width - w) / 2, y = (game.bg % h) - h;
    ctx.drawImage(im, x, y, w, h); ctx.drawImage(im, x, y + h, w, h); return;
  }
  const g = ctx.createLinearGradient(0, 0, 0, game.height);
  g.addColorStop(0, '#050816'); g.addColorStop(0.55, '#07132b'); g.addColorStop(1, '#050816');
  ctx.fillStyle = g; ctx.fillRect(0, 0, game.width, game.height);
  stars.forEach((s) => { const y = ((s.y * game.height + game.bg * s.z) % (game.height + 20)) - 10; ctx.globalAlpha = clamp(s.z / 1.8, 0.3, 0.95); ctx.fillStyle = '#dff8ff'; ctx.beginPath(); ctx.arc(s.x * game.width, y, s.z, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1; });
}

function drawPlayer() {
  if (game.shield > 0) { ctx.save(); ctx.strokeStyle = 'rgba(99,255,205,.72)'; ctx.lineWidth = 3; ctx.shadowColor = '#5effca'; ctx.shadowBlur = 18; ctx.beginPath(); ctx.arc(player.x, player.y, player.r + 12, 0, Math.PI * 2); ctx.stroke(); ctx.restore(); }
  if (img('player', player.x, player.y, player.r * 3.6)) return;
}

function draw() {
  ctx.save(); if (game.shake > 0) ctx.translate(rand(-6, 6) * game.shake, rand(-6, 6) * game.shake);
  bg();
  bullets.forEach((b) => { if (!img('laser', b.x, b.y, 32)) { ctx.fillStyle = '#bff7ff'; ctx.fillRect(b.x - 2, b.y - 14, 4, 24); } });
  powerups.forEach((p) => { if (!img('powerup', p.x, p.y, p.r * 2.6)) { ctx.fillStyle = p.kind === 'double' ? '#52e2ff' : '#68ffc8'; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill(); } });
  enemies.forEach((e) => img(e.kind === 'asteroid' ? 'asteroid' : 'enemy1', e.x, e.y, e.r * 3.1, e.rot + game.bg * 0.01 * e.rot));
  drawPlayer();
  particles.forEach((p) => { const a = clamp(p.life / p.maxLife, 0, 1); ctx.save(); ctx.globalAlpha = a; ctx.fillStyle = `hsl(${p.hue} 100% 64%)`; ctx.shadowColor = `hsl(${p.hue} 100% 64%)`; ctx.shadowBlur = 10; ctx.beginPath(); ctx.arc(p.x, p.y, p.r * a, 0, Math.PI * 2); ctx.fill(); ctx.restore(); });
  if (game.state === 'playing' && (game.double > 0 || game.shield > 0)) { ctx.fillStyle = 'rgba(234,255,255,.85)'; ctx.font = '800 12px system-ui'; ctx.textAlign = 'center'; const txt = [game.double > 0 ? `Double ${Math.ceil(game.double)}s` : '', game.shield > 0 ? `Shield ${Math.ceil(game.shield)}s` : ''].filter(Boolean).join('  '); ctx.fillText(txt, game.width / 2, 82); }
  ctx.restore();
}

function frame(t: number) { const dt = Math.min(0.033, (t - game.last) / 1000 || 0); game.last = t; update(dt); draw(); requestAnimationFrame(frame); }
function target(x: number) { player.tx = clamp(x, player.r + 12, game.width - player.r - 12); }

addEventListener('resize', resize);
addEventListener('pointermove', (e) => e.isPrimary && target(e.clientX));
addEventListener('pointerdown', (e) => { target(e.clientX); if (game.state === 'ready') start(); });
addEventListener('keydown', (e) => { if (e.key === 'ArrowLeft' || e.key.toLowerCase() === 'a') target(player.tx - 50); if (e.key === 'ArrowRight' || e.key.toLowerCase() === 'd') target(player.tx + 50); if (e.key === ' ' && game.state !== 'playing') start(); });
button.addEventListener('click', start);
resize(); ui(); requestAnimationFrame(frame);
