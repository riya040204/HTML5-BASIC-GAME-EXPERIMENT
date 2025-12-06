// Mini Mario-style platformer prototype
// No external assets — everything drawn with shapes for reliability

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const WIDTH = canvas.width, HEIGHT = canvas.height;
const GRAVITY = 1400;          // pixels / s^2
const MOVE_SPEED = 260;        // pixels / s
const JUMP_SPEED = 540;        // initial jump velocity (pixels/s)
const TILE = 48;               // grid tile (for building platforms)

// HUD
const scoreEl = document.getElementById('score');
const livesEl = document.getElementById('lives');

let lastTime = performance.now();
let score = 0;
let lives = 3;

// Simple level layout (array of platform rects and coin positions)
const platforms = [
  // ground platform across bottom
  { x: 0, y: HEIGHT - TILE, w: WIDTH, h: TILE },
  // some floating platforms
  { x: 160, y: HEIGHT - 3*TILE, w: 360, h: TILE/1.2 },
  { x: 560, y: HEIGHT - 5*TILE, w: 280, h: TILE/1.2 },
  { x: 880, y: HEIGHT - 7*TILE, w: 160, h: TILE/1.2 },
  { x: 40, y: HEIGHT - 6*TILE, w: 120, h: TILE/1.2 },
  { x: 360, y: HEIGHT - 8*TILE, w: 120, h: TILE/1.2 }
];

// coins
let coins = [
  { x: 240, y: HEIGHT - 3*TILE - 28, collected: false },
  { x: 420, y: HEIGHT - 3*TILE - 28, collected: false },
  { x: 640, y: HEIGHT - 5*TILE - 28, collected: false },
  { x: 920, y: HEIGHT - 7*TILE - 28, collected: false },
  { x: 80, y: HEIGHT - 6*TILE - 28, collected: false }
];

// enemies (patrolers)
let enemies = [
  { x: 520, y: HEIGHT - TILE - 36, w: 36, h: 36, dir: 1, speed: 80 },
  { x: 320, y: HEIGHT - 3*TILE - 36, w: 36, h: 36, dir: -1, speed: 70 }
];

// player
let player = {
  x: 120,
  y: HEIGHT - TILE - 48,
  w: 36,
  h: 48,
  vx: 0,
  vy: 0,
  onGround: false,
  canDoubleJump: false,
  isDead: false,
  blinkTimer: 0
};

// input
const keys = {};
window.addEventListener('keydown', e => { keys[e.key] = true; });
window.addEventListener('keyup', e => { keys[e.key] = false; });

// simple AABB collision
function rectOverlap(a, b) {
  return !(a.x + a.w <= b.x || a.x >= b.x + b.w || a.y + a.h <= b.y || a.y >= b.y + b.h);
}

