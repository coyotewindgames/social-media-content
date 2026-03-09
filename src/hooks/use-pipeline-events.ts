import { useState, useEffect, useCallback, useRef } from 'react';
import {
  PipelineEvent,
  PipelineEventState,
  PipelineStage,
  SSEConnectionOptions,
  DEFAULT_SSE_OPTIONS,
} from '@/lib/pipeline-types';

// Maximum number of events to keep in state to prevent unbounded memory growth
const MAX_EVENTS = 100;

/**
 * Hook for subscribing to real-time pipeline events via Server-Sent Events (SSE).
 * Provides connection management, automatic reconnection, and event state normalization.
 *
 * @param jobId - The pipeline job ID to subscribe to
 * @param options - Optional SSE connection configuration
 * @returns PipelineEventState with current status, progress, events, and connection state
 *
 * @example
 * ```tsx
 * const { status, progress, events, isConnected, error } = usePipelineEvents('job-123');
 * ```
 */
export function usePipelineEvents(
  jobId: string,
  options: SSEConnectionOptions = {}
): PipelineEventState {
  // Store merged options in a ref to prevent unnecessary re-renders and reconnections
  const mergedOptionsRef = useRef({ ...DEFAULT_SSE_OPTIONS, ...options });
  // Update the ref when options change
  mergedOptionsRef.current = { ...DEFAULT_SSE_OPTIONS, ...options };
  
  const [state, setState] = useState<PipelineEventState>({
    status: 'queued',
    progress: 0,
    events: [],
    isConnected: false,
    currentAgent: undefined,
    error: undefined,
  });

  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * Parse incoming SSE event data into a PipelineEvent.
   */
  const parseEvent = useCallback((data: string): PipelineEvent | null => {
    try {
      const parsed = JSON.parse(data);
      return {
        jobId: parsed.jobId || jobId,
        stage: parsed.stage || parsed.status || 'queued',
        timestamp: parsed.timestamp || new Date().toISOString(),
        progress: typeof parsed.progress === 'number' ? parsed.progress : undefined,
        error: parsed.error,
        agentName: parsed.agentName || parsed.currentAgent,
        message: parsed.message,
      };
    } catch (e) {
      console.error('Failed to parse pipeline event:', e);
      return null;
    }
  }, [jobId]);

  /**
   * Update state based on a new pipeline event.
   */
  const handleEvent = useCallback((event: PipelineEvent) => {
    setState((prev) => {
      // Cap events to prevent unbounded memory growth
      const newEvents = [...prev.events, event].slice(-MAX_EVENTS);
      
      // Calculate progress based on event or estimate from stage
      let progress = event.progress ?? prev.progress;
      if (event.stage === 'completed') {
        progress = 100;
      } else if (event.stage === 'failed') {
        progress = prev.progress; // Keep last progress on failure
      }

      return {
        status: event.stage,
        progress,
        error: event.error || (event.stage === 'failed' ? 'Pipeline failed' : undefined),
        events: newEvents,
        isConnected: prev.isConnected,
        currentAgent: event.agentName || prev.currentAgent,
      };
    });
  }, []);

  /**
   * Connect to the SSE endpoint.
   */
  const connect = useCallback(() => {
    // Don't connect if no jobId provided
    if (!jobId) {
      return;
    }

    const mergedOptions = mergedOptionsRef.current;

    // Clean up existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const url = `${mergedOptions.baseUrl}/events/${jobId}`;
    
    try {
      const eventSource = new EventSource(url);
      eventSourceRef.current = eventSource;

      eventSource.onopen = () => {
        reconnectAttemptsRef.current = 0;
        setState((prev) => ({ ...prev, isConnected: true }));
        mergedOptions.onConnect?.();
      };

      eventSource.onmessage = (event) => {
        const pipelineEvent = parseEvent(event.data);
        if (pipelineEvent) {
          handleEvent(pipelineEvent);
        }
      };

      // Handle specific event types
      eventSource.addEventListener('status', (event: MessageEvent) => {
        const pipelineEvent = parseEvent(event.data);
        if (pipelineEvent) {
          handleEvent(pipelineEvent);
        }
      });

      eventSource.addEventListener('progress', (event: MessageEvent) => {
        const pipelineEvent = parseEvent(event.data);
        if (pipelineEvent) {
          handleEvent(pipelineEvent);
        }
      });

      // Use a non-reserved event name for pipeline errors to avoid
      // conflicting with EventSource connection errors
      eventSource.addEventListener('pipeline_error', (event: MessageEvent) => {
        const pipelineEvent = parseEvent(event.data);
        if (pipelineEvent) {
          handleEvent({
            ...pipelineEvent,
            stage: 'failed',
          });
        }
      });

      eventSource.addEventListener('complete', (event: MessageEvent) => {
        const pipelineEvent = parseEvent(event.data);
        if (pipelineEvent) {
          handleEvent({
            ...pipelineEvent,
            stage: 'completed',
            progress: 100,
          });
        }
        // Close connection on completion
        eventSource.close();
        setState((prev) => ({ ...prev, isConnected: false }));
      });

      eventSource.onerror = () => {
        eventSource.close();
        setState((prev) => ({ ...prev, isConnected: false }));
        mergedOptions.onDisconnect?.();

        // Attempt reconnection with exponential backoff
        if (reconnectAttemptsRef.current < (mergedOptions.maxReconnectAttempts ?? 10)) {
          const delay = mergedOptions.reconnectInterval! * Math.pow(2, reconnectAttemptsRef.current);
          reconnectAttemptsRef.current += 1;
          
          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, delay);
        } else {
          const error = new Error('Max reconnection attempts reached');
          setState((prev) => ({ 
            ...prev, 
            error: error.message,
          }));
          mergedOptions.onError?.(error);
        }
      };
    } catch (e) {
      const error = e instanceof Error ? e : new Error('Failed to connect to SSE');
      setState((prev) => ({ 
        ...prev, 
        isConnected: false,
        error: error.message,
      }));
      mergedOptions.onError?.(error);
    }
  }, [jobId, parseEvent, handleEvent]);

  /**
   * Disconnect from the SSE endpoint.
   */
  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    
    setState((prev) => ({ ...prev, isConnected: false }));
  }, []);

  // Connect on mount and when jobId changes
  useEffect(() => {
    if (jobId) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [jobId, connect, disconnect]);

  return state;
}

