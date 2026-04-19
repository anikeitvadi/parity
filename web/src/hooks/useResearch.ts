import { useState, useCallback, useRef } from 'react';
import { streamResearch } from '../api/client.js';

export function useResearch(platform: string, id: string) {
  const [content, setContent] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  const start = useCallback(() => {
    // Clean up any existing stream
    cleanupRef.current?.();
    setContent('');
    setError(null);
    setIsStreaming(true);

    cleanupRef.current = streamResearch(
      platform,
      id,
      (token) => setContent((prev) => prev + token),
      () => setIsStreaming(false),
      (err) => {
        setError(err);
        setIsStreaming(false);
      }
    );
  }, [platform, id]);

  const stop = useCallback(() => {
    cleanupRef.current?.();
    cleanupRef.current = null;
    setIsStreaming(false);
  }, []);

  return { content, isStreaming, error, start, stop };
}