// physics: move and collide with platforms
function resolvePlayer(dt) {
  // horizontal movement
  let left = keys['ArrowLeft'] || keys['a'] || keys['A'];
  let right = keys['ArrowRight'] || keys['d'] || keys['D'];

  let targetVx = 0;
  if (left) targetVx = -MOVE_SPEED;
  if (right) targetVx = MOVE_SPEED;
  player.vx = targetVx;

  // jump (key down only -> require a press)
  if ((keys['ArrowUp'] || keys['w'] || keys['W'] || keys[' ']) && player.onGround) {
    player.vy = -JUMP_SPEED;
    player.onGround = false;
    player.canDoubleJump = true;
  } else if ((keys['ArrowUp'] || keys['w'] || keys['W'] || keys[' ']) && player.canDoubleJump && !player.onGround) {
    // small double jump boost (optional)
    if (player.vy > -320) { // only allow if still moving upward moderately
      player.vy = -JUMP_SPEED * 0.9;
      player.canDoubleJump = false;
    }
  }

  // apply gravity
  player.vy += GRAVITY * dt;

  // integrate
  let nextX = player.x + player.vx * dt;
  let nextY = player.y + player.vy * dt;

  // create future rects for collision detection
  const futureRectX = { x: nextX, y: player.y, w: player.w, h: player.h };
  const futureRectY = { x: player.x, y: nextY, w: player.w, h: player.h };

  // horizontal collisions
  player.x = nextX;
  for (const p of platforms) {
    if (rectOverlap(player, p)) {
      // pushing back horizontally
      if (player.vx > 0) {
        player.x = p.x - player.w - 0.1;
      } else if (player.vx < 0) {
        player.x = p.x + p.w + 0.1;
      }
      player.vx = 0;
    }
  }

  // vertical collisions
  player.y = nextY;
  player.onGround = false;
  for (const p of platforms) {
    if (rectOverlap(player, p)) {
      if (player.vy > 0) { // falling -> landed on platform
        player.y = p.y - player.h;
        player.vy = 0;
        player.onGround = true;
        player.canDoubleJump = false;
      } else if (player.vy < 0) { // hitting head
        player.y = p.y + p.h + 0.1;
        player.vy = 0;
      }
    }
  }

  // world bounds: left/right clamp
  player.x = Math.max(2, Math.min(player.x, WIDTH - player.w - 2));
}

// enemy updates: simple horizontal patrol, reverse on platform edges
function updateEnemies(dt) {
  for (const e of enemies) {
    // move horizontally
    e.x += e.dir * e.speed * dt;

    // turn around if no platform beneath move direction (simple check)
    // build a probe rect slightly ahead and below
    const probeX = e.dir > 0 ? e.x + e.w + 6 : e.x - 6;
    const probeY = e.y + e.h + 6;
    let hasGround = false;
    for (const p of platforms) {
      if (probeX >= p.x && probeX <= p.x + p.w && probeY >= p.y && probeY <= p.y + p.h + 6) {
        hasGround = true; break;
      }
    }
    if (!hasGround) e.dir *= -1;

    // simple collision with walls: reverse if overlap
    for (const p of platforms) {
      if (rectOverlap({ x: e.x, y: e.y, w: e.w, h: e.h }, p)) {
        e.dir *= -1;
        e.x += e.dir * e.speed * dt * 2; // nudge out
      }
    }
  }
}

// check coin collection
function checkCoins() {
  for (const c of coins) {
    if (!c.collected) {
      const coinRect = { x: c.x - 10, y: c.y - 10, w: 20, h: 20 };
      if (rectOverlap({ x: player.x, y: player.y, w: player.w, h: player.h }, coinRect)) {
        c.collected = true;
        score += 10;
        scoreEl.textContent = `Score: ${score}`;
        // small pop effect can be added
      }
    }
  }
}

// enemy collisions: stomp or damage
function checkEnemyCollisions() {
  for (const e of enemies) {
    const enemyRect = { x: e.x, y: e.y, w: e.w, h: e.h };
    const playerRect = { x: player.x, y: player.y, w: player.w, h: player.h };

    if (rectOverlap(playerRect, enemyRect)) {
      // if player is falling and intersects from top -> stomp
      const playerBottom = player.y + player.h;
      const enemyTop = e.y;
      if (player.vy > 100 && (playerBottom - enemyTop) < 28) {
        // stomp enemy: remove enemy and bounce
        const idx = enemies.indexOf(e);
        if (idx >= 0) enemies.splice(idx, 1);
        player.vy = -JUMP_SPEED * 0.5;
        score += 25;
        scoreEl.textContent = `Score: ${score}`;
        break;
      } else {
        // take damage: lose a life and respawn
        takeDamage();
        break;
      }
    }
  }
}

function takeDamage() {
  lives--;
  livesEl.textContent = `Lives: ${lives}`;
  player.isDead = true;
  player.blinkTimer = 1.2;
  // respawn after short delay
  setTimeout(() => {
    respawnPlayer();
  }, 350);
}

