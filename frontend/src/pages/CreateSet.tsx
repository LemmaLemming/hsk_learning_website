import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useVocabData } from "../hooks/useVocabData";
import { loadLevel } from "../services/vocabLoader";
import { createSet } from "../services/setService";
import type { VocabEntry, VocabItem } from "../types";

const LEVELS = [1, 2, 3, 4, 5, 6, 7];
const STEPS = ["Name", "Levels", "Review", "Create"];

// Word counts from the static vocab JSON (frontend/public/data/{n}.min.json)
const LEVEL_WORD_COUNTS: Record<number, number> = {
  1: 294,
  2: 197,
  3: 487,
  4: 972,
  5: 1547,
  6: 1684,
  7: 4876,
};

interface EntryRef {
  level: number;
  entry: VocabEntry;
}

const keyOf = (level: number, id: number) => `${level}:${id}`;

export default function CreateSet() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [selectedLevels, setSelectedLevels] = useState<number[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Expanded level vocab browsing (Step 2)
  const [expandedLevel, setExpandedLevel] = useState<number | null>(null);
  const [expandedEntries, setExpandedEntries] = useState<VocabEntry[] | null>(
    null
  );
  const [expandedLoading, setExpandedLoading] = useState(false);
  const [expandQuery, setExpandQuery] = useState("");

  const { data, loading, error: loadError } = useVocabData(selectedLevels);

  const allEntries = useMemo<EntryRef[]>(() => {
    const out: EntryRef[] = [];
    for (const lvl of selectedLevels) {
      for (const entry of data.get(lvl) ?? []) {
        out.push({ level: lvl, entry });
      }
    }
    return out;
  }, [data, selectedLevels]);

  // Default: all vocab selected whenever the level set changes.
  useEffect(() => {
    const keys = new Set<string>();
    for (const lvl of selectedLevels) {
      for (const entry of data.get(lvl) ?? []) {
        keys.add(keyOf(lvl, entry.id));
      }
    }
    setSelectedKeys(keys);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLevels.length, allEntries.length]);

  const toggleLevel = (lvl: number) => {
    setSelectedLevels((prev) =>
      prev.includes(lvl) ? prev.filter((l) => l !== lvl) : [...prev, lvl]
    );
  };

  // Lazy-load vocab for the expanded level (vocabLoader caches it).
  const expandLevel = async (lvl: number) => {
    if (expandedLevel === lvl) {
      setExpandedLevel(null);
      setExpandedEntries(null);
      setExpandQuery("");
      return;
    }
    setExpandedLevel(lvl);
    setExpandedLoading(true);
    setExpandQuery("");
    try {
      const entries = await loadLevel(lvl);
      setExpandedEntries(entries);
    } catch (e) {
      setError((e as Error).message);
      setExpandedEntries([]);
    } finally {
      setExpandedLoading(false);
    }
  };

  const filteredExpanded = useMemo(() => {
    if (!expandedEntries || !expandQuery.trim()) return expandedEntries;
    const q = expandQuery.trim().toLowerCase();
    return expandedEntries.filter((entry) => {
      const s = entry.s.toLowerCase();
      const pinyin = entry.f?.[0]?.i?.y?.toLowerCase() ?? "";
      return s.includes(q) || pinyin.includes(q);
    });
  }, [expandedEntries, expandQuery]);

  const filteredEntries = useMemo(() => {
    if (!query.trim()) return allEntries;
    const q = query.trim().toLowerCase();
    return allEntries.filter(({ entry }) => {
      const s = entry.s.toLowerCase();
      const pinyin = entry.f?.[0]?.i?.y?.toLowerCase() ?? "";
      return s.includes(q) || pinyin.includes(q);
    });
  }, [allEntries, query]);

  const toggleKey = (key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const selectAllFiltered = () => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      filteredEntries.forEach(({ level, entry }) =>
        next.add(keyOf(level, entry.id))
      );
      return next;
    });
  };

  const clearFiltered = () => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      filteredEntries.forEach(({ level, entry }) =>
        next.delete(keyOf(level, entry.id))
      );
      return next;
    });
  };

  const handleCreate = async () => {
    if (!user) return;
    setCreating(true);
    setError(null);
    try {
      const items: VocabItem[] = [];
      for (const { level, entry } of allEntries) {
        if (selectedKeys.has(keyOf(level, entry.id))) {
          items.push({ level, vocabId: entry.id, status: "unlearned" });
        }
      }
      if (items.length === 0) {
        setError("Select at least one vocab item.");
        setCreating(false);
        return;
      }
      const id = await createSet(user.uid, name.trim() || "Untitled set", items);
      navigate(`/sets/${id}`);
    } catch (e) {
      setError((e as Error).message);
      setCreating(false);
    }
  };

  const selectedLevelCount = useMemo(() => {
    const lvls = new Set<number>();
    selectedKeys.forEach((key) => lvls.add(Number(key.split(":")[0])));
    return lvls.size;
  }, [selectedKeys]);

  const canNext =
    step !== 2
      ? step === 0
        ? name.trim().length > 0
        : selectedLevels.length > 0
      : selectedKeys.size > 0;

  const stepTitles = [
    "Step 1 of 4: Name Your Set",
    "Step 2 of 4: Select HSK Levels",
    "Step 3 of 4: Review & Select",
    "Step 4 of 4: Create",
  ];

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>Create a New Set</h1>
          <span className="step-indicator">{stepTitles[step]}</span>
        </div>
        <button className="retro-btn" onClick={() => navigate("/dashboard")}>
          [ &lt;&lt; Back to Dashboard ]
        </button>
      </header>

      {error && <p className="error">{error}</p>}
      {loadError && <p className="error">{loadError}</p>}

      {step === 0 && (
        <fieldset>
          <legend>Set Name</legend>
          <label htmlFor="set-name">Give your set a name:</label>
          <br />
          <input
            id="set-name"
            className="retro-input"
            type="text"
            placeholder="e.g. HSK 1+2 mix"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </fieldset>
      )}

      {step === 1 && (
        <fieldset>
          <legend>Select HSK Levels</legend>
          <p>
            Tick the levels to include, then click a level name to browse its
            words and fine-tune your selection.
          </p>
          <table className="retro-table level-table">
            <thead>
              <tr>
                <th>Incl.</th>
                <th>Level</th>
                <th>Words</th>
                <th>Browse</th>
              </tr>
            </thead>
            <tbody>
              {LEVELS.map((lvl) => (
                <FragmentRow key={lvl}>
                  <tr className={expandedLevel === lvl ? "selected-row" : ""}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selectedLevels.includes(lvl)}
                        onChange={() => toggleLevel(lvl)}
                      />
                    </td>
                    <td className="level-name-cell">
                      <a
                        href="#"
                        onClick={(e) => {
                          e.preventDefault();
                          void expandLevel(lvl);
                        }}
                      >
                        HSK {lvl}
                      </a>
                    </td>
                    <td>{LEVEL_WORD_COUNTS[lvl]} words</td>
                    <td className="level-expand-link">
                      <a
                        href="#"
                        onClick={(e) => {
                          e.preventDefault();
                          void expandLevel(lvl);
                        }}
                      >
                        {expandedLevel === lvl ? "[close]" : "[browse ↕]"}
                      </a>
                    </td>
                  </tr>
                  {expandedLevel === lvl && (
                    <tr className="no-hover">
                      <td colSpan={4} className="level-expanded">
                        {expandedLoading ? (
                          <p className="loading">Loading HSK {lvl} vocab...</p>
                        ) : (
                          <>
                            <input
                              className="retro-input search-input"
                              type="search"
                              placeholder={`Search HSK ${lvl} by character or pinyin...`}
                              value={expandQuery}
                              onChange={(e) => setExpandQuery(e.target.value)}
                            />
                            <ul className="vocab-list">
                              {(filteredExpanded ?? []).map((entry) => {
                                const key = keyOf(lvl, entry.id);
                                const checked = selectedKeys.has(key);
                                return (
                                  <li key={key}>
                                    <label className="vocab-row">
                                      <input
                                        type="checkbox"
                                        checked={checked}
                                        onChange={() => toggleKey(key)}
                                      />
                                      <span className="vocab-level">
                                        HSK {lvl}
                                      </span>
                                      <span className="vocab-char">
                                        {entry.s}
                                      </span>
                                      <span className="vocab-pinyin">
                                        {entry.f?.[0]?.i?.y ?? ""}
                                      </span>
                                      <span className="vocab-meaning">
                                        {entry.f?.[0]?.m?.[0] ?? ""}
                                      </span>
                                    </label>
                                  </li>
                                );
                              })}
                            </ul>
                          </>
                        )}
                      </td>
                    </tr>
                  )}
                </FragmentRow>
              ))}
            </tbody>
          </table>
          <p className="selection-count">
            {selectedLevels.length} level
            {selectedLevels.length === 1 ? "" : "s"} selected ·{" "}
            {selectedKeys.size} words
          </p>
        </fieldset>
      )}

      {step === 2 && (
        <fieldset>
          <legend>Review &amp; Select</legend>
          <p className="selection-count">
            Selected: {selectedKeys.size} word
            {selectedKeys.size === 1 ? "" : "s"} from {selectedLevelCount}{" "}
            level{selectedLevelCount === 1 ? "" : "s"}
          </p>
          <div className="select-links">
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                selectAllFiltered();
              }}
            >
              [ Select All ]
            </a>
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                clearFiltered();
              }}
            >
              [ Clear All ]
            </a>
          </div>
          <input
            id="vocab-search"
            className="retro-input"
            type="search"
            placeholder="Search simplified or pinyin..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {loading ? (
            <p className="loading">Loading vocab...</p>
          ) : (
            <div className="review-scroll">
              <table className="retro-table review-table">
                <thead>
                  <tr>
                    <th>☐</th>
                    <th>#</th>
                    <th>Character</th>
                    <th>Pinyin</th>
                    <th>Meaning</th>
                    <th>Level</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredEntries.map(({ level, entry }, i) => {
                    const key = keyOf(level, entry.id);
                    const checked = selectedKeys.has(key);
                    return (
                      <tr
                        key={key}
                        className="no-hover"
                        onClick={() => toggleKey(key)}
                      >
                        <td>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleKey(key)}
                          />
                        </td>
                        <td>{i + 1}</td>
                        <td className="vocab-char">{entry.s}</td>
                        <td className="vocab-pinyin">
                          {entry.f?.[0]?.i?.y ?? ""}
                        </td>
                        <td className="vocab-meaning">
                          {entry.f?.[0]?.m?.[0] ?? ""}
                        </td>
                        <td className="vocab-level">HSK {level}</td>
                      </tr>
                    );
                  })}
                  {filteredEntries.length === 0 && (
                    <tr className="no-hover">
                      <td colSpan={6} className="placeholder">
                        No matching words.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </fieldset>
      )}

      {step === 3 && (
        <fieldset>
          <legend>Ready to Create</legend>
          <p>
            Set name: <b>{name.trim() || "Untitled set"}</b>
          </p>
          <p>
            {selectedKeys.size} word{selectedKeys.size === 1 ? "" : "s"} from{" "}
            {selectedLevelCount} level{selectedLevelCount === 1 ? "" : "s"}
          </p>
          <p className="placeholder">
            Everything will be saved to your account. Click Create Set to
            start studying!
          </p>
        </fieldset>
      )}

      <div className="step-actions">
        {step > 0 && (
          <button className="retro-btn" onClick={() => setStep(step - 1)}>
            &lt;&lt; Back
          </button>
        )}
        {step < STEPS.length - 1 ? (
          <button
            className="retro-btn primary"
            disabled={!canNext}
            onClick={() => setStep(step + 1)}
          >
            Next &gt;&gt;
          </button>
        ) : (
          <button
            className="retro-btn primary"
            disabled={creating || selectedKeys.size === 0}
            onClick={handleCreate}
          >
            {creating ? "Creating..." : "[ Create Set ]"}
          </button>
        )}
      </div>
    </div>
  );
}

/** Tiny helper so sibling elements can share a React key. */
function FragmentRow({ children }: { children: ReactNode }) {
  return <>{children}</>;
}