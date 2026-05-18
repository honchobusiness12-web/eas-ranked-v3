import Shell from "@/components/Shell";
import Link from "next/link";

export default function Page() {
  return (
    <Shell>
      <div className="eas-page-header">
        <div>
          <div className="eas-kicker">EAS Arena</div>
          <h1 className="eas-page-title">Compare</h1>
          <p className="eas-page-sub">Compare player stats side by side.</p>
        </div>
        <Link href="/leaderboard" className="eas-btn eas-btn-primary">Leaderboard</Link>
      </div>

      <div className="eas-grid eas-card-grid">
        <div className="eas-card">
          <div className="eas-stat-label">Status</div>
          <h2 style={{margin:"10px 0 0", fontSize:32, fontWeight:1000}}>Live</h2>
          <p className="eas-page-sub">This section is connected to the ranked hub layout.</p>
        </div>
        <div className="eas-card">
          <div className="eas-stat-label">Ranked</div>
          <h2 style={{margin:"10px 0 0", fontSize:32, fontWeight:1000}}>R1-R10</h2>
          <p className="eas-page-sub">Clean esports dashboard styling applied.</p>
        </div>
        <div className="eas-card">
          <div className="eas-stat-label">Actions</div>
          <div className="eas-actions">
            <Link href="/players" className="eas-btn">Players</Link>
            <Link href="/leaderboard" className="eas-btn">Leaderboard</Link>
          </div>
        </div>
      </div>
    </Shell>
  );
}
