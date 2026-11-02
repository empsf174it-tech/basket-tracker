# Project: Shooting Form Lab

Build a mobile-first web app that uses the phone camera to analyse my basketball shooting FORM from the SIDE VIEW, compares it to targets for Free Throw, 2-Pointer and 3-Pointer, and coaches me to fix one thing at a time. All processing is on-device (no video or data leaves the phone). Deployed as a static site on GitHub Pages.

MAIN GOAL: make my shooting form good. Order of importance: (1) trustworthy measurements, (2) coaching that improves my form, (3) later extras.

## First actions
1. Save this entire brief as `SPEC.md` in the repo.
2. Create a short `CLAUDE.md` containing: the stack, the architecture rules below, the stage workflow, and "read SPEC.md before each stage".
3. Then start Stage 1. Work in stages, commit after each stage, and STOP after Stage 1 and after each later stage so I can test on my phone.

## About me
- Height 168 cm (5'6"), configurable in settings. Right-handed by default, with a Left/Right toggle.
- I practise WITHOUT a hoop, holding a real ball, so this version measures form only, not make/miss. Do not build court locations or make/miss logging, but design the data model so they can be added later (shot types defined as data; every rep stored with shotType, timestamp, source, metrics, and optional landmark frames).

## Stack
- Vite + React 18 + TypeScript (strict), Tailwind CSS, Zustand (state), Dexie (IndexedDB), Chart.js, vite-plugin-pwa, Vitest, ESLint + Prettier.
- Pose: `@mediapipe/tasks-vision` PoseLandmarker with lite, full and heavy models (GPU delegate, CPU fallback). Bundle the models and wasm under `public/` so the app works offline.
- GitHub Pages: Vite `base` from an env var (works under `/<repo-name>/`) and a GitHub Actions workflow that builds and deploys on push to main. Camera needs HTTPS (Pages is fine; localhost for dev).

## Architecture rules
- `src/engine/` is framework-agnostic TypeScript with no React imports: camera, poseRunner, smoothing (One Euro filter), calibration, shotDetector (state machine), metrics, physics, scoring, targets, priorities, cues. Pure and unit-tested.
- The per-frame loop (camera, pose, smoothing, detector, overlay drawing) runs outside React state, using refs and a canvas. React gets throttled events and a UI snapshot of at most about 10 updates a second. Never push per-frame landmarks into React state.
- Keep the engine interface simple enough to move inference to a Web Worker later.
- `src/ui/` (React screens and components), `src/store/` (Zustand), `src/db/` (Dexie schema).

## Screens
1. Setup: shot type tabs (FT / 2PT / 3PT), shooting hand, height, camera (front/rear), mirror toggle, model quality (Speed / Balanced / Accurate = lite / full / heavy, default Balanced, auto-suggest lighter if FPS stays below 20). Setup guide: phone in PORTRAIT on a stand, hip height, 2.5 to 3 m (8 to 10 ft) away, exactly side-on, whole body plus raised arms in frame, good light, fitted clothing, hold a real ball, check ceiling clearance, and shoot toward a soft target only if safe. Note that shadow shooting without a ball changes mechanics.
2. Calibration (about 3 s): I stand still side-on; compute cm-per-pixel from my height and the landmarks (ankle to eye/ear distance with a documented, adjustable factor). Show a "calibrated" check, allow redo, and prompt recalibration if the phone appears to have moved. Optional reference-scale check: on a paused frame tap two points and enter a known length (a ball is about 24 cm) and show the discrepancy.
3. Noise test: I hold a still shooting pose for 5 s; compute the SD of each angle and landmark jitter and store it per metric and per model setting. Use it everywhere: show a plus or minus beside each metric and never flag a deviation smaller than 2x the noise.
4. Live: video with skeleton overlay, live angles, phase indicator (Ready, Dip, Set, Release, Follow-through), rep counter, FPS debug toggle, and the feedback card. Screen Wake Lock while active, optional beep and speech cues.
5. Review: replay the last rep as a skeleton animation with a scrubber and the angles at each phase (store landmark frames, not video).
6. Session and History: per-shot-type averages, SD and consistency, charts of recent reps, FT vs 2PT vs 3PT comparison, weekly trends, personal-best consistency, export to JSON and CSV (including app version and model setting), and clear data.
7. Video upload analysis: upload a clip from my phone camera app (120 or 240 fps slow-mo) and analyse every frame offline with the heavy model, with a progress bar, using the same detector and metrics. Ask me for the capture fps and the playback slow-down factor so timing metrics are in real time. Detect multiple shots per clip. Store reps with source: "upload" and the fps.

## Measurement quality
- Side-on check: shoulder separation divided by torso length; above a tunable threshold (default 0.35) show "Turn more side-on" and do not count reps. Framing check: warn "step back" if the head, raised wrist, or ankles are cropped or low-visibility.
- Request 60 fps at 720p (ideal, not exact) and show the actual fps and resolution.
- Smooth landmarks, ignore frames where key landmark visibility is below 0.5, and use the shooting-side arm and leg (auto-pick the side nearest the camera, manual override).

## Shot detection
- Ready: standing, ball low. Dip: hip height and knee angle decreasing to a minimum. Set: wrist/ball lifted to the set point. Release: elbow extending fast, wrist velocity peak, wrist above head height. Follow-through: hold for about 500 to 800 ms.
- Cooldown between reps, rejection of partial motions, "count this rep" and "discard last rep" buttons, and unit tests on recorded landmark fixtures. Dev "Record fixture" option saves a landmark sequence as JSON.

## Metrics per rep
- Knee angle minimum and hip angle minimum at the dip; elbow angle at set and at release; elbow height at set relative to the shoulder.
- Release height of the wrist in cm and as a ratio of my height; forearm angle from horizontal at release (a PROXY for ball release angle, labelled as an estimate); torso lean at release; jump height (ankle rise).
- Dip-to-release time, tempo variability (SD of that time), and follow-through hold time.
- Landing displacement relative to take-off (balance) and wrist flexion change through release (wrist snap).
- Note in the UI that elbow flare cannot be measured from the side view.

## Targets (engine/targets.ts, editable; do NOT invent joint-angle targets)
Release angle (ball leaving hand), computed live from my MEASURED release height:
- Implement `releaseAngleForEntry(releaseHeightM, distanceM, entryAngleDeg)` using projectile motion with the rim at 3.048 m: scan release angle from 30 to 88 degrees in 0.1 steps, compute the speed needed to reach the rim centre, compute the entry angle at the rim, and pick the closest match.
- Distances from release point to rim centre: FT 4.19 m, 2PT 5.0 m (adjustable), 3PT 6.75 m.
- Entry-angle bands: FT 49 to 56 degrees, 2PT 47 to 53, 3PT 44 to 50. Convert them to release-angle bands for my measured release height.
- Vitest checks, within 0.3 degrees: FT at 2.05 m release height gives 55.9, 59.1, 62.3 for entry 45, 50, 55. 2PT at 2.15 m gives 53.7 and 60.8 for entry 45 and 55. 3PT at 2.12 m gives 51.9, 55.7, 59.6 for entry 45, 50, 55. Typical bands at my size: FT about 58 to 62, 2PT about 55 to 59, 3PT about 51 to 56.
- Show required release speed (about 7.3, 7.8 and 8.8 m/s) as information only.

Joint angles (elbow, knee, hip, torso, jump) use PERSONAL BASELINE mode:
- "That felt good" saves a rep as a baseline for the current shot type. After 5 or more, targets become mean plus or minus 1.5 SD per metric, per shot type. Before that, show raw values with no pass/fail colouring.
- Relative rules from research, checked on the comparison screen once I have 5 or more reps in each of two shot types: 3PT shows deeper knee and hip bend and a lower elbow at set than FT and 2PT; 3PT release angle is lower than FT and 2PT; FT and 2PT release angles are similar; 2PT and 3PT release height is higher than FT. Flag anything going the other way in plain language.

## Coaching layer
- One priority fix at a time: rank deviations by deviation divided by noise-or-SD, weighted by an editable importance order in `priorities.ts` (default: release height and follow-through, set point and elbow, dip depth and tempo, landing balance). Surface ONE cue per set. Cues live in `cues.ts`, tied to a metric and direction, in short, simple, outward-focused wording (for example "Finish tall and hold the follow-through").
- Feedback schedule: default "Set summary" (reps log silently; after every 5 reps show averages and the single cue). Options for per-rep feedback and a "faded" mode (feedback on about half the reps).
- Fingerprint: mean and SD of reps flagged "That felt good"; if none, the 20% of reps closest to the session median, labelled "your most repeatable form". State clearly that consistent does not mean correct; correctness comes from the physics bands and the relative rules.
- Per-rep score 0 to 100 from metrics that have targets, colour-coded green/amber/red, with plain-language cues such as "Release angle 49 degrees, target 51 to 56. Finish higher and hold the follow-through."
- Fatigue and drift: compare the first 10 and last 10 reps for drift in each metric and in consistency; flag "form drifting, take a break".

## Validation harness (dev screen)
- Import a CSV of values I measured by hand from the same clips (rep id, release frame, release angle, elbow angle, and so on). Report mean bias, SD, and mean absolute error per metric, plus how many frames off the release detection is. Allow saving a per-metric bias correction in settings. Unit-test the comparison math.

## Quality
- Dark, high-contrast, large touch targets, usable one-handed from a distance. At least 20 FPS on a mid-range phone. Handle orientation changes, tab backgrounding, and camera permission errors gracefully. Accessible labels, no console errors.
- README: local dev, tests, deploy to Pages, phone setup guide, limitations (side view only, release angle is a proxy, no ball tracking until the last stage, no make/miss).

## Stages (stop after each one for my phone test)
1. Scaffold, camera, skeleton overlay, live angles, side-on and framing checks, model quality setting, FPS display, and the Pages deploy workflow.
2. Calibration, shot detection, metrics, physics and detector tests, the video upload analysis (with fps and slow-down inputs), and the fixture recorder.
3. Targets, personal baseline, relative rules, noise test, per-rep scoring and feedback card.
4. Coaching layer (priority fix, set summary, fingerprint, fatigue), Review replay, History, charts, export.
5. Validation harness, reference-scale check, PWA and offline, README polish.
6. Front-view alignment session: lateral elbow deviation from the shoulder-to-wrist vertical, shoulder level, stance width ratio, shown as an "Alignment" card.
7. ONLY when I say go, and only after the form readings are trustworthy: ball tracking and a virtual hoop. Detect the ball (MediaPipe ObjectDetector sports ball class or HSV colour segmentation) for about 0.3 s after release, convert to metres, fit a parabola to at least 6 points, and derive the real launch angle and speed. Compute where the trajectory crosses rim height at the selected distance (short, long, or on target in cm, with an estimated entry angle), labelled "estimated" with a confidence indicator, hidden if there are fewer than 6 points or the fit is poor. Compare with the forearm proxy and correct it.

## Acceptance
- Physics tests pass; detector tests pass on fixtures; the 240 fps upload gives metrics that match my hand measurements within the noise floor.
- On my phone via the Pages URL: calibrate, run the noise test, and complete 10 shadow-shooting reps per shot type with each rep detected and logged.
- After a 20-rep session the app shows ONE clear cue per set, and the summary distinguishes consistent from correct.
- History persists after reload, the app loads offline after the first visit, and the CSV export has one row per rep with all metrics.
