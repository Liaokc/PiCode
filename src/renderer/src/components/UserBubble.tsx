import { useState, type JSX } from 'react'
import type { UserEntry } from '../../../shared/chat-reducer'
import { imageDataUrl } from '../../../shared/composer/image-preview'
import { userBubbleSegments } from '../../../shared/user-bubble'
import ImagePreviewOverlay from './ImagePreviewOverlay'
import { WandIcon } from './icons'

/**
 * The composite user bubble (ticket 97, spec R19): the bubble renders the
 * segments the Seam-1 model returns, in order — the skill rendering (wand
 * icon + "Skill" + name, the retired container marker's story: it now lives
 * OUTSIDE the fold, constant live and settled), the user's own text, and the
 * message's image thumbnails. Presence composition, no empty box: a
 * skill-only bubble shows the skill alone (the pre-97 empty gray bubble is
 * gone); zero segments render nothing at all (defensive — the contract never
 * delivers a fully-empty message).
 *
 * Image thumbnails (spec R17): each thumb is a bare zoom-in button over the
 * FULL-resolution data: URL (the 52px box CSS-crops it — the ticket-91
 * discipline); clicking opens the SAME fullscreen preview overlay the
 * composer's attachments use. The open state is bubble-local view state: the
 * mask covers the whole window while open, so only one overlay can ever be
 * up at a time, and open/close touches nothing but this state.
 */
export default function UserBubble({ entry }: { entry: UserEntry }): JSX.Element | null {
  const segments = userBubbleSegments(entry)
  // Which of THIS bubble's images the fullscreen preview shows — null closed.
  const [previewIndex, setPreviewIndex] = useState<number | null>(null)
  const images = entry.images ?? []

  if (segments.length === 0) return null

  return (
    <div className="msg msg-user msg-user-composite">
      {segments.map((segment, index) => {
        switch (segment.kind) {
          case 'skill':
            return (
              <div key={`skill-${index}`} className="user-skill-row">
                <WandIcon size={13} className="user-skill-icon" />
                <span className="user-skill-label">Skill</span>
                <span className="user-skill-name">{segment.name}</span>
              </div>
            )
          case 'text':
            return (
              <div key={`text-${index}`} className="user-bubble-text">
                {segment.text}
              </div>
            )
          case 'images':
            return (
              <div key={`images-${index}`} className="user-image-strip" aria-label="Message images">
                {segment.images.map((image, i) => (
                  <button
                    key={`${image.data.slice(0, 16)}-${i}`}
                    type="button"
                    className="user-image-thumb"
                    aria-label={`Preview image ${i + 1} of ${segment.images.length}`}
                    onClick={() => setPreviewIndex(i)}
                  >
                    <img src={imageDataUrl(image.mimeType, image.data)} alt="Message image" draggable={false} />
                  </button>
                ))}
              </div>
            )
        }
      })}
      {previewIndex !== null && images[previewIndex] !== undefined && (
        <ImagePreviewOverlay
          images={images.map((image, i) => ({ src: imageDataUrl(image.mimeType, image.data), label: `Image ${i + 1}` }))}
          index={previewIndex}
          onNavigate={setPreviewIndex}
          onClose={() => setPreviewIndex(null)}
        />
      )}
    </div>
  )
}
