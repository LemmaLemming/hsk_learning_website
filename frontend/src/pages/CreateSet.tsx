import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useVocabData } from "../hooks/useVocabData";
import { createSet } from "../services/setService";
import type { VocabEntry, VocabItem } from "../types";

const LEVELS = [1, 2, 3, 4, 5, 6, 7];
const STEPS = ["Name", "Levels", "Review", "Create"];

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
    if (step < 2) setStep(step);
  };

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

  const canNext =
    step !== 2
      ? step === 0
        ? name.trim().length > 0
        : selectedLevels.length > 0
      : selectedKeys.size > 0;

  return (
    <div className="page">
      <header className="page-header">
        <h1>Create a Set</h1>
        <button className="btn" onClick={() => navigate("/dashboard")}>
          Back
        </button>
      </header>

      <ol className="stepper">
        {STEPS.map((label, i) => (
          <li key={label} className={i <= step ? "active" : ""}>
            {label}
          </li>
        ))}
      </ol>

      {error && <p className="error">{error}</p>}
      {loadError && <p className="error">{loadError}</p>}

      {step === 0 && (
        <div className="step">
          <label htmlFor="set-name">Set name</label>
          <input
            id="set-name"
            type="text"
            placeholder="e.g. HSK 1+2 mix"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
      )}

      {step === 1 && (
        <div className="step">
          <label>Select HSK levels</label>
          <div className="level-grid">
            {LEVELS.map((lvl) => (
              <label key={lvl} className="level-chip">
                <input
                  type="checkbox"
                  checked={selectedLevels.includes(lvl)}
                  onChange={() => toggleLevel(lvl)}
                />
                <span>HSK {lvl}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="step">
          <div className="review-toolbar">
            <input
              id="vocab-search"
              type="text"
              placeholder="Search simplified or pinyin…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <button className="btn" onClick={selectAllFiltered}>
              Select all
            </button>
            <button className="btn" onClick={clearFiltered}>
              Clear
            </button>
          </div>
          {loading ? (
            <p className="loading">Loading vocab…</p>
          ) : (
            <p className="selection-count">
              {selectedKeys.size} / {allEntries.length} selected
            </p>
          )}
          <ul className="vocab-list">
            {filteredEntries.map(({ level, entry }) => {
              const key = keyOf(level, entry.id);
              const checked = selectedKeys.has(key);
              return (
                <li key={key}>
                  <label className="vocab-row">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleKey(key)}
                    />
                    <span className="vocab-level">HSK {level}</span>
                    <span className="vocab-char">{entry.s}</span>
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
        </div>
      )}

      <div className="step-actions">
        {step > 0 && (
          <button className="btn" onClick={() => setStep(step - 1)}>
            Back
          </button>
        )}
        {step < STEPS.length - 1 ? (
          <button
            className="btn primary"
            disabled={!canNext}
            onClick={() => setStep(step + 1)}
          >
            Next
          </button>
        ) : (
          <button
            className="btn primary"
            disabled={creating || selectedKeys.size === 0}
            onClick={handleCreate}
          >
            {creating ? "Creating…" : "Create Set"}
          </button>
        )}
      </div>
    </div>
  );
}
