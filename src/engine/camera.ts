export type Facing = 'user' | 'environment';

export type CameraErrorKind =
  'permission' | 'notFound' | 'inUse' | 'insecure' | 'unsupported' | 'unknown';

export class CameraError extends Error {
  constructor(
    message: string,
    public readonly kind: CameraErrorKind,
  ) {
    super(message);
  }
}

/** What the camera actually delivers (requests are only "ideal"). */
export interface CameraInfo {
  width: number;
  height: number;
  frameRate: number | null;
}

/** Open the camera, asking for portrait 720p at 60 fps (ideal, not exact). */
export async function openCamera(facing: Facing): Promise<MediaStream> {
  if (!window.isSecureContext) {
    throw new CameraError('Camera needs HTTPS (or localhost).', 'insecure');
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new CameraError('This browser does not support camera access.', 'unsupported');
  }
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: { ideal: facing },
        width: { ideal: 720 },
        height: { ideal: 1280 },
        frameRate: { ideal: 60 },
      },
    });
  } catch (e) {
    const name = (e as DOMException | undefined)?.name;
    if (name === 'NotAllowedError' || name === 'SecurityError')
      throw new CameraError(
        'Camera permission was denied. Allow camera access in your browser settings and try again.',
        'permission',
      );
    if (name === 'NotFoundError' || name === 'OverconstrainedError')
      throw new CameraError('No suitable camera was found.', 'notFound');
    if (name === 'NotReadableError' || name === 'AbortError')
      throw new CameraError('The camera is in use by another app.', 'inUse');
    throw new CameraError(`Could not open the camera (${name ?? 'unknown error'}).`, 'unknown');
  }
}

export function cameraInfo(stream: MediaStream | null, video: HTMLVideoElement): CameraInfo | null {
  const track = stream?.getVideoTracks()[0];
  const s = track?.getSettings();
  const width = video.videoWidth || s?.width || 0;
  const height = video.videoHeight || s?.height || 0;
  if (!width || !height) return null;
  return { width, height, frameRate: s?.frameRate ? Math.round(s.frameRate) : null };
}

export function stopStream(stream: MediaStream | null): void {
  stream?.getTracks().forEach((t) => t.stop());
}

export function streamIsLive(stream: MediaStream | null): boolean {
  return !!stream && stream.getVideoTracks().some((t) => t.readyState === 'live');
}

/** Screen Wake Lock wrapper; silently no-ops where unsupported. */
export class WakeLock {
  private sentinel: WakeLockSentinel | null = null;

  async acquire(): Promise<void> {
    try {
      if ('wakeLock' in navigator && !this.sentinel) {
        this.sentinel = await navigator.wakeLock.request('screen');
        this.sentinel.addEventListener('release', () => (this.sentinel = null));
      }
    } catch {
      // Wake lock can be refused (e.g. low battery); not fatal.
    }
  }

  async release(): Promise<void> {
    await this.sentinel?.release().catch(() => undefined);
    this.sentinel = null;
  }
}
