interface AvatarPanelProps {
  /** When true, emphasize that text chat continues without video. */
  videoUnavailable?: boolean;
}

export default function AvatarPanel({ videoUnavailable = true }: AvatarPanelProps) {
  return (
    <div className="avatar-panel">
      <div className="avatar-frame">
        <img
          className="avatar-image"
          src="/avatars/maya.svg"
          alt="Maya, AI health educator (static image)"
          width={120}
          height={120}
        />
      </div>
      <div className="avatar-copy">
        <p className="avatar-name">Maya · AI health educator</p>
        <p className="avatar-caption">
          {videoUnavailable
            ? 'Video avatar session unavailable — continuing with this image and text replies from the guide.'
            : 'Live video session active.'}
        </p>
      </div>
    </div>
  );
}
