export default function AppLoading() {
  return <main aria-busy="true" aria-label="正在載入頁面" className="app-route-loading">
    <div className="route-skeleton-heading"><i className="skeleton-block" /><i className="skeleton-block" /></div>
    <div className="route-skeleton-toolbar skeleton-block" />
    <div className="route-skeleton-grid">
      {Array.from({ length: 6 }, (_, index) => <article className="route-skeleton-card" key={index}><i className="skeleton-block" /><span><b className="skeleton-block" /><b className="skeleton-block" /></span></article>)}
    </div>
  </main>;
}
