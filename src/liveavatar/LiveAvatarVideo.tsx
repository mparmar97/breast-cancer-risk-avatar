import { useEffect, useRef } from 'react';

interface LiveAvatarVideoProps {
  /** When true, the video layer is visible; element stays mounted so attach can succeed. */
  visible: boolean;
  /**
   * When false, keep the video element muted (LITE plays TTS locally to avoid
   * double audio / autoplay blocks). When true, unmute LiveKit remote audio (FULL).
   */
  remoteAudioEnabled?: boolean;
  onVideoElement: (el: HTMLVideoElement | null) => void;
}

export default function LiveAvatarVideo({
  visible,
  remoteAudioEnabled = true,
  onVideoElement,
}: LiveAvatarVideoProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    onVideoElement(videoRef.current);
    return () => onVideoElement(null);
  }, [onVideoElement]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    // Property (not only attribute) — browsers keep muted sticky otherwise.
    el.muted = !remoteAudioEnabled;
    el.volume = remoteAudioEnabled ? 1 : 0;
    if (visible && remoteAudioEnabled) {
      void el.play().catch(() => undefined);
    }
  }, [visible, remoteAudioEnabled]);

  return (
    <div
      className={`liveavatar-video-frame${visible ? '' : ' liveavatar-video-frame--hidden'}`}
      aria-hidden={!visible}
    >
      <video
        ref={videoRef}
        className="liveavatar-video"
        autoPlay
        playsInline
        muted={!remoteAudioEnabled}
        aria-label="Live AI avatar video"
      />
    </div>
  );
}
