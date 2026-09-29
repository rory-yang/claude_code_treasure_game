import type { Stats } from '../api';

// Format a SQLite UTC timestamp ("YYYY-MM-DD HH:MM:SS") in local time. Input: timestamp. Output: "YYYY/MM/DD HH:mm"
function formatPlayedAt(playedAt: string): string {
  const date = new Date(`${playedAt.replace(' ', 'T')}Z`);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// Pick the text color for a score. Input: score. Output: Tailwind class
function scoreColor(score: number): string {
  if (score > 0) return 'text-green-600';
  return score === 0 ? 'text-amber-600' : 'text-red-600';
}

// Saved stats panel for a signed-in player. Input: stats from the API. Output: summary + recent games UI
export function ScoreHistory({ stats }: { stats: Stats }) {
  return (
    <div
      className="w-full mb-8 p-4 bg-amber-200/80 backdrop-blur-sm rounded-xl shadow-lg border-2 border-amber-400 text-amber-900"
      style={{ maxWidth: '24rem' }}
    >
      <h2 className="text-lg mb-2 text-center">Your Stats</h2>
      <div className="flex justify-between text-sm mb-4">
        <span>Games: {stats.gamesPlayed}</span>
        <span>Best: {stats.bestScore === null ? '-' : `$${stats.bestScore}`}</span>
        <span>Total: ${stats.totalScore}</span>
      </div>

      {stats.recent.length === 0 ? (
        <p className="text-sm text-center text-amber-700">No games yet — open a chest!</p>
      ) : (
        <ul className="flex flex-col gap-1 text-sm">
          {stats.recent.map((entry, index) => (
            <li key={`${entry.playedAt}-${index}`} className="flex justify-between">
              <span className="text-amber-700">{formatPlayedAt(entry.playedAt)}</span>
              <span className={scoreColor(entry.score)}>${entry.score}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
