const labels = {
  valid: 'Valid',
  'expiring-soon': 'Expiring soon',
  expired: 'Expired',
  'no-expiry': 'No expiry date',
};

export default function StatusBadge({ status }) {
  return <span className={`status-badge status-${status}`}>{labels[status] ?? status}</span>;
}