function respawnPlayer() {
  if (lives <= 0) {
    // reset level
    lives = 3;
    score = 0;
    coins.forEach(c => c.collected = false);
    enemies = [
      { x: 520, y: HEIGHT - TILE - 36, w: 36, h: 36, dir: 1, speed: 80 },
      { x: 320, y: HEIGHT - 3*TILE - 36, w: 36, h: 36, dir: -1, speed: 70 }
    ];
  }
  player.x = 120;
  player.y = HEIGHT - TILE - player.h;
  player.vx = player.vy = 0;
  player.isDead = false;
  scoreEl.textContent = `Score: ${score}`;
  livesEl.textContent = `Lives: ${lives}`;
}

// render everything
function draw() {
  // clear
  ctx.clearRect(0, 0, WIDTH, HEIGHT);

  // background subtle gradient (already CSS but redraw for safety)
  // draw platforms
  for (const p of platforms) {
    ctx.fillStyle = '#9aa5ae';
    ctx.fillRect(p.x, p.y, p.w, p.h);
    // platform top highlight
    ctx.fillStyle = '#cfd8dc';
    ctx.fillRect(p.x, p.y, p.w, 6);
  }

  // draw coins
  for (const c of coins) {
    if (c.collected) continue;
    ctx.beginPath();
    ctx.fillStyle = '#ffcc00';
    ctx.arc(c.x, c.y, 10, 0, Math.PI*2);
    ctx.fill();
    ctx.strokeStyle = '#b58800';
    ctx.stroke();
  }

  // draw enemies
  for (const e of enemies) {
    ctx.fillStyle = '#d9534f';
    ctx.fillRect(e.x, e.y, e.w, e.h);
    // eye
    ctx.fillStyle = '#222';
    ctx.fillRect(e.x + e.w*0.55, e.y + 8, 6, 6);
  }

  // draw player (with blinking if dead)
  if (player.blinkTimer > 0) {
    if (Math.floor(player.blinkTimer * 10) % 2 === 0) {
      // skip drawing (blink)
    } else {
      drawPlayerRect();
    }
  } else {
    drawPlayerRect();
  }
}

function drawPlayerRect() {
  ctx.fillStyle = '#2b7bd8';
  ctx.fillRect(player.x, player.y, player.w, player.h);
  // simple face
  ctx.fillStyle = '#081022';
  ctx.fillRect(player.x + 8, player.y + 12, 6, 6);
  ctx.fillRect(player.x + player.w - 14, player.y + 12, 6, 6);
}

// main update loop
function tick(now) {
  const dt = Math.min(0.033, (now - lastTime) / 1000); // clamp dt to avoid huge jumps
  lastTime = now;
function gameLoop(ts) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!gameRunning) {
        requestAnimationFrame(gameLoop);
        return;
    }

    // Draw background
    if (bgLoaded) {
        ctx.drawImage(bg, 0, 0, canvas.width, canvas.height);
    }

    // UPDATE GAME OBJECTS
    update(0.016);

    // DRAW PLAYER
    drawPlayer();

    requestAnimationFrame(gameLoop);
}

  // update logic
  if (!player.isDead) {
    resolvePlayer(dt);
    updateEnemies(dt);
    checkCoins();
    checkEnemyCollisions();
  } else {
    // when blinking after damage, reduce timer
    player.blinkTimer = Math.max(0, player.blinkTimer - dt);
    if (player.blinkTimer === 0) player.isDead = false;
  }

  // fall-off death
  if (player.y > HEIGHT + 200) {
    takeDamage();
    respawnPlayer();
  }

  draw();

  requestAnimationFrame(tick);
}

// start
respawnPlayer();
lastTime = performance.now();
requestAnimationFrame(tick);
document.getElementById("startBtn").addEventListener("click", () => {
    document.getElementById("startScreen").style.display = "none";
    document.getElementById("gameCanvas").style.display = "block";
    gameRunning = true;
});
