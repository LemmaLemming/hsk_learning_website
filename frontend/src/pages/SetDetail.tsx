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
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [showAdd, setShowAdd] = useState(false);
  const [subsetInput, setSubsetInput] = useState("");

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
  const cycleStatus = (level: number, vocabId: number, status: VocabStatus) => {
    setItems((prev) =>
      prev.map((i) =>
        i.level === level && i.vocabId === vocabId ? { ...i, status } : i
      )
    );
  };

  const removeItem = (level: number, vocabId: number) => {
    setItems((prev) =>
      prev.filter((i) => !(i.level === level && i.vocabId === vocabId))
    );
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
  };

  const applySubset = () => {
    const n = parseInt(subsetInput, 10);
    setSubsetSize(Number.isFinite(n) && n > 0 ? n : null);
  };

  const addItems = (newItems: VocabItem[]) => {
    setShuffled(false);
    setItems((prev) => [...prev, ...newItems]);
  };

  // --- drag & drop (within a deck only; never between decks) ---------------
  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    if (result.source.droppableId !== result.destination.droppableId) return;
    const deckIdx = Number(result.source.droppableId.replace("deck-", ""));
    const deck = subsets[deckIdx];
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
  };

  // --- autosave ------------------------------------------------------------
  const saveKey = JSON.stringify({ name, items, shuffled, subsetSize });
  const save = async () => {
    if (!user || !setId || !loaded) return;
    await updateSet(user.uid, setId, { name, items, shuffled, subsetSize });
  };
  const autosave = useAutosave(save, saveKey);

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
          {!vocabLoading && subsets.length === 0 && (
            <p className="placeholder">No items to show.</p>
          )}
          {!vocabLoading && subsets.length > 0 && (
            <DragDropContext onDragEnd={handleDragEnd}>
              <div className="daily-decks">
                {subsets.map((subset, idx) => (
                  <fieldset key={idx} className="daily-deck">
                    <legend className="deck-legend">
                      {subsets.length > 1
                        ? `Day ${idx + 1} (${subset.length} word${
                            subset.length === 1 ? "" : "s"
                          })`
                        : `All words (${subset.length})`}
                    </legend>
                    <Droppable droppableId={`deck-${idx}`}>
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