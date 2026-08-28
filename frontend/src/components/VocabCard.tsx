import type {
  CharacterType,
  HydratedVocabItem,
  VisibleField,
  VocabStatus,
} from "../types";
import { characterFor, displayFor, formOf } from "../utils/vocab";

const STATUS_TAG: Record<VocabStatus, string> = {
  unlearned: "[UNLEARNED]",
  learnt: "[LEARNT \u2713]",
  skipped: "[SKIPPED \u2192]",
};

const STATUS_ORDER: VocabStatus[] = ["unlearned", "learnt", "skipped"];

const STATUS_INDEX: Record<VocabStatus, number> = {
  unlearned: 0,
  learnt: 1,
  skipped: 2,
};

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
  hydrated: HydratedVocabItem;
  characterType: CharacterType;
  visibleFields: VisibleField[];
  onCycleStatus: (level: number, vocabId: number, status: VocabStatus) => void;
  onRemove: (level: number, vocabId: number) => void;
}

export default function VocabCard({
  hydrated,
  characterType,
  visibleFields,
  onCycleStatus,
  onRemove,
}: Props) {
  const { entry } = hydrated;
  const status = hydrated.item.status;
  const form = formOf(entry);
  const char = characterFor(entry, characterType);

  const setStatus = (s: VocabStatus) =>
    onCycleStatus(hydrated.item.level, hydrated.item.vocabId, s);

  return (
    <div className={`vocab-card status-${status}`}>
      <div className="vocab-card-body">
        <div className="vocab-topline">
          <span className="vocab-char">{char}</span>
          <span className="vocab-pinyin">{form?.i?.y ?? ""}</span>
          <span className="vocab-level-badge">HSK {hydrated.item.level}</span>
        </div>
        <div className="vocab-fields">
          {visibleFields.map((field) => {
            const val = displayFor(entry, field);
            if (!val) return null;
            return (
              <span key={field} className="vocab-field">
                <span className="field-label">{FIELD_LABELS[field]}:</span>
                {val}
              </span>
            );
          })}
        </div>
      </div>
      <div className="vocab-actions">
        <div className="tri-toggle" role="group" aria-label="Learning status">
          <div className="tri-track" aria-hidden="true">
            <span
              className="tri-thumb"
              style={{ transform: `translateX(${STATUS_INDEX[status] * 100}%)` }}
            />
          </div>
          {STATUS_ORDER.map((s) => (
            <button
              key={s}
              type="button"
              className={`tri-slot ${s} ${status === s ? "active" : ""}`}
              aria-pressed={status === s}
              onClick={() => setStatus(s)}
            >
              {STATUS_TAG[s]}
            </button>
          ))}
        </div>
        <a
          className="remove-link"
          href="#"
          aria-label={`Remove ${char}`}
          onClick={(e) => {
            e.preventDefault();
            onRemove(hydrated.item.level, hydrated.item.vocabId);
          }}
        >
          [X]
        </a>
      </div>
    </div>
  );
}