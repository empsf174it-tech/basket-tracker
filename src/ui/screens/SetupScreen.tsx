import { useRef } from 'react';
import { SHOT_TYPES, type ShotTypeId } from '../../engine/shotTypes';
import { useApp } from '../../store/app';
import { useSettings } from '../../store/settings';
import { Segmented } from '../components/Segmented';

export function SetupScreen() {
  const s = useSettings();
  const go = useApp((a) => a.go);
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <main className="flex flex-col gap-5 overflow-y-auto p-4 pb-10">
      <h1 className="text-2xl font-bold">Shooting Form Lab</h1>

      <Segmented<ShotTypeId>
        label="Shot type"
        value={s.shotType}
        options={SHOT_TYPES.map((t) => ({ value: t.id, label: t.id }))}
        onChange={(shotType) => s.set({ shotType })}
      />

      <section className="flex flex-col gap-3">
        <h2 className="text-sm uppercase tracking-wide text-white/60">Shooting hand</h2>
        <Segmented
          label="Shooting hand"
          value={s.hand}
          options={[
            { value: 'left', label: 'Left' },
            { value: 'right', label: 'Right' },
          ]}
          onChange={(hand) => s.set({ hand })}
        />

        <label className="flex items-center justify-between gap-3 rounded-xl bg-panel p-3">
          <span className="text-lg">Height (cm)</span>
          <input
            type="number"
            inputMode="numeric"
            min={120}
            max={230}
            value={s.heightCm}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (v > 0) s.set({ heightCm: v });
            }}
            className="w-24 rounded-lg bg-bg p-2 text-right text-lg"
          />
        </label>

        <h2 className="text-sm uppercase tracking-wide text-white/60">Camera</h2>
        <Segmented
          label="Camera"
          value={s.facing}
          options={[
            { value: 'environment', label: 'Rear' },
            { value: 'user', label: 'Front' },
          ]}
          onChange={(facing) => s.set({ facing, mirrored: facing === 'user' })}
        />
        <Segmented
          label="Analysed body side"
          value={s.analysisSide}
          options={[
            { value: 'auto', label: 'Auto side' },
            { value: 'left', label: 'Left' },
            { value: 'right', label: 'Right' },
          ]}
          onChange={(analysisSide) => s.set({ analysisSide })}
        />
        <Toggle
          label="Mirror preview"
          on={s.mirrored}
          onChange={(mirrored) => s.set({ mirrored })}
        />
        <Toggle
          label="Show FPS (debug)"
          on={s.showFps}
          onChange={(showFps) => s.set({ showFps })}
        />
      </section>

      <button className="btn-primary" onClick={() => go('live', { kind: 'camera' })}>
        Start camera
      </button>

      <details className="rounded-xl bg-panel p-4" open>
        <summary className="text-lg font-semibold">Phone setup guide</summary>
        <ul className="mt-3 list-disc space-y-1.5 pl-5 text-white/85">
          <li>Phone in PORTRAIT on a stand, lens at about hip height.</li>
          <li>2.5 to 3 m (8 to 10 ft) away.</li>
          <li>Stand exactly side-on to the camera, shooting arm nearest the lens.</li>
          <li>Whole body plus fully raised arms in frame, with some space above your hands.</li>
          <li>Good, even light; fitted clothing so joints are visible.</li>
          <li>Elbow flare cannot be measured from a side view.</li>
        </ul>
      </details>

      <details className="rounded-xl bg-panel p-4">
        <summary className="text-lg font-semibold">Developer</summary>
        <div className="mt-3 flex flex-col gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="video/*"
            className="hidden"
            aria-label="Choose a video file"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) go('live', { kind: 'file', file });
              e.target.value = '';
            }}
          />
          <button className="btn-ghost" onClick={() => fileRef.current?.click()}>
            Run on video file
          </button>
        </div>
      </details>
    </main>
  );
}

function Toggle({
  label,
  on,
  onChange,
}: {
  label: string;
  on: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className="flex min-h-[52px] items-center justify-between rounded-xl bg-panel px-4 text-lg"
    >
      <span>{label}</span>
      <span className={`h-7 w-12 rounded-full p-1 transition ${on ? 'bg-accent' : 'bg-white/20'}`}>
        <span
          className={`block h-5 w-5 rounded-full bg-white transition ${on ? 'translate-x-5' : ''}`}
        />
      </span>
    </button>
  );
}
