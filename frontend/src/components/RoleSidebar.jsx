export default function RoleSidebar({ title, subtitle, items, activeKey, onChange }) {
  return (
    <aside className="sidebar card">
      <div className="sidebar-brand">
        <div className="sidebar-brand-badge">SM</div>
        <div>
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </div>
      </div>

      <div className="sidebar-menu">
        {items.map((item) => (
          <button
            type="button"
            key={item.key}
            className={`sidebar-item ${activeKey === item.key ? 'active' : ''}`}
            onClick={() => onChange(item.key)}
          >
            <span className="sidebar-item-label">{item.label}</span>
            <span className="sidebar-item-desc">{item.description}</span>
          </button>
        ))}
      </div>
    </aside>
  );
}
