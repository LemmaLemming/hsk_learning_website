import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { getSet, updateSet } from "../services/setService";
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

export default function SetDetail() {
  const { setId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

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
    filter === "all" ? hydrated : hydrated.filter((h) => h.item.status === filter);

  const subsets = useMemo(() => {
    if (!subsetSize || subsetSize <= 0) return [filteredHydrated];
    const out: HydratedVocabItem[][] = [];
    for (let i = 0; i < filteredHydrated.length; i += subsetSize) {
      out.push(filteredHydrated.slice(i, i + subsetSize));
    }
    return out;
  }, [filteredHydrated, subsetSize]);

  const total = items.length;

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>{name}</h1>
          <span className="save-indicator">
            {autosave.status === "saving" && "Saving…"}
            {autosave.status === "saved" && "Saved ✓"}
            {autosave.status === "error" && "Save failed ✗"}
          </span>
          {autosave.error && <span className="error"> {autosave.error}</span>}
        </div>
        <button className="btn" onClick={() => navigate("/dashboard")}>
          Back
        </button>
      </header>

      {error && <p className="error">{error}</p>}

      {loaded && (
        <>
          <div className="study-controls">
            <button className="btn" onClick={handleShuffle} disabled={total < 2}>
              Shuffle
            </button>
            <div className="subset-control">
              <input
                id="subset-size"
                type="number"
                min={1}
                placeholder="subset size"
                value={subsetInput}
                onChange={(e) => setSubsetInput(e.target.value)}
              />
              <button className="btn" onClick={applySubset}>
                Divide
              </button>
            </div>
            <button className="btn primary" onClick={() => setShowAdd(true)}>
              + Add vocab
            </button>
          </div>

          <div className="filter-bar">
            <button
              className={`filter-btn ${filter === "all" ? "active" : ""}`}
              onClick={() => setFilter("all")}
            >
              All ({total})
            </button>
            <button
              className={`filter-btn unlearned ${
                filter === "unlearned" ? "active" : ""
              }`}
              onClick={() => setFilter("unlearned")}
            >
              Unlearned ({counts.unlearned})
            </button>
            <button
              className={`filter-btn learnt ${filter === "learnt" ? "active" : ""}`}
              onClick={() => setFilter("learnt")}
            >
              Learnt ({counts.learnt})
            </button>
            <button
              className={`filter-btn skipped ${filter === "skipped" ? "active" : ""}`}
              onClick={() => setFilter("skipped")}
            >
              Skipped ({counts.skipped})
            </button>
          </div>

          {vocabLoading && <p className="loading">Loading vocab…</p>}
          {!vocabLoading && subsets.length === 0 && (
            <p className="placeholder">No items to show.</p>
          )}

          {subsets.map((subset, idx) => (
            <div key={idx} className="subset">
              {subsets.length > 1 && (
                <h3>
                  Subset {idx + 1} ({subset.length})
                </h3>
              )}
              <div className="vocab-card-list">
                {subset.map((h) => (
                  <VocabCard
                    key={`${h.item.level}:${h.item.vocabId}`}
                    hydrated={h}
                    characterType={prefs?.characterType ?? "simplified"}
                    visibleFields={prefs?.visibleFields ?? ["pinyin", "meaning"]}
                    onCycleStatus={cycleStatus}
                    onRemove={removeItem}
                  />
                ))}
              </div>
            </div>
          ))}
        </>
      )}

      {showAdd && (
        <AddVocabModal
          existingKeys={new Set(items.map((i) => `${i.level}:${i.vocabId}`))}
          onAdd={addItems}
          onClose={() => setShowAdd(false)}
        />
      )}
    </div>
  );
}
