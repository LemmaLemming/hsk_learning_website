import { useEffect, useState } from "react";
import { characterFor, displayFor } from "../utils/vocab";
import type {
  CharacterType,
  HydratedVocabItem,
  VisibleField,
  VocabStatus,
} from "../types";

const FIELD_LABELS: Record<VisibleField, string> = {
  pinyin: "Pinyin",
  toneNumber: "Tone number",
  wadeGiles: "Wade-Giles",
  bopomofo: "Bopomofo",
  gwoyeu: "Gwoyeu",
  meaning: "Meaning",
  partsOfSpeech: "Parts of speech",
  radical: "Radical",
  frequency: "Frequency",
  classifiers: "Classifiers",
};

interface Props {
  deck: HydratedVocabItem[]; // The current deck cards in order
  deckIndex: number; // 1-based display index (Day N)
  characterType: CharacterType;
  frontFields: VisibleField[]; // Fields shown on card front (before flip)
  backFields: VisibleField[]; // Fields shown on card back (after flip)
  onStatusChange: (level: number, vocabId: number, status: VocabStatus) => void;
  onSkip: (level: number, vocabId: number) => void; // distinct from status change
  onDeckComplete: () => void; // called when all cards in deck are "learnt"
}

export default function FlashcardDeck({
  deck,
  deckIndex,
  characterType,
  frontFields,
  backFields,
  onStatusChange,
  onSkip,
  onDeckComplete,
}: Props) {
  const [flipped, setFlipped] = useState(false);
  const [localDeck, setLocalDeck] = useState<HydratedVocabItem[]>([...deck]);
  const [showCongrats, setShowCongrats] = useState(false);

  // Sync from the parent deck ONLY when new cards appear (skip cascade pulls
  // a card forward from the next deck). Status-only changes must NOT reset the
  // stack, otherwise already-processed cards would pop back to the top.
  useEffect(() => {
    setLocalDeck((prev) => {
      const prevKeys = new Set(
        prev.map((h) => `${h.item.level}:${h.item.vocabId}`)
      );
      const hasNewCards = deck.some(
        (h) => !prevKeys.has(`${h.item.level}:${h.item.vocabId}`)
      );
      if (!hasNewCards) return prev;
      return [...deck];
    });
    setFlipped(false);
  }, [deck]);

  const current = localDeck[0];
  const remaining = localDeck.length;

  const handleFlip = () => {
    if (!current) return;
    setFlipped((f) => !f); // toggle front <-> back
  };

  const advanceCard = (updatedDeck: HydratedVocabItem[]) => {
    // Remove the front card
    const next = updatedDeck.slice(1);
    const movedCard = updatedDeck[0];

    if (movedCard.item.status === "unlearned") {
      // Cycle to bottom
      next.push(movedCard);
    }
    // Learnt/skipped: removed permanently from working deck

    setFlipped(false);
    setLocalDeck(next);

    const allDone =
      next.length === 0 || next.every((h) => h.item.status === "learnt");
    if (allDone) {
      setShowCongrats(true);
      onDeckComplete();
    }
  };

  const handleSetStatus = (status: VocabStatus) => {
    if (!current) return;
    // Propagation to the parent for persistence:
    //  - skipped: the parent runs the skip cascade (handles status itself)
    //  - learnt/unlearned: plain status update
    if (status === "skipped") {
      onSkip(current.item.level, current.item.vocabId);
    } else {
      onStatusChange(current.item.level, current.item.vocabId, status);
    }
    // Update status in local copy before advancing
    const updated: HydratedVocabItem[] = localDeck.map((h, i) =>
      i === 0 ? { ...h, item: { ...h.item, status } } : h
    );
    advanceCard(updated);
  };

  if (!current && !showCongrats) {
    return <p className="placeholder">No cards in this deck.</p>;
  }

  return (
    <>
      <p className="flashcard-meta">
        Day {deckIndex} &mdash; {remaining} card
        {remaining === 1 ? "" : "s"} remaining
      </p>
      <div className="flashcard-scene">
        <div className="flashcard-stack">
          {/* Ghost depth cards */}
          <div className="flashcard-ghost" aria-hidden="true" />
          <div className="flashcard-ghost" aria-hidden="true" />
          {/* Active card */}
          {current && (
            <div
              className={`flashcard-wrapper${flipped ? " is-flipped" : ""}`}
              onClick={handleFlip}
              role="button"
              aria-label={flipped ? "Card flipped; click to flip back" : "Click to reveal back"}
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") handleFlip();
              }}
            >
              {/* Front face */}
              <div className="flashcard-face front">
                <span className="flashcard-level-badge">
                  HSK {current.item.level}
                </span>
                <span className="flashcard-char">
                  {characterFor(current.entry, characterType)}
                </span>
                {frontFields.map((field) => {
                  const val = displayFor(current.entry, field);
                  if (!val) return null;
                  return (
                    <span key={field} className="flashcard-field">
                      <span className="flashcard-field-label">
                        {FIELD_LABELS[field]}:
                      </span>
                      {val}
                    </span>
                  );
                })}
                {!flipped && (
                  <span className="flashcard-hint">[ click to reveal ]</span>
                )}
              </div>
              {/* Back face */}
              <div className="flashcard-face back">
                <span className="flashcard-level-badge">
                  HSK {current.item.level}
                </span>
                <span className="flashcard-char">
                  {characterFor(current.entry, characterType)}
                </span>
                {backFields.map((field) => {
                  const val = displayFor(current.entry, field);
                  if (!val) return null;
                  return (
                    <span key={field} className="flashcard-field">
                      <span className="flashcard-field-label">
                        {FIELD_LABELS[field]}:
                      </span>
                      {val}
                    </span>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Status buttons — only shown after flip */}
      {flipped && current && (
        <div className="flashcard-actions">
          <button
            className="flashcard-status-btn learnt"
            onClick={() => handleSetStatus("learnt")}
          >
            [ Learnt ✓ ]
          </button>
          <button
            className="flashcard-status-btn skipped"
            onClick={() => handleSetStatus("skipped")}
          >
            [ Skip → ]
          </button>
          <button
            className="flashcard-status-btn unlearned"
            onClick={() => handleSetStatus("unlearned")}
          >
            [ Not Learnt ✗ ]
          </button>
        </div>
      )}

      {/* Congrats popup */}
      {showCongrats && (
        <div className="congrats-overlay" role="dialog" aria-modal="true">
          <div className="congrats-box">
            <span className="congrats-stars">★★★</span>
            <h2>=== Day {deckIndex} Complete! ===</h2>
            <p>
              You learnt all {deck.length} word{deck.length === 1 ? "" : "s"}{" "}
              for today. 加油！
            </p>
            <button
              className="retro-btn primary"
              onClick={() => setShowCongrats(false)}
            >
              [ Continue ]
            </button>
          </div>
        </div>
      )}
    </>
  );
}