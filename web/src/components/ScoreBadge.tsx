import React from 'react';

interface ScoreBadgeProps {
  score: number;
}

export function ScoreBadge({ score }: ScoreBadgeProps) {
  let color = 'text-gray-400 border-gray-600';
  if (score >= 7) color = 'text-green-400 border-green-500';
  else if (score >= 5) color = 'text-yellow-400 border-yellow-500';

  return (
    <span
      className={`inline-flex items-center justify-center w-10 h-10 rounded-full border-2 font-bold text-sm ${color}`}
    >
      {score.toFixed(1)}
    </span>
  );
}
