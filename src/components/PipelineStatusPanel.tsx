import { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  PipelineEventState,
  PipelineStage,
  STAGE_COLORS,
  STAGE_LABELS,
} from '@/lib/pipeline-types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { 
  ClockCountdown, 
  Spinner, 
  CheckCircle, 
  XCircle,
  Lightning,
  Warning,
  WifiHigh,
  WifiSlash,
} from '@phosphor-icons/react';
import { cn } from '@/lib/utils';

interface PipelineStatusPanelProps {
  /** Pipeline event state from usePipelineEvents hook */
  state: PipelineEventState;
  /** Optional pipeline/job ID to display */
  jobId?: string;
  /** Optional title for the panel */
  title?: string;
  /** Whether to show detailed event history */
  showHistory?: boolean;
  /** Optional className for styling */
  className?: string;
}

/**
 * Status icon component for different pipeline stages.
 */
function StageIcon({ stage, className }: { stage: PipelineStage; className?: string }) {
  const iconProps = { size: 20, weight: 'bold' as const, className };

  switch (stage) {
    case 'queued':
      return <ClockCountdown {...iconProps} />;
    case 'running':
      return <Spinner {...iconProps} className={cn(className, 'animate-spin')} />;
    case 'completed':
      return <CheckCircle {...iconProps} />;
    case 'failed':
      return <XCircle {...iconProps} />;
    default:
      return <Lightning {...iconProps} />;
  }
}

/**
 * Status badge component with color and animation.
 */
function StatusBadge({ stage }: { stage: PipelineStage }) {
  const colorClasses: Record<PipelineStage, string> = {
    queued: 'bg-yellow-100 text-yellow-800 border-yellow-300 dark:bg-yellow-900/30 dark:text-yellow-200',
    running: 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/30 dark:text-blue-200',
    completed: 'bg-green-100 text-green-800 border-green-300 dark:bg-green-900/30 dark:text-green-200',
    failed: 'bg-red-100 text-red-800 border-red-300 dark:bg-red-900/30 dark:text-red-200',
  };

  return (
    <Badge 
      variant="outline" 
      className={cn(
        'gap-1.5 px-2.5 py-1 font-medium',
        colorClasses[stage],
        stage === 'running' && 'animate-pulse'
      )}
    >
      <StageIcon stage={stage} className="size-4" />
      {STAGE_LABELS[stage]}
    </Badge>
  );
}

/**
 * Connection status indicator.
 */
function ConnectionIndicator({ isConnected }: { isConnected: boolean }) {
  return (
    <div className={cn(
      'flex items-center gap-1.5 text-xs',
      isConnected ? 'text-green-600 dark:text-green-400' : 'text-gray-400'
    )}>
      {isConnected ? (
        <>
          <WifiHigh size={14} weight="bold" />
          <span>Connected</span>
        </>
      ) : (
        <>
          <WifiSlash size={14} />
          <span>Disconnected</span>
        </>
      )}
    </div>
  );
}

/**
 * Pipeline event item for the history list.
 */
function EventItem({ 
  event, 
  isLast 
}: { 
  event: { stage: PipelineStage; timestamp: string; agentName?: string; message?: string }; 
  isLast: boolean;
}) {
  const time = new Date(event.timestamp).toLocaleTimeString();
  
  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      className="flex items-start gap-3"
    >
      <div className="flex flex-col items-center">
        <div className={cn(
          'w-3 h-3 rounded-full',
          STAGE_COLORS[event.stage]
        )} />
        {!isLast && <div className="w-0.5 h-8 bg-muted mt-1" />}
      </div>
      <div className="flex-1 pb-4">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{STAGE_LABELS[event.stage]}</span>
          {event.agentName && (
            <Badge variant="outline" className="text-xs">
              {event.agentName}
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground">{time}</p>
        {event.message && (
          <p className="text-sm text-muted-foreground mt-1">{event.message}</p>
        )}
      </div>
    </motion.div>
  );
}

/**
 * PipelineStatusPanel displays the current status of a content generation pipeline.
 * Shows status badges, progress indicators, error states, and optionally event history.
 *
 * @example
 * ```tsx
 * const state = usePipelineEvents('job-123');
 * return <PipelineStatusPanel state={state} title="Content Generation" />;
 * ```
 */
export function PipelineStatusPanel({
  state,
  jobId,
  title = 'Pipeline Status',
  showHistory = true,
  className,
}: PipelineStatusPanelProps) {
  const { status, progress, error, events, isConnected, currentAgent } = state;

  // Get unique events for display (last 10)
  const displayEvents = useMemo(() => {
    return events.slice(-10).reverse();
  }, [events]);

  return (
    <Card className={cn('overflow-hidden', className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold">{title}</CardTitle>
          <ConnectionIndicator isConnected={isConnected} />
        </div>
        {jobId && (
          <p className="text-xs text-muted-foreground font-mono">
            ID: {jobId}
          </p>
        )}
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Current Status */}
        <div className="flex items-center justify-between">
          <StatusBadge stage={status} />
          {currentAgent && status === 'running' && (
            <span className="text-sm text-muted-foreground">
              Running: <span className="font-medium">{currentAgent}</span>
            </span>
          )}
        </div>

        {/* Progress Bar */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Progress</span>
            <span className="font-medium">{Math.round(progress)}%</span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>

        {/* Error State */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-900/20 rounded-md border border-red-200 dark:border-red-800">
                <Warning size={18} weight="fill" className="text-red-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-red-800 dark:text-red-200">Error</p>
                  <p className="text-sm text-red-600 dark:text-red-300">{error}</p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Event History */}
        {showHistory && displayEvents.length > 0 && (
          <>
            <Separator />
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-muted-foreground">Recent Activity</h4>
              <div className="max-h-48 overflow-y-auto">
                {displayEvents.map((event, index) => (
                  <EventItem 
                    key={`${event.timestamp}-${index}`} 
                    event={event} 
                    isLast={index === displayEvents.length - 1} 
                  />
                ))}
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Minimal status indicator for inline use.
 */
export function PipelineStatusIndicator({ 
  status, 
  progress,
  className,
}: { 
  status: PipelineStage; 
  progress?: number;
  className?: string;
}) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div className={cn(
        'w-2 h-2 rounded-full',
        STAGE_COLORS[status],
        status === 'running' && 'animate-pulse'
      )} />
      <span className="text-sm">{STAGE_LABELS[status]}</span>
      {progress !== undefined && status === 'running' && (
        <span className="text-xs text-muted-foreground">
          ({Math.round(progress)}%)
        </span>
      )}
    </div>
  );
}
