import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
} from "@hello-pangea/dnd";
import { useAuth } from "../contexts/AuthContext";
import { getSet, updateSet, touchSet, saveLastPage } from "../services/setService";
import { getOrCreateUserDoc } from "../services/userService";
import { getVocabById } from "../services/vocabLoader";
import { useVocabData } from "../hooks/useVocabData";
import { useAutosave } from "../hooks/useAutosave";
import VocabCard from "../components/VocabCard";
import FlashcardDeck from "../components/FlashcardDeck";
import AddVocabModal from "../components/AddVocabModal";
import {
  DEFAULT_FLASHCARD_FRONT_FIELDS,
  DEFAULT_FLASHCARD_BACK_FIELDS,
  type HydratedVocabItem,
  type UserPreferences,
  type VocabItem,
  type VocabStatus,
} from "../types";

type StatusFilter = VocabStatus | "all";

const keyOf = (item: VocabItem) => `${item.level}:${item.vocabId}`;

/**
 * After a skip, rebalances the decks so each deck maintains subsetSize cards.
 * When a card is skipped, the first card of the NEXT deck moves up to fill
 * the gap. This cascades through all subsequent decks.
 *
 * Algorithm (O(n)):
 * 1. Collect all non-skipped cards in their original order into a flat buffer.
 * 2. Skipped cards are appended to the very end (last deck shrinks).
 * 3. Decks are re-sliced from this buffer by subsetSize at render time, so
 *    cards from the next deck automatically fill the gap — cascade implied.
 */
function rebalanceDecksAfterSkip(
  items: VocabItem[],
  _subsetSize: number
): VocabItem[] {
  // Separate skipped from non-skipped, preserving order
  const active: VocabItem[] = [];
  const skipped: VocabItem[] = [];
  for (const item of items) {
    if (item.status === "skipped") {
      skipped.push(item);
    } else {
      active.push(item);
    }
  }
  // Reassemble: non-skipped cards fill decks evenly, skipped go to the end
  return [...active, ...skipped];
}

