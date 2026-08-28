import { useEffect, useState } from "react";

interface TutorialPopoverProps {
  targetSelector: string; // e.g. "[data-tour='create-btn']"
  title?: string;
  body: string;
  onSkip?: () => void;
  placement?: "top" | "bottom" | "left" | "right";
  stepNumber?: number;
  totalSteps?: number;
}

const POPUP_W = 280;
const POPUP_H_EST = 170; // rough height for viewport clamping

function computePosition(
  target: DOMRect,
  placement: "top" | "bottom" | "left" | "right",
  popupW: number,
  popupH: number
) {
  const gap = 12;
  switch (placement) {
    case "top":
      return {
        left: target.left + target.width / 2 - popupW / 2,
        top: target.top - popupH - gap,
      };
    case "bottom":
      return {
        left: target.left + target.width / 2 - popupW / 2,
        top: target.bottom + gap,
      };
    case "left":
      return {
        left: target.left - popupW - gap,
        top: target.top + target.height / 2 - popupH / 2,
      };
    case "right":
      return {
        left: target.right + gap,
        top: target.top + target.height / 2 - popupH / 2,
      };
  }
}

/**
 * Retro coach-mark popup: a fixed-position bubble with an arrow pointing at a
 * target element found via `targetSelector`. The overlay does NOT block clicks
 * (pointer-events: none), so the user can still interact with the highlighted
 * element. Disappears if the target is not in the DOM.
 *
 * There is NO "next" button — the hosting page detects when the user performs
 * the taught action and advances (or hides) the popup itself.
 */
export default function TutorialPopover({
  targetSelector,
  title,
  body,
  onSkip,
  placement = "bottom",
  stepNumber,
  totalSteps,
}: TutorialPopoverProps) {
  const [position, setPosition] = useState<{ left: number; top: number } | null>(
    null
  );

  useEffect(() => {
    const update = () => {
      const target = document.querySelector(targetSelector);
      if (!target) {
        setPosition(null);
        return;
      }
      const rect = target.getBoundingClientRect();
      const pos = computePosition(rect, placement, POPUP_W, POPUP_H_EST);
      // Clamp so the popup stays on screen.
      pos.left = Math.max(
        8,
        Math.min(pos.left, window.innerWidth - POPUP_W - 8)
      );
      pos.top = Math.max(
        8,
        Math.min(pos.top, window.innerHeight - POPUP_H_EST - 8)
      );
      setPosition(pos);
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [targetSelector, placement]);

  if (!position) return null;

  return (
    <>
      <div className="tutorial-overlay" aria-hidden="true" />
      <div
        className="tutorial-popover"
        data-placement={placement}
        style={{ left: position.left, top: position.top }}
        role="dialog"
        aria-label={body}
      >
        {title && <h4>{title}</h4>}
        <p>{body}</p>
        <div className="tutorial-arrow" aria-hidden="true" />
        <div className="tutorial-actions">
          <span>
            {onSkip ? (
              <a
                href="#"
                className="tutorial-skip"
                onClick={(e) => {
                  e.preventDefault();
                  onSkip();
                }}
              >
                Skip tour
              </a>
            ) : null}
          </span>
          <span className="tutorial-step-count">
            {stepNumber && totalSteps ? `${stepNumber} / ${totalSteps}` : ""}
          </span>
        </div>
      </div>
    </>
  );
}