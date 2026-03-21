import { FileText } from 'lucide-preact';

type Props = {
  title: string;
  description: string;
  actionLabel?: string;
  actionHref?: string;
};

export function EmptyState({ title, description, actionLabel, actionHref }: Props) {
  return (
    <div className="empty-state">
      <div className="empty-state-icon">
        <FileText size={48} strokeWidth={1.8} aria-hidden="true" />
      </div>
      <p className="empty-state-title">{title}</p>
      <p className="empty-state-desc">{description}</p>
      {actionLabel && actionHref && (
        <a href={actionHref} className="btn btn-primary">
          {actionLabel}
        </a>
      )}
    </div>
  );
}