export default function SetDetail() {
  const { setId } = useParams();
  const { user } = useAuth();

  const [name, setName] = useState("");
  const [items, setItems] = useState<VocabItem[]>([]);
  const [shuffled, setShuffled] = useState(false);
  const [subsetSize, setSubsetSize] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<UserPreferences | null>(null);
  const pageSize = prefs?.pageSize ?? 50;
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [showAdd, setShowAdd] = useState(false);
  const [subsetInput, setSubsetInput] = useState("");
  const [version, setVersion] = useState(0);
  const [page, setPage] = useState(0);

  // Load the set document
  useEffect(() => {
    if (!user || !setId) return;
    let active = true;
    getSet(user.uid, setId)
      .then((s) => {
        if (!active) return;
        setName(s.name);
        setItems(s.items ?? []);
        setShuffled(s.shuffled ?? false);
        setSubsetSize(s.subsetSize ?? null);
        if (s.subsetSize) setSubsetInput(String(s.subsetSize));
        setPage(s.lastDeckPage ?? 0);
        setLoaded(true);
      })
      .catch((e) => {
        if (active) setError((e as Error).message);
      });
    return () => {
      active = false;
    };
  }, [user, setId]);

  // Track "last accessed" (prerequisite 1E) whenever the set is opened.
  useEffect(() => {
    if (!user || !setId) return;
    touchSet(user.uid, setId).catch(() => {
      /* non-critical; ignore write failures */
    });
  }, [user, setId]);

  // Persist the last studied deck page (flashcard mode) so the user resumes
  // on the correct day when they return.
  useEffect(() => {
    if (!user || !setId || !loaded || !subsetSize) return;
    saveLastPage(user.uid, setId, page).catch(() => {
      /* non-critical */
    });
  }, [page, user, setId, loaded, subsetSize]);

  useEffect(() => {
    if (!user) return;
    let active = true;
    getOrCreateUserDoc(user)
      .then((p) => {
        if (active) setPrefs(p);
      })
      .catch(() => {
        /* preferences are optional here; defaults apply */
      });
    return () => {
      active = false;
    };
  }, [user]);

  const levels = useMemo(
    () => [...new Set(items.map((i) => i.level))].sort((a, b) => a - b),
    [items]
  );
  const { data: vocabData, loading: vocabLoading } = useVocabData(levels);

  const hydrated: HydratedVocabItem[] = useMemo(() => {
    const out: HydratedVocabItem[] = [];
    for (const item of items) {
      const entry = getVocabById(item.level, item.vocabId);
      if (entry) out.push({ item, entry });
    }
    return out;
  }, [items, vocabData]);

  // --- mutations -----------------------------------------------------------
  // Bump the autosave version after every mutation (cheap change detection).
  const bump = () => setVersion((v) => v + 1);

  const cycleStatus = (level: number, vocabId: number, status: VocabStatus) => {
    setItems((prev) =>
      prev.map((i) =>
        i.level === level && i.vocabId === vocabId ? { ...i, status } : i
      )
    );
    bump();
  };

  const removeItem = (level: number, vocabId: number) => {
    setItems((prev) =>
      prev.filter((i) => !(i.level === level && i.vocabId === vocabId))
    );
    bump();
  };

  const handleShuffle = () => {
    setShuffled(true);
    setItems((prev) => {
      const arr = [...prev];
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    });
    bump();
  };

  const applySubset = () => {
    const n = parseInt(subsetInput, 10);
    if (!Number.isFinite(n) || n <= 0) {
      setSubsetSize(null);
    } else {
      setSubsetSize(Math.min(n, 100));
    }
    bump();
  };

  const addItems = (newItems: VocabItem[]) => {
    setShuffled(false);
    setItems((prev) => [...prev, ...newItems]);
    bump();
  };

  // Skip cascade: mark skipped + rebalance decks (flashcard mode only).
  const handleSkip = (level: number, vocabId: number) => {
    if (!subsetSize) return; // no decks, no cascade needed
    setItems((prev) => {
      const withSkip = prev.map((i) =>
        i.level === level && i.vocabId === vocabId
          ? { ...i, status: "skipped" as VocabStatus }
          : i
      );
      return rebalanceDecksAfterSkip(withSkip, subsetSize);
    });
    bump();
  };

  // --- drag & drop (within a deck only; never between decks) ---------------
  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    if (result.source.droppableId !== result.destination.droppableId) return;
    const globalDeckIdx = Number(result.source.droppableId.replace("deck-", ""));
    const localDeckIdx = globalDeckIdx - page * subsetsPerPage;
    const deck = visibleSubsets[localDeckIdx];
    if (!deck) return;

    const reordered = [...deck];
    const [moved] = reordered.splice(result.source.index, 1);
    reordered.splice(result.destination.index, 0, moved);

    const newOrder = reordered.map((h) => keyOf(h.item));
    const byKey = new Map(reordered.map((h) => [keyOf(h.item), h.item]));

    setItems((prev) => {
      const deckKeys = new Set(newOrder);
      const out: VocabItem[] = [];
      let cursor = 0;
      for (const item of prev) {
        const k = keyOf(item);
        if (deckKeys.has(k)) {
          out.push(byKey.get(newOrder[cursor])!);
          cursor++;
        } else {
          out.push(item);
        }
      }
      return out;
    });
    bump();
  };

  // --- autosave ------------------------------------------------------------
  const saveKey = `${name}:${shuffled}:${subsetSize}:${version}`;
  const save = async () => {
    if (!user || !setId || !loaded) return;
    await updateSet(user.uid, setId, { name, items, shuffled, subsetSize });
  };
  const autosave = useAutosave(save, saveKey, 2000, loaded);

  // --- derived views --------------------------------------------------------
  const counts = useMemo(() => {
    const c = { unlearned: 0, learnt: 0, skipped: 0 };
    for (const i of items) c[i.status] += 1;
    return c;
  }, [items]);

  const filteredHydrated =
    filter === "all"
      ? hydrated
      : hydrated.filter((h) => h.item.status === filter);

  const subsets = useMemo(() => {
    if (!subsetSize || subsetSize <= 0) return [filteredHydrated];
    const out: HydratedVocabItem[][] = [];
    for (let i = 0; i < filteredHydrated.length; i += subsetSize) {
      out.push(filteredHydrated.slice(i, i + subsetSize));
    }
    return out;
  }, [filteredHydrated, subsetSize]);

  // How many subsets to show per page
  const subsetsPerPage = useMemo(() => {
    if (!subsetSize || subsetSize <= 0) {
      return 1; // no decks — paginate individual cards by pageSize
    }
    // Flashcard mode: always exactly 1 deck per page
    return 1;
  }, [subsetSize]);

  // Total pages
  const totalPages = useMemo(() => {
    if (!subsetSize || subsetSize <= 0) {
      // Paginating individual cards within the single "deck"
      return Math.max(1, Math.ceil(filteredHydrated.length / pageSize));
    }
    return Math.max(
      1,
      Math.ceil(subsets.length / subsetsPerPage)
    );
  }, [
    subsets.length,
    subsetsPerPage,
    subsetSize,
    filteredHydrated.length,
    pageSize,
  ]);

  // The visible subsets for the current page
  const visibleSubsets = useMemo(() => {
    if (!subsetSize || subsetSize <= 0) {
      // Single virtual "deck" — slice the cards by page
      const start = page * pageSize;
      const end = start + pageSize;
      return [filteredHydrated.slice(start, end)];
    }
    const start = page * subsetsPerPage;
    const end = start + subsetsPerPage;
    return subsets.slice(start, end);
  }, [subsets, page, subsetsPerPage, subsetSize, filteredHydrated, pageSize]);

  // Reset to page 0 when data shape changes — but skip the initial load so
  // the restored lastDeckPage survives the first post-load render.
  const pageInitRef = useRef(false);
  useEffect(() => {
    if (!loaded) return;
    if (!pageInitRef.current) {
      pageInitRef.current = true;
      return;
    }
    setPage(0);
  }, [filter, subsetSize, shuffled, loaded]);

  const total = items.length;

  const saveText =
    autosave.status === "saving"
      ? "Saving..."
      : autosave.status === "saved"
        ? "Saved."
        : autosave.status === "error"
          ? "ERROR: save failed"
          : "";

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <Link className="back-link" to="/dashboard">
            &lt;&lt; Back to Dashboard
          </Link>
          <h1>{name}</h1>
          <span
            className={`save-indicator ${autosave.status}`}
            role="status"
            aria-live="polite"
          >
            {saveText}
          </span>
          {autosave.error && (
            <span className="error-pre"> *** {autosave.error} ***</span>
          )}
        </div>
      </header>

      {error && <p className="error">{error}</p>}

      {loaded && (
        <>
          <div className="study-controls">
            <button
              className="retro-btn"
              onClick={handleShuffle}
              disabled={total < 2}
            >
              [ Shuffle ]
            </button>
            <div className="subset-control">
              <label htmlFor="subset-size">Split into daily decks of</label>
              <input
                id="subset-size"
                type="number"
                min={1}
                max={100}
                placeholder="10"
                value={subsetInput}
                onChange={(e) => setSubsetInput(e.target.value)}
              />
              <button className="retro-btn" onClick={applySubset}>
                [ Go ]
              </button>
            </div>
            <button className="retro-btn primary" onClick={() => setShowAdd(true)}>
              [ + Add vocab ]
            </button>
          </div>

          <div className="filter-bar">
            <span>Show: </span>
            <a
              className={`filter-link ${filter === "all" ? "active" : ""}`}
              onClick={() => setFilter("all")}
            >
              (ALL {total})
            </a>
            <a
              className={`filter-link ${filter === "unlearned" ? "active" : ""}`}
              onClick={() => setFilter("unlearned")}
            >
              (Unlearned {counts.unlearned})
            </a>
            <a
              className={`filter-link ${filter === "learnt" ? "active" : ""}`}
              onClick={() => setFilter("learnt")}
            >
              (Learnt {counts.learnt})
            </a>
            <a
              className={`filter-link ${filter === "skipped" ? "active" : ""}`}
              onClick={() => setFilter("skipped")}
            >
              (Skipped {counts.skipped})
            </a>
          </div>

          {vocabLoading && <p className="loading">Loading vocab...</p>}
          {!vocabLoading && filteredHydrated.length === 0 && (
            <p className="placeholder">No items to show.</p>
          )}
          {!vocabLoading && filteredHydrated.length > 0 && (
            <>
              {totalPages > 1 && (
                <div className="pagination-controls">
                  <button
                    className="retro-btn"
                    disabled={page === 0}
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                  >
                    [ &lt;&lt; Prev ]
                  </button>
                  <span className="page-indicator">
                    Page {page + 1} of {totalPages}
                  </span>
                  <button
                    className="retro-btn"
                    disabled={page >= totalPages - 1}
                    onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  >
                    [ Next &gt;&gt; ]
                  </button>
                </div>
              )}

              {subsetSize && subsetSize > 0 ? (
                /* FLASHCARD MODE — one deck per page, stacked flashcards */
                <>
                  {visibleSubsets[0] && (
                    <FlashcardDeck
                      key={page} // reset component state when page changes
                      deck={visibleSubsets[0]}
                      deckIndex={page + 1}
                      characterType={prefs?.characterType ?? "simplified"}
                      frontFields={
                        prefs?.flashcardFrontFields ??
                        DEFAULT_FLASHCARD_FRONT_FIELDS
                      }
                      backFields={
                        prefs?.flashcardBackFields ??
                        DEFAULT_FLASHCARD_BACK_FIELDS
                      }
                      onStatusChange={cycleStatus}
                      onSkip={handleSkip}
                      onDeckComplete={() => {
                        /* optional: could auto-advance to next day here */
                      }}
                      onContinue={() =>
                        setPage((p) => Math.min(totalPages - 1, p + 1))
                      }
                      onRedo={() => {
                        // Re-tag every card of the current deck as unlearned.
                        const deckCards = visibleSubsets[0] ?? [];
                        if (deckCards.length === 0) return;
                        const deckKeys = new Set(
                          deckCards.map((h) => keyOf(h.item))
                        );
                        setItems((prev) =>
                          prev.map((i) =>
                            deckKeys.has(keyOf(i))
                              ? { ...i, status: "unlearned" as VocabStatus }
                              : i
                          )
                        );
                        bump();
                      }}
                    />
                  )}
                </>
              ) : (
                /* LIST MODE (existing drag-and-drop) */
                <DragDropContext onDragEnd={handleDragEnd}>
                  <div className="daily-decks">
                    {visibleSubsets.map((subset, idx) => (
                      <fieldset key={idx} className="daily-deck">
                        <legend className="deck-legend">
                          {subsetSize && subsetSize > 0
                            ? `Day ${page * subsetsPerPage + idx + 1} (${
                                subset.length
                              } word${subset.length === 1 ? "" : "s"})`
                            : `Showing ${subset.length} of ${
                                filteredHydrated.length
                              } word${filteredHydrated.length === 1 ? "" : "s"}`}
                        </legend>
                        <Droppable droppableId={`deck-${page * subsetsPerPage + idx}`}>
                          {(provided) => (
                            <div
                              className="vocab-card-list"
                              ref={provided.innerRef}
                              {...provided.droppableProps}
                            >
                              {subset.map((h, index) => (
                                <Draggable
                                  key={keyOf(h.item)}
                                  draggableId={keyOf(h.item)}
                                  index={index}
                                >
                                  {(dragProvided, snapshot) => (
                                    <div
                                      ref={dragProvided.innerRef}
                                      {...dragProvided.draggableProps}
                                      className={
                                        snapshot.isDragging ? "dragging" : ""
                                      }
                                    >
                                      <div className="vocab-card-row">
                                        <span
                                          className="drag-handle"
                                          {...dragProvided.dragHandleProps}
                                          title="Drag to reorder"
                                        >
                                          ⠿
                                        </span>
                                        <VocabCard
                                          hydrated={h}
                                          characterType={
                                            prefs?.characterType ?? "simplified"
                                          }
                                          visibleFields={
                                            prefs?.visibleFields ?? [
                                              "pinyin",
                                              "meaning",
                                            ]
                                          }
                                          onCycleStatus={cycleStatus}
                                          onRemove={removeItem}
                                        />
                                      </div>
                                    </div>
                                  )}
                                </Draggable>
                              ))}
                              {provided.placeholder}
                            </div>
                          )}
                        </Droppable>
                      </fieldset>
                    ))}
                  </div>
                </DragDropContext>
              )}
            </>
          )}
        </>
      )}

      {showAdd && (
        <AddVocabModal
          existingKeys={new Set(items.map(keyOf))}
          onAdd={addItems}
          onClose={() => setShowAdd(false)}
        />
      )}
    </div>
  );
}