import Shell from "@/components/Shell";
import Link from "next/link";

function GuideSection({
  icon,
  title,
  children,
}: {
  icon: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="eas-card eas-guide-section"
      style={{ display: "flex", flexDirection: "column", gap: 14 }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 14,
            display: "grid",
            placeItems: "center",
            fontSize: 20,
            background: "linear-gradient(135deg, rgba(139,92,246,.28), rgba(56,189,248,.12))",
            border: "1px solid rgba(139,92,246,.32)",
            flexShrink: 0,
          }}
        >
          {icon}
        </div>
        <h2
          style={{
            margin: 0,
            fontSize: 18,
            fontWeight: 1000,
            letterSpacing: "-0.02em",
          }}
        >
          {title}
        </h2>
      </div>
      <div style={{ height: 1, background: "rgba(255,255,255,.07)" }} />
      <div
        style={{
          color: "#b7bfd2",
          fontSize: 14,
          fontWeight: 600,
          lineHeight: 1.75,
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        {children}
      </div>
    </div>
  );
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
      <span style={{ color: "var(--purple)", fontWeight: 900, flexShrink: 0, marginTop: 1 }}>
        ✦
      </span>
      <span>{children}</span>
    </div>
  );
}

function Highlight({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        color: "white",
        fontWeight: 900,
        background: "rgba(139,92,246,.15)",
        borderRadius: 6,
        padding: "1px 6px",
      }}
    >
      {children}
    </span>
  );
}

