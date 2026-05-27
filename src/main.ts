import './styles.css';

type GameState = 'ready' | 'playing' | 'gameover';
type EnemyKind = 'ship' | 'asteroid';
type PowerupKind = 'shield' | 'double';
type Entity = { x: number; y: number; r: number; vx: number; vy: number };
type Bullet = Entity & { damage: number };
type Enemy = Entity & { kind: EnemyKind; hp: number; score: number; spin: number; wobble: number[] };
type Particle = Entity & { life: number; maxLife: number; hue: number };
type Powerup = Entity & { kind: PowerupKind };

const canvas = document.querySelector<HTMLCanvasElement>('#game');
const scoreEl = document.querySelector<HTMLElement>('#score');
const bestEl = document.querySelector<HTMLElement>('#best');
const livesEl = document.querySelector<HTMLElement>('#lives');
const panel = document.querySelector<HTMLElement>('#panel');
const panelText = document.querySelector<HTMLElement>('#panelText');
const primaryButton = document.querySelector<HTMLButtonElement>('#primaryButton');
if (!canvas || !scoreEl || !bestEl || !livesEl || !panel || !panelText || !primaryButton) throw new Error('Missing DOM nodes.');

const ctx = canvas.getContext('2d', { alpha: false });
if (!ctx) throw new Error('Canvas 2D context is not available.');

const ASSET_PATHS = {
  player: 'assets/player-ship.png',
  enemy1: 'assets/enemy-ship-1.png',
  enemy2: 'assets/enemy-ship-2.png',
  asteroid: 'assets/asteroid.png',
  laser: 'assets/laser.png',
  powerup: 'assets/powerup.png',
  background: 'assets/background.png',
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
  lastTime: 0,
  score: 0,
  best: Number(localStorage.getItem('galactica-mini-best') ?? 0),
  lives: 3,
  spawnTimer: 0,
  powerupTimer: 0,
  fireTimer: 0,
  difficulty: 1,
  screenShake: 0,
  bgOffset: 0,
  shieldTime: 0,
  doubleTime: 0,
};

const player = { x: 0, y: 0, r: 22, targetX: 0, speed: 14 };
const bullets: Bullet[] = [];
const enemies: Enemy[] = [];
const particles: Particle[] = [];
const powerups: Powerup[] = [];
const stars = Array.from({ length: 96 }, () => ({ x: Math.random(), y: Math.random(), z: 0.4 + Math.random() * 1.4 }));

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const rand = (min: number, max: number) => min + Math.random() * (max - min);
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

function resize() {
  game.dpr = Math.min(window.devicePixelRatio || 1, 2);
  game.width = window.innerWidth;
  game.height = window.innerHeight;
  canvas.width = Math.floor(game.width * game.dpr);
  canvas.height = Math.floor(game.height * game.dpr);
  canvas.style.width = `${game.width}px`;
  canvas.style.height = `${game.height}px`;
  ctx.setTransform(game.dpr, 0, 0, game.dpr, 0, 0);
  player.x = game.width / 2;
  player.targetX = player.x;
  player.y = game.height - Math.max(82, game.height * 0.12);
}

function updateUI() {
  scoreEl.textContent = String(game.score);
  bestEl.textContent = String(game.best);
  livesEl.textContent = String(game.lives);
}

function startGame() {
  game.state = 'playing';
  game.score = 0;
  game.lives = 3;
  game.spawnTimer = 0;
  game.powerupTimer = 8;
  game.fireTimer = 0;
  game.difficulty = 1;
  game.screenShake = 0;
  game.shieldTime = 0;
  game.doubleTime = 0;
  bullets.length = 0;
  enemies.length = 0;
  particles.length = 0;
  powerups.length = 0;
  player.x = game.width / 2;
  player.targetX = player.x;
  updateUI();
  panel.classList.add('hidden');
}

function endGame() {
  game.state = 'gameover';
  game.best = Math.max(game.best, game.score);
  localStorage.setItem('galactica-mini-best', String(game.best));
  updateUI();
  primaryButton.textContent = 'Play Again';
  panelText.textContent = `You scored ${game.score}. Drag carefully, collect powerups, and try again.`;
  panel.classList.remove('hidden');
}