/**
 * Mock hook for testing without a real SSE connection.
 * Simulates pipeline progress through stages.
 */
export function useMockPipelineEvents(
  jobId: string,
  simulateProgress = true
): PipelineEventState {
  const [state, setState] = useState<PipelineEventState>({
    status: 'queued',
    progress: 0,
    events: [],
    isConnected: true,
    currentAgent: undefined,
    error: undefined,
  });

  useEffect(() => {
    if (!simulateProgress || !jobId) return;

    const stages: Array<{ stage: PipelineStage; agent?: string; duration: number }> = [
      { stage: 'queued', duration: 1000 },
      { stage: 'running', agent: 'news_agent', duration: 2000 },
      { stage: 'running', agent: 'content_agent', duration: 2000 },
      { stage: 'running', agent: 'image_agent', duration: 3000 },
      { stage: 'running', agent: 'publish_agent', duration: 1500 },
      { stage: 'completed', duration: 0 },
    ];

    let currentIndex = 0;
    let progressInterval: ReturnType<typeof setInterval> | null = null;

    const advanceStage = () => {
      if (currentIndex >= stages.length) {
        if (progressInterval) clearInterval(progressInterval);
        return;
      }

      const { stage, agent, duration } = stages[currentIndex];
      const baseProgress = (currentIndex / (stages.length - 1)) * 100;

      setState((prev) => ({
        ...prev,
        status: stage,
        progress: Math.min(baseProgress, 100),
        currentAgent: agent,
        events: [
          ...prev.events,
          {
            jobId,
            stage,
            timestamp: new Date().toISOString(),
            progress: baseProgress,
            agentName: agent,
          },
        ],
      }));

      currentIndex++;
      
      if (duration > 0) {
        setTimeout(advanceStage, duration);
      }
    };

    // Start simulation
    advanceStage();

    // Simulate gradual progress within stages
    progressInterval = setInterval(() => {
      setState((prev) => {
        if (prev.status === 'completed' || prev.status === 'failed') {
          return prev;
        }
        const newProgress = Math.min(prev.progress + 2, 95);
        return { ...prev, progress: newProgress };
      });
    }, 500);

    return () => {
      if (progressInterval) clearInterval(progressInterval);
    };
  }, [jobId, simulateProgress]);

  return state;
}
