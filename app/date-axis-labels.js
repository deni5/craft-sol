function formatDateShort(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return mm + '-' + dd;
}

export function DateAxisLabels({ data, dateKey = 'date', count = 5 }) {
  if (!data || data.length < 2) return null;

  const indices = [];
  for (let i = 0; i < count; i++) {
    const idx = Math.round((i / (count - 1)) * (data.length - 1));
    indices.push(idx);
  }
  const uniqueIndices = [...new Set(indices)];

  return (
    <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        fontFamily: 'var(--font-mono)',
        fontSize: 10,
        color: 'var(--text-dim)',
        marginTop: 4,
      }}
    >
      {uniqueIndices.map((idx) => (
        <span key={idx}>{formatDateShort(data[idx][dateKey])}</span>
      ))}
    </div>
  );
}
