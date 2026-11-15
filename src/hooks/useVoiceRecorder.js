import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * status: idle | starting | recording | paused | stopping | stopped | error
 * Elapsed time is measured from timestamps, not by counting interval ticks, so it stays accurate.
 */
export function useVoiceRecorder() {
  const [status, setStatus] = useState('idle');
  const [elapsedMs, setElapsedMs] = useState(0);
  const [error, setError] = useState('');

  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const blobRef = useRef(null);
  const timerRef = useRef(null);
  const accumulatedRef = useRef(0);
  const segmentStartRef = useRef(0);
  const stopResolverRef = useRef(null);

  const releaseStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  /** The finished recording, available once status is 'stopped'. */
  const getRecording = useCallback(() => {
    if (!blobRef.current || blobRef.current.size === 0) return null;
    return { blob: blobRef.current, durationSeconds: Math.round(accumulatedRef.current / 1000) };
  }, []);

  const pauseClock = useCallback(() => {
    clearInterval(timerRef.current);
    timerRef.current = null;
    if (segmentStartRef.current) {
      accumulatedRef.current += performance.now() - segmentStartRef.current;
      segmentStartRef.current = 0;
    }
    setElapsedMs(accumulatedRef.current);
  }, []);

  const runClock = useCallback(() => {
    clearInterval(timerRef.current);
    segmentStartRef.current = performance.now();
    timerRef.current = setInterval(() => {
      setElapsedMs(accumulatedRef.current + performance.now() - segmentStartRef.current);
    }, 250);
  }, []);

  const reset = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder) {
      recorder.ondataavailable = null;
      recorder.onstop = null;
      if (recorder.state !== 'inactive') recorder.stop();
    }
    recorderRef.current = null;
    stopResolverRef.current?.(null);
    stopResolverRef.current = null;
    clearInterval(timerRef.current);
    timerRef.current = null;
    segmentStartRef.current = 0;
    accumulatedRef.current = 0;
    chunksRef.current = [];
    blobRef.current = null;
    releaseStream();
    setElapsedMs(0);
    setError('');
    setStatus('idle');
  }, [releaseStream]);

  const start = useCallback(async () => {
    reset();
    setStatus('starting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      // The final chunk is delivered asynchronously after stop(); only allow saving once it has arrived.
      recorder.onstop = () => {
        blobRef.current = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        chunksRef.current = [];
        releaseStream();
        setStatus('stopped');
        stopResolverRef.current?.(getRecording());
        stopResolverRef.current = null;
      };

      recorder.start();
      runClock();
      setStatus('recording');
      return null;
    } catch (err) {
      releaseStream();
      const message =
        err?.name === 'NotAllowedError' ? 'Microphone access was denied.' : err?.message || 'Unable to access microphone';
      setError(message);
      setStatus('error');
      return message;
    }
  }, [reset, releaseStream, runClock, getRecording]);

  const pause = useCallback(() => {
    if (recorderRef.current?.state !== 'recording') return;
    recorderRef.current.pause();
    pauseClock();
    setStatus('paused');
  }, [pauseClock]);

  const resume = useCallback(() => {
    if (recorderRef.current?.state !== 'paused') return;
    recorderRef.current.resume();
    runClock();
    setStatus('recording');
  }, [runClock]);

  /** Stops recording; resolves with the finished recording (or null) once the last chunk has arrived. */
  const stop = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === 'inactive') return Promise.resolve(getRecording());
    pauseClock();
    setStatus('stopping');
    return new Promise((resolve) => {
      stopResolverRef.current = resolve;
      recorder.stop();
    });
  }, [pauseClock, getRecording]);

  // Release the microphone if the component goes away mid-recording.
  useEffect(() => reset, [reset]);

  return {
    status,
    error,
    elapsedSeconds: Math.floor(elapsedMs / 1000),
    isActive: status === 'recording' || status === 'paused' || status === 'stopping',
    hasUnsavedAudio: status !== 'idle' && status !== 'error' && status !== 'starting',
    start,
    pause,
    resume,
    stop,
    reset,
    getRecording,
  };
}
