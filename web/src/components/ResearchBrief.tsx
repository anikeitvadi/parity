import React from 'react';
import Markdown from 'react-markdown';
import { useResearch } from '../hooks/useResearch.js';

interface ResearchBriefProps {
  platform: string;
  marketId: string;
  hasNews?: boolean;
  hasMetaculus?: boolean;
  hasCrossPlatform?: boolean;
  hasXPosts?: boolean;
}

export function ResearchBrief({ platform, marketId, hasNews, hasMetaculus, hasCrossPlatform, hasXPosts }: ResearchBriefProps) {
  const { content, isStreaming, error, start } = useResearch(platform, marketId);

  // Count data sources for the confidence indicator
  const sources: string[] = [];
  if (hasXPosts) sources.push('X/Twitter posts');
  if (hasNews) sources.push('Recent news');
  if (hasMetaculus) sources.push('Metaculus forecasters');
  if (hasCrossPlatform) sources.push('Cross-platform data');
  sources.push('Market odds');

  if (!content && !isStreaming && !error) {
    return (
      <div className="border border-gray-800 rounded-lg p-6 text-center">
        <p className="text-gray-400 mb-3">
          Get an AI-generated research brief with key factors, bull/bear cases, and risk analysis.
        </p>
        <div className="flex flex-wrap justify-center gap-2 mb-4">
          {sources.map((s) => (
            <span key={s} className="text-xs bg-gray-800 text-gray-400 px-2 py-0.5 rounded">
              {s}
            </span>
          ))}
        </div>
        <button
          onClick={start}
          className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg transition-colors font-medium"
        >
          Generate Research Brief
        </button>
      </div>
    );
  }

  return (
    <div className="border border-gray-800 rounded-lg p-6">
      {/* Confidence indicator */}
      <div className="flex items-center gap-2 mb-4 pb-3 border-b border-gray-800">
        <div className="flex gap-1">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className={`w-2 h-2 rounded-full ${
                i <= sources.length ? 'bg-cyan-400' : 'bg-gray-700'
              }`}
            />
          ))}
        </div>
        <span className="text-xs text-gray-500">
          Based on {sources.length} source{sources.length > 1 ? 's' : ''}: {sources.join(', ')}
        </span>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded p-3 mb-4 text-red-400 text-sm">
          {error}
        </div>
      )}
      <div className="prose prose-invert prose-sm max-w-none">
        <Markdown>{content}</Markdown>
        {isStreaming && <span className="animate-pulse text-cyan-400">|</span>}
      </div>
      {!isStreaming && content && (
        <button
          onClick={start}
          className="mt-4 text-sm text-gray-500 hover:text-gray-300 transition-colors"
        >
          Regenerate
        </button>
      )}
    </div>
  );
}
