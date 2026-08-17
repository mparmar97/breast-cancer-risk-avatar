import type { ReactNode } from 'react';
import type { AvatarExpression } from '../liveavatar/types';

interface AvatarPanelProps {
  /** When true, emphasize that text chat continues without video. */
  videoUnavailable?: boolean;
  /** When true, show the live video layer over the static image. */
  liveActive?: boolean;
  liveVideo?: ReactNode;
  captionOverride?: string;
  /** Adaptive-state presence cue (voice + listening + frame chrome). */
  expression?: AvatarExpression | null;
}

const EXPRESSION_CAPTION: Record<AvatarExpression, string> = {
  neutral: 'Calm presence.',
  attentive: 'Attentive presence.',
  reassuring: 'Supportive presence.',
  gentle: 'Gentle presence.',
  encouraging: 'Warm, encouraging presence.',
};

export default function AvatarPanel({
  videoUnavailable = true,
  liveActive = false,
  liveVideo,
  captionOverride,
  expression = null,
}: AvatarPanelProps) {
  const expressionCue = expression && liveActive ? expression : null;
  const caption =
    captionOverride ??
    (liveActive
      ? expressionCue
        ? EXPRESSION_CAPTION[expressionCue]
        : 'Live video session active.'
      : videoUnavailable
        ? 'Video avatar session unavailable — continuing with this image and text replies from the guide.'
        : 'Live video session active.');

  return (
    <div
      className={`avatar-panel${liveActive ? ' avatar-panel--live' : ' avatar-panel--static'}${
        expressionCue ? ` avatar-panel--expr-${expressionCue}` : ''
      }`}
    >
      <div
        className={`avatar-frame${liveActive ? ' avatar-frame--live' : ''}${
          expressionCue ? ` avatar-frame--expr-${expressionCue}` : ''
        }`}
      >
        {liveVideo}
        {!liveActive && (
          <img
            className="avatar-image"
            src="/avatars/maya.svg"
            alt="Maya, AI health educator (static image)"
            width={120}
            height={120}
          />
        )}
      </div>
      <div className="avatar-copy">
        <p className="avatar-name">Maya · AI health educator</p>
        <p className="avatar-caption">{caption}</p>
      </div>
    </div>
  );
}
