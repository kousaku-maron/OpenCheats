type Props = {
  id: string;
  name: string;
  description: string | null;
  optionCount: number;
  updatedAt: Date;
};

function formatDate(value: Date) {
  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}/${month}/${day} ${hours}:${minutes}`;
}

export function CatalogCard({ id, name, description, optionCount, updatedAt }: Props) {
  return (
    <a href={`/catalogs/${id}/edit`} className="catalog-card">
      <div className="catalog-card-glow" aria-hidden="true" />
      <div className="catalog-card-title-row">
        <h2 className="catalog-card-title">{name}</h2>
        <span className="count-badge">{optionCount} items</span>
      </div>
      <p className="catalog-card-body">{description || 'No description yet.'}</p>
      <div className="catalog-card-footer">
        <p className="list-card-meta">Updated {formatDate(updatedAt)}</p>
      </div>
    </a>
  );
}
