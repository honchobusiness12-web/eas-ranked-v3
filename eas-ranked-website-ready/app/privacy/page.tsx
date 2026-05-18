export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-black text-white p-10">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-5xl font-bold mb-6 text-blue-400">Privacy Policy</h1>

        <div className="space-y-6 text-zinc-300">
          <p>
            EAS Ranked may collect basic account information from Discord and Roblox
            during authentication and account linking.
          </p>

          <p>
            This may include usernames, IDs, avatars, and profile information
            necessary for ranking and account management features.
          </p>

          <p>
            We do not sell personal information to third parties.
          </p>

          <p>
            Your information is used only for website functionality,
            authentication, moderation, and leaderboard systems.
          </p>

          <p>
            By using EAS Ranked, you consent to this privacy policy.
          </p>
        </div>
      </div>
    </main>
  );
}
