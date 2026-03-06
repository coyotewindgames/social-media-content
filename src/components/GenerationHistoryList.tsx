import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PipelineHistoryItem, PipelineStage, STAGE_COLORS, STAGE_LABELS } from '@/lib/pipeline-types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Clock,
  MagnifyingGlass,
  Funnel,
  CaretDown,
  CaretUp,
  CheckCircle,
  XCircle,
  Spinner,
  ClockCountdown,
  Newspaper,
  Article,
  Image as ImageIcon,
  PaperPlaneTilt,
  ArrowsClockwise,
  Trash,
  Eye,
  Warning,
} from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import { formatDistanceToNow, format } from 'date-fns';

interface GenerationHistoryListProps {
  /** Array of pipeline history items to display */
  items: PipelineHistoryItem[];
  /** Whether the history is currently loading */
  isLoading?: boolean;
  /** Callback when an item is selected for viewing */
  onViewItem?: (item: PipelineHistoryItem) => void;
  /** Callback to retry a failed pipeline */
  onRetryItem?: (item: PipelineHistoryItem) => void;
  /** Callback to delete a history item */
  onDeleteItem?: (item: PipelineHistoryItem) => void;
  /** Optional title for the panel */
  title?: string;
  /** Optional className for styling */
  className?: string;
  /** Maximum height for the list */
  maxHeight?: string | number;
}

type SortField = 'startedAt' | 'status' | 'postsCount';
type SortDirection = 'asc' | 'desc';

/**
 * Status icon component.
 */
function StatusIcon({ status, className }: { status: PipelineStage; className?: string }) {
  const iconProps = { size: 16, weight: 'bold' as const, className };

  switch (status) {
    case 'queued':
      return <ClockCountdown {...iconProps} />;
    case 'running':
      return <Spinner {...iconProps} className={cn(className, 'animate-spin')} />;
    case 'completed':
      return <CheckCircle {...iconProps} />;
    case 'failed':
      return <XCircle {...iconProps} />;
    default:
      return null;
  }
}

/**
 * Status badge with color.
 */
function HistoryStatusBadge({ status }: { status: PipelineStage }) {
  const colorClasses: Record<PipelineStage, string> = {
    queued: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    running: 'bg-blue-100 text-blue-800 border-blue-200',
    completed: 'bg-green-100 text-green-800 border-green-200',
    failed: 'bg-red-100 text-red-800 border-red-200',
  };

  return (
    <Badge 
      variant="outline" 
      className={cn('gap-1 text-xs', colorClasses[status])}
    >
      <StatusIcon status={status} className="size-3" />
      {STAGE_LABELS[status]}
    </Badge>
  );
}

/**
 * Stats display for a history item.
 */
function ItemStats({ item }: { item: PipelineHistoryItem }) {
  return (
    <div className="flex items-center gap-3 text-xs text-muted-foreground">
      <span className="flex items-center gap-1" title="News items">
        <Newspaper size={12} />
        {item.newsItemsCount}
      </span>
      <span className="flex items-center gap-1" title="Posts generated">
        <Article size={12} />
        {item.postsCount}
      </span>
      <span className="flex items-center gap-1" title="Image sets">
        <ImageIcon size={12} />
        {item.imageSetsCount}
      </span>
      <span className="flex items-center gap-1" title="Published">
        <PaperPlaneTilt size={12} />
        {item.publishResultsCount}
      </span>
    </div>
  );
}

/**
 * Duration display.
 */
function Duration({ startedAt, completedAt }: { startedAt: string; completedAt?: string }) {
  if (!completedAt) {
    return (
      <span className="text-xs text-muted-foreground">
        Running for {formatDistanceToNow(new Date(startedAt))}
      </span>
    );
  }

  const start = new Date(startedAt);
  const end = new Date(completedAt);
  const durationMs = end.getTime() - start.getTime();
  const durationSec = Math.floor(durationMs / 1000);

  if (durationSec < 60) {
    return <span className="text-xs text-muted-foreground">{durationSec}s</span>;
  }

  const minutes = Math.floor(durationSec / 60);
  const seconds = durationSec % 60;
  return <span className="text-xs text-muted-foreground">{minutes}m {seconds}s</span>;
}