function spawnEnemy() {
  const kind: EnemyKind = Math.random() < 0.72 ? 'ship' : 'asteroid';
  const r = kind === 'ship' ? rand(17, 24) : rand(20, 31);
  enemies.push({
    kind,
    x: rand(r + 12, game.width - r - 12),
    y: -r - 18,
    r,
    vx: kind === 'ship' ? rand(-18, 18) : rand(-34, 34),
    vy: rand(95, 155) * game.difficulty,
    hp: kind === 'ship' ? 1 : 2,
    score: kind === 'ship' ? 10 : 18,
    spin: rand(-2, 2),
    wobble: Array.from({ length: 9 }, () => rand(0.72, 1.05)),
  });
}

function spawnPowerup() {
  powerups.push({ kind: Math.random() < 0.55 ? 'double' : 'shield', x: rand(34, game.width - 34), y: -28, r: 17, vx: 0, vy: rand(80, 120) });
}

function fireBullet() {
  const spread = game.doubleTime > 0 ? 12 : 0;
  bullets.push({ x: player.x - spread, y: player.y - 28, r: 5, vx: 0, vy: -520, damage: 1 });
  if (game.doubleTime > 0) bullets.push({ x: player.x + spread, y: player.y - 28, r: 5, vx: 0, vy: -520, damage: 1 });
}

function burst(x: number, y: number, count = 18, hue = 36) {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = rand(45, 220);
    particles.push({ x, y, r: rand(1.5, 4.2), vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: rand(0.28, 0.7), maxLife: 0.7, hue });
  }
}

function loseLife() {
  if (game.shieldTime > 0) {
    game.shieldTime = 0;
    burst(player.x, player.y, 18, 190);
    return;
  }
  game.lives -= 1;
  game.screenShake = 0.25;
  burst(player.x, player.y, 28, 8);
  updateUI();
  if (game.lives <= 0) endGame();
}

function update(dt: number) {
  game.bgOffset += dt * 42;
  if (game.state !== 'playing') return;

  game.difficulty = 1 + Math.min(1.25, game.score / 850);
  game.spawnTimer -= dt;
  game.powerupTimer -= dt;
  game.fireTimer -= dt;
  game.screenShake = Math.max(0, game.screenShake - dt);
  game.shieldTime = Math.max(0, game.shieldTime - dt);
  game.doubleTime = Math.max(0, game.doubleTime - dt);
  player.x += (player.targetX - player.x) * clamp(player.speed * dt, 0, 1);

  if (game.fireTimer <= 0) {
    fireBullet();
    game.fireTimer = game.doubleTime > 0 ? 0.16 : 0.24;
  }
  if (game.spawnTimer <= 0) {
    spawnEnemy();
    game.spawnTimer = rand(0.42, 0.86) / game.difficulty;
  }
  if (game.powerupTimer <= 0) {
    spawnPowerup();
    game.powerupTimer = rand(9, 15);
  }

  bullets.forEach((bullet) => (bullet.y += bullet.vy * dt));
  powerups.forEach((powerup) => (powerup.y += powerup.vy * dt));
  enemies.forEach((enemy) => {
    enemy.x += enemy.vx * dt;
    enemy.y += enemy.vy * dt;
    if (enemy.x < enemy.r || enemy.x > game.width - enemy.r) enemy.vx *= -1;
  });

  for (let i = enemies.length - 1; i >= 0; i--) {
    const enemy = enemies[i];
    for (let j = bullets.length - 1; j >= 0; j--) {
      const bullet = bullets[j];
      if (dist(enemy, bullet) < enemy.r + bullet.r) {
        bullets.splice(j, 1);
        enemy.hp -= bullet.damage;
        burst(bullet.x, bullet.y, 5, 194);
        if (enemy.hp <= 0) {
          game.score += enemy.score;
          updateUI();
          burst(enemy.x, enemy.y, enemy.kind === 'ship' ? 18 : 24, enemy.kind === 'ship' ? 330 : 34);
          enemies.splice(i, 1);
        }
        break;
      }
    }
  }

  for (let i = enemies.length - 1; i >= 0; i--) {
    const enemy = enemies[i];
    if (dist(enemy, player) < enemy.r + player.r * 0.78) {
      enemies.splice(i, 1);
      loseLife();
    } else if (enemy.y > game.height + enemy.r) enemies.splice(i, 1);
  }

  for (let i = powerups.length - 1; i >= 0; i--) {
    const powerup = powerups[i];
    if (dist(powerup, player) < powerup.r + player.r) {
      if (powerup.kind === 'double') game.doubleTime = 8;
      if (powerup.kind === 'shield') game.shieldTime = 8;
      burst(powerup.x, powerup.y, 14, powerup.kind === 'double' ? 194 : 135);
      powerups.splice(i, 1);
    } else if (powerup.y > game.height + powerup.r) powerups.splice(i, 1);
  }

  for (let i = bullets.length - 1; i >= 0; i--) if (bullets[i].y < -30) bullets.splice(i, 1);
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 0.985;
    p.vy *= 0.985;
    p.life -= dt;
    if (p.life <= 0) particles.splice(i, 1);
  }
}

