import { useState, useEffect, useCallback, useRef } from 'react';
import {
  ContentPreview,
  ContentPreviewState,
  ContentType,
  getContentTypeFromMime,
  getContentTypeFromExtension,
} from '@/lib/pipeline-types';

/**
 * Cache for storing fetched content previews.
 */
const previewCache = new Map<string, { preview: ContentPreview; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Hook for fetching and caching content previews.
 * Supports multiple content types including text, images, audio, video, and JSON.
 *
 * @param contentId - The unique identifier for the content to preview
 * @param options - Optional configuration for fetching
 * @returns ContentPreviewState with preview data, loading state, and refetch function
 *
 * @example
 * ```tsx
 * const { preview, isLoading, error, refetch } = useContentPreview('content-123');
 * ```
 */
export function useContentPreview(
  contentId: string | null,
  options: {
    baseUrl?: string;
    skipCache?: boolean;
    contentType?: ContentType;
  } = {}
): ContentPreviewState {
  const { baseUrl = '/api/content', skipCache = false, contentType } = options;

  const [state, setState] = useState<ContentPreviewState>({
    preview: null,
    isLoading: false,
    error: undefined,
    refetch: async () => {},
  });

  const abortControllerRef = useRef<AbortController | null>(null);

  /**
   * Fetch content preview from the API.
   */
  const fetchPreview = useCallback(async () => {
    if (!contentId) {
      setState((prev) => ({
        ...prev,
        preview: null,
        isLoading: false,
        error: undefined,
      }));
      return;
    }

    // Check cache first
    if (!skipCache) {
      const cached = previewCache.get(contentId);
      if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        setState((prev) => ({
          ...prev,
          preview: cached.preview,
          isLoading: false,
          error: undefined,
        }));
        return;
      }
    }

    // Cancel any pending request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    abortControllerRef.current = new AbortController();

    setState((prev) => ({ ...prev, isLoading: true, error: undefined }));

    try {
      const response = await fetch(`${baseUrl}/${contentId}`, {
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch content: ${response.status} ${response.statusText}`);
      }

      const responseContentType = response.headers.get('content-type') || '';
      const detectedType = contentType || getContentTypeFromMime(responseContentType);

      let content: string;
      let previewData: ContentPreview;

      // Handle different content types
      if (detectedType === 'image') {
        // For images, use the URL directly or convert to data URL
        const blob = await response.blob();
        content = URL.createObjectURL(blob);
        previewData = {
          id: contentId,
          type: 'image',
          content: '',
          url: content,
          mimeType: responseContentType,
          createdAt: new Date().toISOString(),
        };
      } else if (detectedType === 'audio' || detectedType === 'video') {
        // For audio/video, use blob URL
        const blob = await response.blob();
        content = URL.createObjectURL(blob);
        previewData = {
          id: contentId,
          type: detectedType,
          content: '',
          url: content,
          mimeType: responseContentType,
          createdAt: new Date().toISOString(),
        };
      } else if (detectedType === 'json') {
        // For JSON, parse and stringify for display
        const jsonData = await response.json();
        content = JSON.stringify(jsonData, null, 2);
        previewData = {
          id: contentId,
          type: 'json',
          content,
          mimeType: 'application/json',
          metadata: jsonData,
          createdAt: new Date().toISOString(),
        };
      } else {
        // For text, markdown, html
        content = await response.text();
        previewData = {
          id: contentId,
          type: detectedType,
          content,
          mimeType: responseContentType || 'text/plain',
          createdAt: new Date().toISOString(),
        };
      }

      // Cache the result
      previewCache.set(contentId, {
        preview: previewData,
        timestamp: Date.now(),
      });

      setState((prev) => ({
        ...prev,
        preview: previewData,
        isLoading: false,
        error: undefined,
      }));
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') {
        // Request was cancelled, don't update state
        return;
      }

      const errorMessage = e instanceof Error ? e.message : 'Failed to fetch content preview';
      setState((prev) => ({
        ...prev,
        preview: null,
        isLoading: false,
        error: errorMessage,
      }));
    }
  }, [contentId, baseUrl, skipCache, contentType]);

  // Create stable refetch function
  const refetch = useCallback(async () => {
    // Clear cache for this item
    if (contentId) {
      previewCache.delete(contentId);
    }
    await fetchPreview();
  }, [contentId, fetchPreview]);

  // Fetch on mount and when contentId changes
  useEffect(() => {
    fetchPreview();

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [fetchPreview]);

  return {
    ...state,
    refetch,
  };
}

/**
 * Hook for creating content previews from local data.
 * Useful for displaying content that's already available in memory.
 *
 * @param data - The content data to preview
 * @param type - The type of content
 * @returns ContentPreview object
 */
export function useLocalContentPreview(
  data: string | object | null,
  type?: ContentType
): ContentPreview | null {
  const [preview, setPreview] = useState<ContentPreview | null>(null);

  useEffect(() => {
    if (data === null || data === undefined) {
      setPreview(null);
      return;
    }

    let content: string;
    let detectedType = type;

    if (typeof data === 'object') {
      content = JSON.stringify(data, null, 2);
      detectedType = detectedType || 'json';
    } else {
      content = data;
      // Try to detect type from content
      if (!detectedType) {
        if (content.startsWith('{') || content.startsWith('[')) {
          try {
            JSON.parse(content);
            detectedType = 'json';
          } catch {
            detectedType = 'text';
          }
        } else if (content.startsWith('<!DOCTYPE') || content.startsWith('<html')) {
          detectedType = 'html';
        } else if (content.includes('# ') || content.includes('## ')) {
          detectedType = 'markdown';
        } else if (content.startsWith('data:image/')) {
          detectedType = 'image';
        } else {
          detectedType = 'text';
        }
      }
    }

    setPreview({
      id: `local-${Date.now()}`,
      type: detectedType || 'text',
      content,
      createdAt: new Date().toISOString(),
    });
  }, [data, type]);

  return preview;
}

/**
 * Create a content preview from a URL.
 */
export function createPreviewFromUrl(
  url: string,
  filename?: string
): ContentPreview {
  const type = filename 
    ? getContentTypeFromExtension(filename) 
    : 'image'; // Default to image for URLs

  return {
    id: `url-${Date.now()}`,
    type,
    content: '',
    url,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Clear the preview cache.
 */
export function clearPreviewCache(): void {
  previewCache.clear();
}

/**
 * Remove a specific item from the preview cache.
 */
export function invalidatePreviewCache(contentId: string): void {
  previewCache.delete(contentId);
}
