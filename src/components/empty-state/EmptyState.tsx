import { Link } from "react-router-dom";

export default function EmptyState({
  title,
  message,
  actions,
}: {
  title: string;
  message: string;
  actions?: { to: string; label: string }[];
}) {
  return (
    <div className="empty-state">
      <p className="empty-state-title">{title}</p>
      <p className="empty-state-message">{message}</p>

      {actions && actions.length > 0 && (
        <div className="empty-state-actions">
          {actions.map((action) => (
            <Link key={action.to} to={action.to} className="empty-state-link">
              {action.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
