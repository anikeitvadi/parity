import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useSavedMarkets, type SavedMarket } from '../hooks/useSavedMarkets.js';
import { PriceBar } from '../components/PriceBar.js';

export function SavedPage() {
  const { saved, remove, updateNotes } = useSavedMarkets();

  if (saved.length === 0) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-white mb-2">Saved Markets</h1>
        <p className="text-gray-500 text-sm mb-6">
          Your personal research workspace. Save markets you're tracking and add notes.
        </p>
        <div className="text-center py-16">
          <div className="text-gray-400 text-lg mb-2">No saved markets yet</div>
          <div className="text-gray-600 text-sm max-w-md mx-auto">
            Browse <Link to="/" className="text-cyan-400 hover:text-cyan-300">markets</Link> and
            click "Save" on any market to add it here. Your saves are stored locally in your browser.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl font-bold text-white">Saved Markets</h1>
        <span className="text-sm text-gray-500">{saved.length} saved</span>
      </div>
      <p className="text-gray-500 text-sm mb-6">
        Your personal research workspace. Stored in your browser — no account needed.
      </p>

      <div className="space-y-3">
        {saved.map((market) => (
          <SavedMarketCard
            key={`${market.platform}-${market.id}`}
            market={market}
            onRemove={() => remove(market.id, market.platform)}
            onUpdateNotes={(notes) => updateNotes(market.id, market.platform, notes)}
          />
        ))}
      </div>
    </div>
  );
}

function SavedMarketCard({
  market,
  onRemove,
  onUpdateNotes,
}: {
  market: SavedMarket;
  onRemove: () => void;
  onUpdateNotes: (notes: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [notes, setNotes] = useState(market.notes || '');

  const saveNotes = () => {
    onUpdateNotes(notes);
    setEditing(false);
  };

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
      <div className="flex items-start gap-4">
        <div className="w-20 shrink-0 mt-1">
          <PriceBar yesPrice={market.yesPrice} size="sm" />
        </div>

        <div className="flex-1 min-w-0">
          <Link
            to={`/market/${market.platform}/${encodeURIComponent(market.id)}`}
            className="text-sm font-medium text-gray-100 hover:text-cyan-400 transition-colors"
          >
            {market.question}
          </Link>
          <div className="flex gap-3 mt-1 text-xs text-gray-500">
            <span className="capitalize">{market.platform}</span>
            <span>Saved {new Date(market.savedAt).toLocaleDateString()}</span>
            <span>Was {(market.yesPrice * 100).toFixed(0)}% when saved</span>
          </div>
        </div>

        <div className="flex gap-2 shrink-0">
          <button
            onClick={() => setEditing(!editing)}
            className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
          >
            {editing ? 'Cancel' : 'Notes'}
          </button>
          <button
            onClick={onRemove}
            className="text-xs text-gray-500 hover:text-red-400 transition-colors"
          >
            Remove
          </button>
        </div>
      </div>

      {/* Notes */}
      {(editing || market.notes) && (
        <div className="mt-3 pl-24">
          {editing ? (
            <div className="flex gap-2">
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Your thesis or notes..."
                className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-cyan-500"
                onKeyDown={(e) => e.key === 'Enter' && saveNotes()}
                autoFocus
              />
              <button
                onClick={saveNotes}
                className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white text-xs rounded transition-colors"
              >
                Save
              </button>
            </div>
          ) : (
            <div className="text-sm text-gray-400 italic">{market.notes}</div>
          )}
        </div>
      )}
    </div>
  );
}
