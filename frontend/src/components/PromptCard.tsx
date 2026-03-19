type Props = {
  id: string;
  title: string;
  preview: string;
  version: number;
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

export function PromptCard({ id, title, preview, version, updatedAt }: Props) {
  return (
    <a href={`/prompts/${id}/edit`} className="prompt-card">
      <div className="prompt-card-glow" aria-hidden="true" />
      <div className="prompt-card-title-row">
        <h2 className="prompt-card-title">{title}</h2>
        <span className="version-badge">v{version}</span>
      </div>
      <p className="prompt-card-body">{preview || '本文はまだ空です。'}</p>
      <div className="prompt-card-footer">
        <p className="list-card-meta">Updated {formatDate(updatedAt)}</p>
      </div>
    </a>
  );
}