/**
 * Empty state component.
 */
function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <Clock size={48} weight="duotone" className="text-muted-foreground mb-3" />
      <p className="text-sm font-medium">No pipeline runs yet</p>
      <p className="text-sm text-muted-foreground mt-1">
        Your generation history will appear here
      </p>
    </div>
  );
}

/**
 * Loading skeleton.
 */
function LoadingSkeleton() {
  return (
    <div className="space-y-3 p-4">
      {[1, 2, 3].map((i) => (
        <div key={i} className="flex items-center gap-4 p-3 rounded-md bg-muted/50 animate-pulse">
          <div className="w-20 h-5 bg-muted rounded" />
          <div className="flex-1 h-4 bg-muted rounded" />
          <div className="w-24 h-4 bg-muted rounded" />
        </div>
      ))}
    </div>
  );
}

/**
 * History item row component.
 */
function HistoryItemRow({
  item,
  onView,
  onRetry,
  onDelete,
}: {
  item: PipelineHistoryItem;
  onView?: () => void;
  onRetry?: () => void;
  onDelete?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="border rounded-lg overflow-hidden mb-2 last:mb-0"
    >
      <div 
        className={cn(
          'flex items-center gap-3 p-3 cursor-pointer hover:bg-muted/50 transition-colors',
          expanded && 'border-b'
        )}
        onClick={() => setExpanded(!expanded)}
      >
        <div className={cn(
          'w-2 h-2 rounded-full shrink-0',
          STAGE_COLORS[item.status]
        )} />
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-medium font-mono truncate">
              {item.pipelineId.slice(0, 8)}
            </span>
            <HistoryStatusBadge status={item.status} />
            {item.dryRun && (
              <Badge variant="outline" className="text-xs">Dry Run</Badge>
            )}
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Clock size={12} />
              {format(new Date(item.startedAt), 'MMM d, yyyy HH:mm')}
            </span>
            <Duration startedAt={item.startedAt} completedAt={item.completedAt} />
          </div>
        </div>

        <ItemStats item={item} />

        <div className="flex items-center gap-1">
          {onView && (
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); onView(); }}>
              <Eye size={16} />
            </Button>
          )}
          {onRetry && item.status === 'failed' && (
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); onRetry(); }}>
              <ArrowsClockwise size={16} />
            </Button>
          )}
          {onDelete && (
            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={(e) => { e.stopPropagation(); onDelete(); }}>
              <Trash size={16} />
            </Button>
          )}
          {expanded ? <CaretUp size={16} /> : <CaretDown size={16} />}
        </div>
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="p-3 bg-muted/30 space-y-3">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Pipeline ID</p>
                  <p className="text-sm font-mono">{item.pipelineId}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Started</p>
                  <p className="text-sm">{format(new Date(item.startedAt), 'PPpp')}</p>
                </div>
                {item.completedAt && (
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Completed</p>
                    <p className="text-sm">{format(new Date(item.completedAt), 'PPpp')}</p>
                  </div>
                )}
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Mode</p>
                  <p className="text-sm">{item.dryRun ? 'Dry Run' : 'Live'}</p>
                </div>
              </div>

              {item.errors.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground font-medium">Errors</p>
                  <div className="space-y-1">
                    {item.errors.map((error, index) => (
                      <div 
                        key={index}
                        className="flex items-start gap-2 p-2 bg-red-50 dark:bg-red-900/20 rounded-md text-sm"
                      >
                        <Warning size={14} className="text-red-500 shrink-0 mt-0.5" />
                        <span className="text-red-800 dark:text-red-200">{error}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/**
 * GenerationHistoryList displays a list of pipeline run history items.
 * Supports filtering, sorting, and actions on individual items.
 *
 * @example
 * ```tsx
 * <GenerationHistoryList
 *   items={historyItems}
 *   onViewItem={(item) => console.log('View', item)}
 *   onRetryItem={(item) => console.log('Retry', item)}
 * />
 * ```
 */
export function GenerationHistoryList({
  items,
  isLoading = false,
  onViewItem,
  onRetryItem,
  onDeleteItem,
  title = 'Generation History',
  className,
  maxHeight = '500px',
}: GenerationHistoryListProps) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<PipelineStage | 'all'>('all');
  const [sortField, setSortField] = useState<SortField>('startedAt');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  // Filter and sort items
  const filteredItems = useMemo(() => {
    let result = [...items];

    // Apply search filter
    if (search) {
      const searchLower = search.toLowerCase();
      result = result.filter((item) =>
        item.pipelineId.toLowerCase().includes(searchLower)
      );
    }

    // Apply status filter
    if (statusFilter !== 'all') {
      result = result.filter((item) => item.status === statusFilter);
    }

    // Apply sorting
    result.sort((a, b) => {
      let comparison = 0;
      
      switch (sortField) {
        case 'startedAt':
          comparison = new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime();
          break;
        case 'status':
          comparison = a.status.localeCompare(b.status);
          break;
        case 'postsCount':
          comparison = a.postsCount - b.postsCount;
          break;
      }

      return sortDirection === 'asc' ? comparison : -comparison;
    });

    return result;
  }, [items, search, statusFilter, sortField, sortDirection]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  return (
    <Card className={cn('overflow-hidden', className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold">{title}</CardTitle>
          <span className="text-sm text-muted-foreground">
            {filteredItems.length} of {items.length} runs
          </span>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {/* Filters */}
        <div className="flex items-center gap-2 px-4 py-3 border-b">
          <div className="relative flex-1 max-w-xs">
            <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9"
            />
          </div>

          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as PipelineStage | 'all')}>
            <SelectTrigger className="w-[140px] h-9">
              <Funnel size={14} className="mr-1.5" />
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="queued">Queued</SelectItem>
              <SelectItem value="running">Running</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
            </SelectContent>
          </Select>

          <Button
            variant="outline"
            size="sm"
            className="h-9"
            onClick={() => toggleSort('startedAt')}
          >
            <Clock size={14} className="mr-1.5" />
            Date
            {sortField === 'startedAt' && (
              sortDirection === 'asc' ? <CaretUp size={14} className="ml-1" /> : <CaretDown size={14} className="ml-1" />
            )}
          </Button>
        </div>

        {/* List */}
        <ScrollArea style={{ maxHeight }}>
          <div className="p-4">
            {isLoading ? (
              <LoadingSkeleton />
            ) : filteredItems.length === 0 ? (
              <EmptyState />
            ) : (
              <AnimatePresence mode="popLayout">
                {filteredItems.map((item) => (
                  <HistoryItemRow
                    key={item.id}
                    item={item}
                    onView={onViewItem ? () => onViewItem(item) : undefined}
                    onRetry={onRetryItem ? () => onRetryItem(item) : undefined}
                    onDelete={onDeleteItem ? () => onDeleteItem(item) : undefined}
                  />
                ))}
              </AnimatePresence>
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

/**
 * Compact history list for inline displays.
 */
export function CompactHistoryList({
  items,
  maxItems = 5,
  onViewAll,
  className,
}: {
  items: PipelineHistoryItem[];
  maxItems?: number;
  onViewAll?: () => void;
  className?: string;
}) {
  const displayItems = items.slice(0, maxItems);

  return (
    <div className={cn('space-y-2', className)}>
      {displayItems.map((item) => (
        <div
          key={item.id}
          className="flex items-center gap-2 p-2 rounded-md bg-muted/50"
        >
          <div className={cn('w-2 h-2 rounded-full', STAGE_COLORS[item.status])} />
          <span className="text-sm font-mono truncate flex-1">
            {item.pipelineId.slice(0, 8)}
          </span>
          <span className="text-xs text-muted-foreground">
            {formatDistanceToNow(new Date(item.startedAt), { addSuffix: true })}
          </span>
        </div>
      ))}
      
      {items.length > maxItems && onViewAll && (
        <Button variant="ghost" size="sm" className="w-full" onClick={onViewAll}>
          View all {items.length} runs
        </Button>
      )}
    </div>
  );
}
