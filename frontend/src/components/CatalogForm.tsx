import { useState } from 'preact/hooks';
import { ArrowLeft, Plus } from 'lucide-preact';

type CatalogOptionFormValue = {
  id?: string;
  label: string;
  value: string;
  sort_order: number;
};

type Props = {
  mode: 'create' | 'edit';
  catalogId?: string;
  initialName?: string;
  initialDescription?: string;
  initialOptions?: CatalogOptionFormValue[];
};

function createOption(): CatalogOptionFormValue {
  return {
    id: crypto.randomUUID(),
    label: '',
    value: '',
    sort_order: 0,
  };
}

function normalizeInitialOptions(
  initialOptions: CatalogOptionFormValue[],
): CatalogOptionFormValue[] {
  if (initialOptions.length === 0) {
    return [createOption()];
  }

  return initialOptions.map((option, index) => ({
    ...option,
    value: option.value ?? '',
    sort_order: index,
  }));
}

export function CatalogForm({
  mode,
  catalogId,
  initialName = '',
  initialDescription = '',
  initialOptions = [],
}: Props) {
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const [options, setOptions] = useState<CatalogOptionFormValue[]>(() =>
    normalizeInitialOptions(initialOptions),
  );
  const [, setStatus] = useState('');
  const [loading, setLoading] = useState(false);

  const setOptionField = (
    index: number,
    field: keyof CatalogOptionFormValue,
    value: string | number | undefined,
  ) => {
    setOptions((current) =>
      current.map((option, optionIndex) =>
        optionIndex === index ? { ...option, [field]: value } : option,
      ),
    );
  };

  const addOption = () => {
    setOptions((current) => [
      ...current,
      {
        ...createOption(),
        sort_order: current.length,
      },
    ]);
  };

  const removeOption = (index: number) => {
    setOptions((current) =>
      current
        .filter((_, optionIndex) => optionIndex !== index)
        .map((option, optionIndex) => ({ ...option, sort_order: optionIndex })),
    );
  };

  const handleSubmit = async (event: Event) => {
    event.preventDefault();
    setLoading(true);
    setStatus(mode === 'create' ? 'Catalog を作成中...' : 'Catalog を更新中...');

    const payload = {
      name,
      description,
      options: options
        .filter((option) => option.label.trim() || option.value.trim())
        .map((option, index) => ({
          id: option.id && option.id.length === 36 ? option.id : undefined,
          label: option.label.trim(),
          value: option.value,
          sort_order: index,
        })),
    };

    const url = mode === 'create' ? '/api/catalogs' : `/api/catalogs/${catalogId}`;
    const method = mode === 'create' ? 'POST' : 'PATCH';

    try {
      const response = await fetch(url, {
        method,
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const json = await response.json();
      if (!response.ok || !json.success) {
        throw new Error(json.error ?? 'Catalog save failed');
      }

      setStatus(mode === 'create' ? '作成しました。移動します...' : '更新しました。移動します...');
      setTimeout(() => {
        window.location.href = '/catalogs';
      }, 400);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Catalog save failed');
      setLoading(false);
    }
  };

  return (
    <form className="stack-lg catalog-form-shell" onSubmit={handleSubmit}>
      <div className="field-nav-row">
        <a href="/catalogs" className="btn-secondary button-with-icon nav-back-link" aria-label="Catalogs に戻る">
          <ArrowLeft aria-hidden="true" />
          <span>Catalogs</span>
        </a>
      </div>

      <section className="panel catalog-details-panel stack-sm">
        <div className="catalog-panel-header">
          <h2 className="section-title">Catalog</h2>
        </div>
        <div className="stack-sm">
          <label className="field-label" htmlFor="catalog-name">
            Name
          </label>
          <input
            id="catalog-name"
            className="text-input"
            value={name}
            onInput={(event) => setName(event.currentTarget.value)}
            maxLength={200}
            placeholder="Catalog 名"
            required
          />
        </div>
        <div className="stack-sm">
          <label className="field-label" htmlFor="catalog-description">
            Description
          </label>
          <textarea
            id="catalog-description"
            className="text-area catalog-description-input"
            rows={3}
            value={description}
            onInput={(event) => setDescription(event.currentTarget.value)}
            maxLength={500}
            placeholder="Description"
          />
        </div>
      </section>

      <section className="panel catalog-options-panel stack-md">
        <div className="catalog-panel-header">
          <h2 className="section-title">Items</h2>
          <button type="button" className="btn-secondary button-with-icon" onClick={addOption}>
            <span className="button-icon" aria-hidden="true">
              <Plus />
            </span>
            Item
          </button>
        </div>

        <div className="stack-md">
          {options.map((option, index) => (
            <div className="catalog-option-card" key={option.id ?? `${index}`}>
              <div className="catalog-option-header">
                <span className="version-badge">#{index + 1}</span>
                <button
                  type="button"
                  className="btn-ghost-danger"
                  onClick={() => removeOption(index)}
                  disabled={options.length === 1}
                >
                  Remove
                </button>
              </div>

              <div className="catalog-option-grid">
                <div className="stack-sm">
                  <label className="field-label" htmlFor={`option-label-${index}`}>
                    Name
                  </label>
                  <input
                    id={`option-label-${index}`}
                    className="text-input"
                    value={option.label}
                    onInput={(event) => setOptionField(index, 'label', event.currentTarget.value)}
                    placeholder="Scribble Font"
                    required
                  />
                </div>
              </div>

              <div className="stack-sm">
                <label className="field-label" htmlFor={`option-value-${index}`}>
                  Prompt
                </label>
                <textarea
                  id={`option-value-${index}`}
                  className="text-area text-area-mono catalog-value-input"
                  rows={4}
                  value={option.value}
                  onInput={(event) => setOptionField(index, 'value', event.currentTarget.value)}
                  placeholder="scribble handwritten font with uneven chalk texture"
                  required
                />
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="page-actions">
        <button type="submit" className="btn-primary" disabled={loading}>
          {loading ? 'Saving...' : 'Save'}
        </button>
      </div>
    </form>
  );
}