function drawImageCentered(img: HTMLImageElement | undefined, x: number, y: number, size: number, rotation = 0) {
  if (!img || !img.complete || img.naturalWidth === 0) return false;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.drawImage(img, -size / 2, -size / 2, size, size);
  ctx.restore();
  return true;
}

function drawBackground() {
  const bg = images.background;
  if (bg && bg.complete && bg.naturalWidth > 0) {
    const scale = Math.max(game.width / bg.width, game.height / bg.height);
    const w = bg.width * scale;
    const h = bg.height * scale;
    const x = (game.width - w) / 2;
    const y = (game.bgOffset % h) - h;
    ctx.drawImage(bg, x, y, w, h);
    ctx.drawImage(bg, x, y + h, w, h);
    return;
  }

  const gradient = ctx.createLinearGradient(0, 0, 0, game.height);
  gradient.addColorStop(0, '#050816');
  gradient.addColorStop(0.55, '#07132b');
  gradient.addColorStop(1, '#050816');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, game.width, game.height);
  for (const star of stars) {
    const y = ((star.y * game.height + game.bgOffset * star.z) % (game.height + 20)) - 10;
    ctx.globalAlpha = clamp(star.z / 1.8, 0.3, 0.95);
    ctx.fillStyle = '#dff8ff';
    ctx.beginPath();
    ctx.arc(star.x * game.width, y, star.z, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

function drawPlayer() {
  if (game.shieldTime > 0) {
    ctx.save();
    ctx.strokeStyle = 'rgba(99,255,205,.72)';
    ctx.lineWidth = 3;
    ctx.shadowColor = '#5effca';
    ctx.shadowBlur = 18;
    ctx.beginPath();
    ctx.arc(player.x, player.y, player.r + 12, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
  if (drawImageCentered(images.player, player.x, player.y, player.r * 3.1)) return;
  ctx.save();
  ctx.translate(player.x, player.y);
  ctx.shadowColor = '#37dfff';
  ctx.shadowBlur = 18;
  ctx.fillStyle = '#dffaff';
  ctx.beginPath();
  ctx.moveTo(0, -30);
  ctx.lineTo(22, 23);
  ctx.lineTo(0, 12);
  ctx.lineTo(-22, 23);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#21bfff';
  ctx.beginPath();
  ctx.moveTo(0, -20);
  ctx.lineTo(10, 12);
  ctx.lineTo(0, 6);
  ctx.lineTo(-10, 12);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(255,111,180,.85)';
  ctx.beginPath();
  ctx.ellipse(0, 25, 7, 14, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawBullet(bullet: Bullet) {
  if (drawImageCentered(images.laser, bullet.x, bullet.y, 22)) return;
  ctx.save();
  ctx.shadowColor = '#55e6ff';
  ctx.shadowBlur = 12;
  ctx.fillStyle = '#bff7ff';
  ctx.fillRect(bullet.x - 2.5, bullet.y - 14, 5, 24);
  ctx.restore();
}

function drawEnemy(enemy: Enemy) {
  const img = enemy.kind === 'asteroid' ? images.asteroid : enemy.score > 10 ? images.enemy2 : images.enemy1;
  if (drawImageCentered(img, enemy.x, enemy.y, enemy.r * 2.5, enemy.spin + game.bgOffset * 0.01 * enemy.spin)) return;
  ctx.save();
  ctx.translate(enemy.x, enemy.y);
  ctx.rotate(enemy.spin + game.bgOffset * 0.01 * enemy.spin);
  if (enemy.kind === 'asteroid') {
    ctx.fillStyle = '#a8795f';
    ctx.strokeStyle = '#f0c09a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    enemy.wobble.forEach((w, i) => {
      const angle = (i / enemy.wobble.length) * Math.PI * 2;
      const x = Math.cos(angle) * enemy.r * w;
      const y = Math.sin(angle) * enemy.r * w;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else {
    ctx.shadowColor = '#ff4f9c';
    ctx.shadowBlur = 13;
    ctx.fillStyle = '#ff4f9c';
    ctx.beginPath();
    ctx.moveTo(0, 24);
    ctx.lineTo(21, -15);
    ctx.lineTo(0, -6);
    ctx.lineTo(-21, -15);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#32102a';
    ctx.fillRect(-7, -7, 14, 18);
  }
  ctx.restore();
}

function drawPowerup(powerup: Powerup) {
  if (drawImageCentered(images.powerup, powerup.x, powerup.y, powerup.r * 2.4)) return;
  ctx.save();
  ctx.translate(powerup.x, powerup.y);
  ctx.shadowColor = powerup.kind === 'double' ? '#52e2ff' : '#68ffc8';
  ctx.shadowBlur = 18;
  ctx.fillStyle = powerup.kind === 'double' ? '#52e2ff' : '#68ffc8';
  ctx.beginPath();
  ctx.arc(0, 0, powerup.r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#061027';
  ctx.font = '900 15px system-ui';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(powerup.kind === 'double' ? '2x' : 'S', 0, 1);
  ctx.restore();
}

function roundRect(x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawParticles() {
  for (const p of particles) {
    const alpha = clamp(p.life / p.maxLife, 0, 1);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = `hsl(${p.hue} 100% 64%)`;
    ctx.shadowColor = `hsl(${p.hue} 100% 64%)`;
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r * alpha, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function drawStatusChips() {
  if (game.state !== 'playing') return;
  const chips: string[] = [];
  if (game.doubleTime > 0) chips.push(`Double ${Math.ceil(game.doubleTime)}s`);
  if (game.shieldTime > 0) chips.push(`Shield ${Math.ceil(game.shieldTime)}s`);
  ctx.save();
  ctx.font = '800 12px system-ui';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  chips.forEach((chip, index) => {
    const x = game.width / 2;
    const y = 76 + index * 32;
    const w = ctx.measureText(chip).width + 30;
    ctx.fillStyle = 'rgba(8,18,42,.72)';
    ctx.strokeStyle = 'rgba(126,231,255,.26)';
    roundRect(x - w / 2, y - 13, w, 26, 13);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#eaffff';
    ctx.fillText(chip, x, y);
  });
  ctx.restore();
}

function draw() {
  ctx.save();
  if (game.screenShake > 0) ctx.translate(rand(-6, 6) * game.screenShake, rand(-6, 6) * game.screenShake);
  drawBackground();
  bullets.forEach(drawBullet);
  powerups.forEach(drawPowerup);
  enemies.forEach(drawEnemy);
  drawPlayer();
  drawParticles();
  drawStatusChips();
  ctx.restore();
}

function frame(time: number) {
  const dt = Math.min(0.033, (time - game.lastTime) / 1000 || 0);
  game.lastTime = time;
  update(dt);
  draw();
  requestAnimationFrame(frame);
}

function setTargetFromEvent(clientX: number) {
  player.targetX = clamp(clientX, player.r + 12, game.width - player.r - 12);
}

window.addEventListener('resize', resize);
window.addEventListener('pointermove', (event) => event.isPrimary && setTargetFromEvent(event.clientX));
window.addEventListener('pointerdown', (event) => {
  setTargetFromEvent(event.clientX);
  if (game.state === 'ready') startGame();
});
window.addEventListener('keydown', (event) => {
  if (event.key === 'ArrowLeft' || event.key.toLowerCase() === 'a') player.targetX -= 50;
  if (event.key === 'ArrowRight' || event.key.toLowerCase() === 'd') player.targetX += 50;
  if (event.key === ' ' && game.state !== 'playing') startGame();
  player.targetX = clamp(player.targetX, player.r + 12, game.width - player.r - 12);
});
primaryButton.addEventListener('click', startGame);

resize();
updateUI();
requestAnimationFrame(frame);
