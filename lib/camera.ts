/**
 * iOS Safari is picky about getUserMedia constraints and needs playsInline + muted on <video>.
 * Retry with simpler constraints if the device rejects ideal widths.
 */
export async function getUserMediaFrontCamera(): Promise<MediaStream> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    throw new Error('Camera API not available. Use Safari or Chrome over HTTPS.');
  }

  const attempts: MediaStreamConstraints[] = [
    {
      video: {
        facingMode: { ideal: 'user' },
        width: { ideal: 640 },
        height: { ideal: 480 },
      },
      audio: false,
    },
    { video: { facingMode: 'user' }, audio: false },
    { video: true, audio: false },
  ];

  let lastErr: unknown;
  for (const constraints of attempts) {
    try {
      return await navigator.mediaDevices.getUserMedia(constraints);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

export function formatCameraError(err: unknown): string {
  if (!err || typeof err !== 'object') {
    return 'Camera could not start. Use HTTPS (or localhost) and allow camera when prompted.';
  }
  const e = err as { name?: string; message?: string };
  if (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError') {
    return 'Camera access denied. On iPhone: Settings → Safari → Camera for this site, or tap “AA” → Website Settings → Camera → Allow.';
  }
  if (e.name === 'NotFoundError' || e.name === 'DevicesNotFoundError') {
    return 'No camera found.';
  }
  if (e.name === 'NotReadableError' || e.name === 'TrackStartError') {
    return 'Camera is busy or unavailable. Close other apps using the camera and try again.';
  }
  if (e.name === 'OverconstrainedError' || e.name === 'ConstraintNotSatisfiedError') {
    return 'Camera does not support those settings on this device.';
  }
  if (e.name === 'SecurityError') {
    return 'Camera requires HTTPS (or localhost). Open the deployed site over https://';
  }
  return e.message ?? 'Camera could not start.';
}