export default function GuidePage() {
  return (
    <Shell>
      <div className="eas-page-header">
        <div>
          <div className="eas-kicker">EAS Arena</div>
          <h1 className="eas-page-title">Guide</h1>
          <p className="eas-page-sub">
            Everything you need to know about EAS Ranked — how it works, what&apos;s expected, and
            how to climb.
          </p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <Link href="/ranks" className="eas-btn">
            ✦ Ranks
          </Link>
          <Link href="/leaderboard" className="eas-btn eas-btn-primary">
            Leaderboard
          </Link>
        </div>
      </div>

      <div className="eas-grid" style={{ gridTemplateColumns: "1fr", gap: 18 }}>
        {/* Section 1: How CR Works */}
        <GuideSection icon="⚡" title="How CR Works">
          <p style={{ margin: 0 }}>
            <Highlight>CR (Competitive Rating)</Highlight> is the core metric of EAS Ranked. Every
            player starts at 0 CR after completing placement matches, and your CR rises or falls
            based on your match results.
          </p>
          <Bullet>
            Winning a ranked match earns you CR. The amount depends on the match format and your
            current tier.
          </Bullet>
          <Bullet>
            Losing a ranked match costs you CR. Consistent losses will drop you to a lower
            sub-division or rank tier.
          </Bullet>
          <Bullet>
            Your CR determines your rank tier — from <Highlight>R1 Rookie</Highlight> all the way
            up to <Highlight>R10 Hall of Fame</Highlight>.
          </Bullet>
          <Bullet>
            CR is tracked in real time. Check the{" "}
            <Link href="/leaderboard" style={{ color: "var(--purple)", fontWeight: 900 }}>
              Leaderboard
            </Link>{" "}
            to see where you stand.
          </Bullet>
        </GuideSection>

        {/* Section 2: Placement Matches */}
        <GuideSection icon="📋" title="Placement Matches">
          <p style={{ margin: 0 }}>
            Before you receive a ranked tier, you must complete{" "}
            <Highlight>10 placement matches</Highlight>. These matches determine your starting rank
            based on your performance.
          </p>
          <Bullet>
            Placement matches are tracked separately. You can view players still in placements on
            the{" "}
            <Link href="/placements" style={{ color: "var(--purple)", fontWeight: 900 }}>
              Placements page
            </Link>
            .
          </Bullet>
          <Bullet>
            Your win/loss record during placements influences where you start — performing well
            means a higher starting rank.
          </Bullet>
          <Bullet>
            Until all 10 placements are complete, you are not considered a fully ranked player and
            will not appear on the main leaderboard.
          </Bullet>
          <Bullet>
            Placement matches count toward your overall win/loss record and stats.
          </Bullet>
        </GuideSection>

        {/* Section 3: Wins & Losses */}
        <GuideSection icon="🏆" title="Wins &amp; Losses">
          <p style={{ margin: 0 }}>
            Every match result is recorded and contributes to your overall stats. Your win/loss
            record is public and visible on your profile.
          </p>
          <Bullet>
            <Highlight>Wins</Highlight> increase your CR and push you toward the next rank
            sub-division.
          </Bullet>
          <Bullet>
            <Highlight>Losses</Highlight> decrease your CR. Dropping below a tier threshold will
            demote you to the previous rank.
          </Bullet>
          <Bullet>
            Win rate is calculated as wins divided by total matches. A higher win rate reflects
            consistent performance.
          </Bullet>
          <Bullet>
            There is no minimum match requirement to maintain your rank, but inactivity may be
            reviewed by admins during season resets.
          </Bullet>
        </GuideSection>

        {/* Section 4: MVPs & Kills */}
        <GuideSection icon="★" title="MVPs &amp; Kills">
          <p style={{ margin: 0 }}>
            EAS Ranked tracks <Highlight>MVPs</Highlight> and <Highlight>kills</Highlight> as
            secondary stats. These reflect individual performance within matches.
          </p>
          <Bullet>
            MVP is awarded to the standout performer of a match. Earning MVPs demonstrates
            consistent high-level play.
          </Bullet>
          <Bullet>
            Kills are tracked per match and contribute to your overall kill count visible on your
            profile.
          </Bullet>
          <Bullet>
            <strong style={{ color: "var(--red)" }}>Kill farming is strictly prohibited.</strong>{" "}
            Deliberately inflating kill counts through collusion or non-competitive play will result
            in a suspension or ban.
          </Bullet>
          <Bullet>
            Fair play is expected at all times. Admins monitor kill patterns and will act on
            suspicious activity.
          </Bullet>
        </GuideSection>

        {/* Section 5: Suspensions & Bans */}
        <GuideSection icon="🔨" title="Suspensions &amp; Bans">
          <p style={{ margin: 0 }}>
            EAS Ranked maintains a strict fair-play policy. Violations result in suspensions or
            permanent bans from the ranked system.
          </p>
          <Bullet>
            <Highlight>Suspensions</Highlight> are issued for first-time or minor violations such
            as unsportsmanlike conduct, kill farming, or ignoring admin instructions.
          </Bullet>
          <Bullet>
            <Highlight>Blacklisting</Highlight> is permanent and reserved for severe or repeated
            violations. Blacklisted players are removed from all leaderboards.
          </Bullet>
          <Bullet>
            To appeal a suspension, contact an EAS admin through the official Discord server with
            your user ID and a clear explanation.
          </Bullet>
          <Bullet>
            Blacklist decisions are final unless new evidence is presented. Do not attempt to
            circumvent a ban with alternate accounts.
          </Bullet>
        </GuideSection>

        {/* Section 6: Ranked Expectations */}
        <GuideSection icon="🤝" title="Ranked Expectations">
          <p style={{ margin: 0 }}>
            EAS Ranked is a competitive environment. All participants are expected to uphold the
            standards of the EAS Arena community.
          </p>
          <Bullet>
            <Highlight>Sportsmanship</Highlight> — Win and lose with respect. Trash talk, toxicity,
            and harassment are not tolerated.
          </Bullet>
          <Bullet>
            <Highlight>Communication</Highlight> — Respond to match invites and admin messages in a
            timely manner. Going silent during an active match is disrespectful to your opponents.
          </Bullet>
          <Bullet>
            <Highlight>Respect for admins and hosts</Highlight> — Follow instructions from match
            hosts and EAS admins. Disputes should be raised calmly and through proper channels.
          </Bullet>
          <Bullet>
            Players who consistently create problems for the community may be removed from ranked
            regardless of their CR.
          </Bullet>
        </GuideSection>

        {/* Section 7: How to Climb Ranks */}
        <GuideSection icon="📈" title="How to Climb Ranks">
          <p style={{ margin: 0 }}>
            Climbing the EAS Ranked ladder takes consistency, strategy, and a willingness to
            improve. Here&apos;s how to make the most of your ranked journey.
          </p>
          <Bullet>
            <Highlight>Win consistently</Highlight> — Focus on winning matches rather than
            individual stats. CR is the only thing that moves your rank.
          </Bullet>
          <Bullet>
            <Highlight>Play with strong teammates</Highlight> — Team coordination wins matches.
            Find reliable partners who communicate and play to win.
          </Bullet>
          <Bullet>
            <Highlight>Learn from losses</Highlight> — Every loss is a lesson. Identify what went
            wrong and adjust your approach in the next match.
          </Bullet>
          <Bullet>
            <Highlight>Track your progress</Highlight> — Use your{" "}
            <Link href="/players" style={{ color: "var(--purple)", fontWeight: 900 }}>
              player profile
            </Link>{" "}
            to monitor your CR, win rate, and rank progression over time.
          </Bullet>
          <Bullet>
            Avoid tilting after losses. Take breaks when needed — playing on tilt leads to more
            losses and more CR loss.
          </Bullet>
        </GuideSection>

        {/* Section 8: What Admins Track */}
        <GuideSection icon="🛡️" title="What Admins Track">
          <p style={{ margin: 0 }}>
            EAS admins actively monitor ranked activity to ensure the integrity of the competitive
            system. Here is what they pay attention to.
          </p>
          <Bullet>
            <Highlight>Win rate and consistency</Highlight> — Unusual win/loss patterns may trigger
            a review, especially if they appear manipulated.
          </Bullet>
          <Bullet>
            <Highlight>Kill patterns</Highlight> — Abnormally high kill counts in short periods are
            flagged for review as potential kill farming.
          </Bullet>
          <Bullet>
            <Highlight>Fair play</Highlight> — Admins watch for collusion, match fixing, and any
            behavior that undermines the competitive integrity of EAS Ranked.
          </Bullet>
          <Bullet>
            <Highlight>Community behavior</Highlight> — How you conduct yourself in the EAS Discord
            and during matches is part of your overall standing in the community.
          </Bullet>
          <Bullet>
            Admins have the authority to adjust CR, issue suspensions, and remove players from
            ranked at their discretion in cases of clear misconduct.
          </Bullet>
        </GuideSection>
      </div>

      {/* Footer CTA */}
      <div
        className="eas-card"
        style={{
          marginTop: 28,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 20,
          flexWrap: "wrap",
          padding: "20px 24px",
        }}
      >
        <div>
          <div style={{ fontWeight: 1000, fontSize: 16 }}>Ready to compete?</div>
          <div style={{ color: "var(--muted)", fontWeight: 700, fontSize: 13, marginTop: 4 }}>
            Complete your placement matches and start climbing the EAS Ranked ladder.
          </div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <Link href="/placements" className="eas-btn">
            📋 Placements
          </Link>
          <Link href="/ranks" className="eas-btn">
            ✦ View Ranks
          </Link>
          <Link href="/leaderboard" className="eas-btn eas-btn-primary">
            Leaderboard
          </Link>
        </div>
      </div>
    </Shell>
  );
}

