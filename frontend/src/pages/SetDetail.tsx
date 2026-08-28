import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
} from "@hello-pangea/dnd";
import { useAuth } from "../contexts/AuthContext";
import { getSet, updateSet, touchSet } from "../services/setService";
import { getOrCreateUserDoc } from "../services/userService";
import { getVocabById } from "../services/vocabLoader";
import { useVocabData } from "../hooks/useVocabData";
import { useAutosave } from "../hooks/useAutosave";
import VocabCard from "../components/VocabCard";
import AddVocabModal from "../components/AddVocabModal";
import type {
  HydratedVocabItem,
  UserPreferences,
  VocabItem,
  VocabStatus,
} from "../types";

type StatusFilter = VocabStatus | "all";

const keyOf = (item: VocabItem) => `${item.level}:${item.vocabId}`;

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
      // No daily decks — paginate by pageSize (individual cards)
      return 1; // single "deck" paginated internally
    }
    if (pageSize < subsetSize) {
      // Exception: page size smaller than deck size -> 1 deck per page
      return 1;
    }
    return Math.floor(pageSize / subsetSize);
  }, [pageSize, subsetSize]);

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

  // Reset to page 0 when data shape changes
  useEffect(() => {
    setPage(0);
  }, [filter, subsetSize, shuffled]);

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