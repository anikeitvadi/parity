import { useState, useCallback, useEffect } from 'react';

export interface SavedMarket {
  id: string;
  platform: string;
  question: string;
  yesPrice: number;
  savedAt: number;
  notes?: string;
}

const STORAGE_KEY = 'pms-saved-markets';

function loadFromStorage(): SavedMarket[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveToStorage(markets: SavedMarket[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(markets));
}

export function useSavedMarkets() {
  const [saved, setSaved] = useState<SavedMarket[]>(loadFromStorage);

  // Sync to localStorage on change
  useEffect(() => {
    saveToStorage(saved);
  }, [saved]);

  const save = useCallback(
    (market: Omit<SavedMarket, 'savedAt'>) => {
      setSaved((prev) => {
        // Don't duplicate
        if (prev.some((m) => m.id === market.id && m.platform === market.platform)) {
          return prev;
        }
        return [{ ...market, savedAt: Date.now() }, ...prev];
      });
    },
    []
  );

  const remove = useCallback((id: string, platform: string) => {
    setSaved((prev) => prev.filter((m) => !(m.id === id && m.platform === platform)));
  }, []);

  const isSaved = useCallback(
    (id: string, platform: string) => saved.some((m) => m.id === id && m.platform === platform),
    [saved]
  );

  const updateNotes = useCallback((id: string, platform: string, notes: string) => {
    setSaved((prev) =>
      prev.map((m) =>
        m.id === id && m.platform === platform ? { ...m, notes } : m
      )
    );
  }, []);

  return { saved, save, remove, isSaved, updateNotes };
}
