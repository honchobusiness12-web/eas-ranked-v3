export default function PlayerAvatar({
  name,
  avatar,
  size = "h-10 w-10",
}: {
  name?: string;
  avatar?: string | null;
  size?: string;
}) {
  if (avatar) {
    return (
      <img
        src={avatar}
        alt={name || "Player"}
        className={`${size} rounded-full object-cover shrink-0 ring-1 ring-white/10`}
        loading="lazy"
      />
    );
  }

  const initial = (name || "?")[0].toUpperCase();
  // Generate a consistent gradient from the name
  const gradients = [
    "from-orange-600 to-red-600",
    "from-purple-600 to-violet-600",
    "from-blue-600 to-indigo-600",
    "from-green-600 to-teal-600",
    "from-red-600 to-pink-600",
    "from-teal-600 to-cyan-600",
    "from-pink-600 to-rose-600",
    "from-indigo-600 to-blue-600",
  ];
  const colorIndex = name ? name.charCodeAt(0) % gradients.length : 0;
  const gradient = gradients[colorIndex];

  return (
    <div className={`flex ${size} shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${gradient} text-white font-black text-sm select-none ring-1 ring-white/10`}>
      {initial}
    </div>
  );
}
