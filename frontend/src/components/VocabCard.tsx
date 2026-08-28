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

  const cycle = () => {
    const idx = STATUS_ORDER.indexOf(status);
    const nextStatus = STATUS_ORDER[(idx + 1) % STATUS_ORDER.length];
    onCycleStatus(hydrated.item.level, hydrated.item.vocabId, nextStatus);
  };

  return (
    <div className={`vocab-card status-${status}`}>
      <div className="vocab-card-body">
        <div className="vocab-topline">
          <span className="vocab-char">{char}</span>
          <span className="vocab-pinyin">{form?.i?.y ?? ""}</span>
          <span className="vocab-level-badge">HSK {hydrated.item.level}</span>
          <span className={`status-tag ${status}`}>{STATUS_TAG[status]}</span>
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
        <button className={`status-btn ${status}`} onClick={cycle}>
          {STATUS_TAG[status]}
        </button>
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