# Galactica Mini YT

A tiny, mobile-first arcade space shooter built for quick HTML5 deployment.

## Gameplay

- Drag/touch to move the player ship
- Auto-fire lasers upward
- Destroy enemy ships and asteroids
- Collect powerups
- Survive as long as possible and beat your best score

## Run locally

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
npm run preview
```

## Assets

The game works with built-in vector fallback art. When generated image assets are ready, place them here:

```txt
public/assets/player-ship.png
public/assets/enemy-ship-1.png
public/assets/enemy-ship-2.png
public/assets/asteroid.png
public/assets/laser.png
public/assets/powerup.png
public/assets/background.png
```

If an asset is missing, the game automatically uses the fallback drawing.

## Goal

Simple, free, lightweight arcade game suitable for web/mobile playtesting and future YouTube Playables packaging.
