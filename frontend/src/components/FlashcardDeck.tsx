import { useEffect, useRef, useState } from "react";
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

const keyOf = (h: HydratedVocabItem) =>
  `${h.item.level}:${h.item.vocabId}`;

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
  const [viewIndex, setViewIndex] = useState(0);
  const [showCongrats, setShowCongrats] = useState(false);

  // Keys of the decks we have already seen. Used to detect ONLY genuinely new
  // arrivals (skip cascade pulling cards forward from the next deck). Status
  // changes must NOT trigger a resync: the parent deck still contains the
  // processed card (its status changed), and re-importing it would pop it
  // back to the top instead of dropping it from the study queue.
  const prevDeckKeysRef = useRef<Set<string>>(new Set(deck.map(keyOf)));

  useEffect(() => {
    const newCards = deck.filter(
      (h) => !prevDeckKeysRef.current.has(keyOf(h))
    );
    if (newCards.length > 0) {
      // Skip cascade: append only the freshly pulled-in cards, keeping the
      // local processing order (no already-processed cards re-imported).
      setLocalDeck((prev) => {
        const merged = [...prev];
        for (const card of newCards) {
          if (!prev.some((h) => keyOf(h) === keyOf(card))) merged.push(card);
        }
        return merged;
      });
    }
    prevDeckKeysRef.current = new Set(deck.map(keyOf));
    setFlipped(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deck]);

  const current = localDeck[viewIndex] ?? localDeck[0] ?? undefined;
  const remaining = localDeck.length;

  const handleFlip = () => {
    if (!current) return;
    setFlipped((f) => !f); // toggle front <-> back
  };

  // Browse previous/next WITHOUT changing the card's status label.
  const goPrev = () => {
    if (viewIndex <= 0) return;
    setViewIndex(viewIndex - 1);
    setFlipped(false);
  };

  const goNext = () => {
    if (viewIndex >= localDeck.length - 1) return;
    setViewIndex(viewIndex + 1);
    setFlipped(false);
  };

  const advanceCard = (updatedDeck: HydratedVocabItem[]) => {
    const idx = Math.min(viewIndex, updatedDeck.length - 1);
    const movedCard = updatedDeck[idx];
    if (!movedCard) return;

    const next = [...updatedDeck];
    next.splice(idx, 1);
    if (movedCard.item.status === "unlearned") {
      // Cycle to bottom
      next.push(movedCard);
    }
    // Learnt/skipped: removed permanently from working deck

    setFlipped(false);
    setLocalDeck(next);
    setViewIndex(0);

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
      i === viewIndex ? { ...h, item: { ...h.item, status } } : h
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

      <div className="flashcard-nav">
        <button
          type="button"
          className="flashcard-nav-btn"
          onClick={goPrev}
          disabled={viewIndex <= 0}
          aria-label="Previous card"
          title="Previous card"
        >
          [ &lt; ]
        </button>

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
                aria-label={
                  flipped ? "Card flipped; click to flip back" : "Click to reveal back"
                }
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

        <button
          type="button"
          className="flashcard-nav-btn"
          onClick={goNext}
          disabled={viewIndex >= localDeck.length - 1}
          aria-label="Next card"
          title="Next card"
        >
          [ &gt; ]
        </button>
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