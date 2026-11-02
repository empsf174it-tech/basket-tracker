import { useEffect, useState } from 'react';
import { db, type RepRow, type SessionRow } from '../../db/db';
import { deleteRep, deleteSession, exportCsv, exportJson } from '../../db/repo';
import { METRICS, formatMetric, mean, type MetricKey } from '../../engine/metrics';
import { SHOT_TYPES } from '../../engine/shotTypes';
import { useApp } from '../../store/app';
import { useLiveQuery } from '../useLiveQuery';

const SUMMARY: MetricKey[] = ['elbowRelease', 'kneeDip', 'releaseHeightCm', 'tempoMs'];

export function HistoryScreen() {
  const sessionId = useApp((s) => s.historySessionId);
  return sessionId === null ? <SessionList /> : <SessionDetail sessionId={sessionId} />;
}

function SessionList() {
  const { go, openSession } = useApp();
  const data = useLiveQuery(async () => {
    const [sessions, reps] = await Promise.all([
      db.sessions.orderBy('startedAt').reverse().toArray(),
      db.reps.toArray(),
    ]);
    return { sessions, reps };
  }, []);
  const persisted = usePersisted();
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      alert(`Export failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const totalShots = data?.reps.length ?? 0;

  return (
    <main className="flex flex-col gap-4 overflow-y-auto p-4 pb-10">
      <header className="flex items-center gap-2">
        <button className="btn-ghost" onClick={() => go('setup')}>
          ← Back
        </button>
        <h1 className="flex-1 text-center text-2xl font-bold">History</h1>
        <div className="w-[88px]" />
      </header>

      <section className="rounded-xl bg-panel p-4 text-white/85">
        <p>
          {totalShots} shot{totalShots === 1 ? '' : 's'} saved on this phone. They stay here without
          internet. Export a copy now and then as a backup.
        </p>
        {persisted === false && (
          <p className="mt-2 text-sm text-amber-300">
            The browser may clear this data if the phone runs low on space. Install the app (browser
            menu → Add to Home screen) to protect it.
          </p>
        )}
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            className="btn-ghost"
            disabled={busy || !totalShots}
            onClick={() => run(exportCsv)}
          >
            Export CSV
          </button>
          <button
            className="btn-ghost"
            disabled={busy || !totalShots}
            onClick={() => run(exportJson)}
          >
            Backup JSON
          </button>
        </div>
      </section>

      {!data && <p className="text-white/60">Loading…</p>}
      {data && data.sessions.length === 0 && (
        <p className="rounded-xl bg-panel p-4 text-white/70">
          No sessions yet. Start the camera and take some shots. Each shot is saved automatically.
        </p>
      )}

      <ul className="flex flex-col gap-2">
        {data?.sessions.map((s) => {
          const reps = data.reps.filter((r) => r.sessionId === s.id);
          return (
            <li key={s.id}>
              <button
                className="w-full rounded-xl bg-panel p-4 text-left active:scale-[0.99]"
                onClick={() => openSession(s.id!)}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-lg font-semibold">{fmtDateTime(s.startedAt)}</span>
                  <span className="text-white/70">
                    {reps.length} shot{reps.length === 1 ? '' : 's'}
                  </span>
                </div>
                <div className="text-sm text-white/60">
                  {typeCounts(reps)}
                  {s.source === 'file' ? ' · video file' : ''}
                  {s.endedAt ? ` · ${fmtDuration(s.endedAt - s.startedAt)}` : ''}
                </div>
                <MetricRow reps={reps} />
              </button>
            </li>
          );
        })}
      </ul>
    </main>
  );
}

function SessionDetail({ sessionId }: { sessionId: number }) {
  const openSession = useApp((s) => s.openSession);
  const data = useLiveQuery(
    async () => ({
      session: await db.sessions.get(sessionId),
      reps: await db.reps.where('sessionId').equals(sessionId).sortBy('timestamp'),
    }),
    [sessionId],
  );

  if (data && !data.session) {
    return (
      <main className="flex flex-col gap-4 p-4">
        <button className="btn-ghost self-start" onClick={() => openSession(null)}>
          ← Sessions
        </button>
        <p className="text-white/70">This session no longer exists.</p>
      </main>
    );
  }

  const session = data?.session as SessionRow | undefined;
  const reps = data?.reps ?? [];
  const types = SHOT_TYPES.filter((t) => reps.some((r) => r.shotType === t.id));

  const onDeleteSession = async () => {
    if (!confirm(`Delete this session and its ${reps.length} shots? This cannot be undone.`))
      return;
    await deleteSession(sessionId);
    openSession(null);
  };

  return (
    <main className="flex flex-col gap-4 overflow-y-auto p-4 pb-10">
      <header className="flex items-center gap-2">
        <button className="btn-ghost" onClick={() => openSession(null)}>
          ← Sessions
        </button>
        <h1 className="flex-1 text-center text-lg font-bold">
          {session ? fmtDateTime(session.startedAt) : '…'}
        </h1>
      </header>

      {session && (
        <p className="text-white/70">
          {reps.length} shots · {session.hand === 'left' ? 'left' : 'right'} hand ·{' '}
          {session.heightCm} cm
        </p>
      )}

      {types.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm uppercase tracking-wide text-white/60">Averages</h2>
          {types.map((t) => {
            const of = reps.filter((r) => r.shotType === t.id);
            return (
              <div key={t.id} className="rounded-xl bg-panel p-3">
                <div className="font-semibold">
                  {t.label} · {of.length} shots
                </div>
                <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                  {METRICS.map((m) => (
                    <div key={m.key} className="flex justify-between gap-2">
                      <dt className="text-white/60">{m.label}</dt>
                      <dd className="font-semibold tabular-nums">
                        {formatMetric(m.key, mean(of.map((r) => r.metrics[m.key])))}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            );
          })}
        </section>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="text-sm uppercase tracking-wide text-white/60">Shots</h2>
        <ol className="flex flex-col gap-2">
          {reps.map((r, i) => (
            <li key={r.id} className="rounded-xl bg-panel p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold">
                  #{i + 1} · {r.shotType}
                </span>
                <span className="flex items-center gap-3 text-sm text-white/60">
                  {fmtTime(r.timestamp)}
                  <button
                    className="rounded-lg px-2 py-1 text-white/70 underline"
                    aria-label={`Delete shot ${i + 1}`}
                    onClick={() => {
                      if (confirm(`Delete shot ${i + 1}?`)) void deleteRep(r.id!);
                    }}
                  >
                    Delete
                  </button>
                </span>
              </div>
              <dl className="mt-2 grid grid-cols-3 gap-x-3 gap-y-1 text-sm">
                {METRICS.map((m) => (
                  <div key={m.key}>
                    <dt className="text-xs text-white/50">{m.short}</dt>
                    <dd className="font-semibold tabular-nums">
                      {formatMetric(m.key, r.metrics[m.key])}
                    </dd>
                  </div>
                ))}
              </dl>
            </li>
          ))}
        </ol>
      </section>

      {session && (
        <button className="btn-ghost text-red-300" onClick={() => void onDeleteSession()}>
          Delete session
        </button>
      )}
    </main>
  );
}

function MetricRow({ reps }: { reps: RepRow[] }) {
  if (!reps.length) return null;
  return (
    <div className="mt-2 grid grid-cols-4 gap-1 text-center">
      {SUMMARY.map((k) => (
        <div key={k}>
          <div className="text-[11px] uppercase text-white/50">
            {METRICS.find((m) => m.key === k)!.short}
          </div>
          <div className="font-semibold tabular-nums">
            {formatMetric(k, mean(reps.map((r) => r.metrics[k])))}
          </div>
        </div>
      ))}
    </div>
  );
}

function usePersisted(): boolean | null {
  const [v, setV] = useState<boolean | null>(null);
  useEffect(() => {
    navigator.storage?.persisted?.().then(setV, () => setV(null));
  }, []);
  return v;
}

function typeCounts(reps: RepRow[]): string {
  return SHOT_TYPES.map((t) => [t.id, reps.filter((r) => r.shotType === t.id).length] as const)
    .filter(([, n]) => n > 0)
    .map(([id, n]) => `${id} ${n}`)
    .join(' · ');
}

function fmtDateTime(ms: number): string {
  return new Date(ms).toLocaleString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function fmtTime(ms: number): string {
  return new Date(ms).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function fmtDuration(ms: number): string {
  const min = Math.round(ms / 60000);
  return min < 1 ? '<1 min' : `${min} min`;
}
