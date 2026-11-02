# Shooting Form Lab

Side-view basketball shooting form analysis on your phone. Everything runs on-device.

> Progress against [SPEC.md](SPEC.md) (7 stages):
> - **Stage 1 done:** camera (60 fps requested), skeleton overlay, live angles, side-on and framing
>   checks, model quality (Speed / Balanced / Accurate), FPS and camera info, Pages deploy.
> - **Stage 2 in progress:** shot detection, per-shot metrics and saving are in; calibration, physics,
>   slow-mo upload analysis and the fixture recorder are next. (History and export, from Stage 4,
>   are already in.)

## How shots are saved

- A shot is detected when the shooting wrist goes from below the shoulder to above the head and the
  arm extends. It is closed when the hand comes back down (or after a long follow-through).
- Each shot is saved immediately to the phone's browser database (IndexedDB), together with the
  pose frames from the dip to the follow-through. No internet is needed at the court.
- Measurements per shot: elbow at release and at the set point, knee and hip at the deepest dip,
  torso lean, forearm angle, estimated release height and jump height, and dip-to-release tempo.
  Heights are estimates scaled from the height entered on the setup screen.
- **History & export** lists sessions and shots, shows averages per shot type, and exports
  a CSV (one row per shot) or a full JSON backup.
- Data lives in the browser that recorded it. Clearing site data or switching browsers loses it,
  so export a backup now and then. Installing the app (Add to Home screen) protects it from
  automatic cleanup.

## Local dev

```bash
npm install
npm run dev      # copies MediaPipe wasm + downloads the pose model into public/mediapipe on first run
npm test
npm run build
```

On a phone on the same Wi-Fi, the camera needs HTTPS. Use the deployed Pages URL (or a tunnel).
Developer → *Run on video file* feeds a recorded clip through the same pipeline (shots are saved
with source `file`).

## Deploy to GitHub Pages

1. Create a GitHub repo and push this project to `main`.
2. In the repo go to **Settings → Pages → Source** and pick **GitHub Actions**.
3. Each push to `main` runs `.github/workflows/deploy.yml`, which tests, builds with
   `BASE_PATH=/<repo-name>/`, and deploys. The site is served at `https://<user>.github.io/<repo-name>/`.
