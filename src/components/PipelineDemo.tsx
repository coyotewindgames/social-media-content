/**
 * Pipeline Demo Page
 * 
 * This component demonstrates the usage of the pipeline status components
 * and hooks for real-time content generation updates.
 * 
 * ## Component Hierarchy
 * 
 * ```
 * PipelineDemo
 * ├── PipelineStatusPanel
 * │   ├── StatusBadge (queued | running | completed | failed)
 * │   ├── Progress (progress indicator)
 * │   └── EventItem[] (event history timeline)
 * ├── ContentPreviewPanel
 * │   ├── ContentTypeBadge (text | image | audio | video | json | markdown | html)
 * │   └── Preview (polymorphic content renderer)
 * └── GenerationHistoryList
 *     ├── Filters (search, status, sort)
 *     └── HistoryItemRow[] (expandable history items)
 * ```
 * 
 * ## Data Flow
 * 
 * ```
 * Backend SSE Events                    Frontend Components
 * ─────────────────                    ────────────────────
 *                                      
 * Pipeline Run Started ──────────────► usePipelineEvents()
 *       │                                    │
 *       ▼                                    ▼
 * Stage Updates ────────────────────► PipelineStatusPanel
 * (queued/running/completed/failed)   (shows current status)
 *       │                                    │
 *       ▼                                    ▼
 * Content Generated ────────────────► useContentPreview()
 *       │                                    │
 *       ▼                                    ▼
 * Preview Data ─────────────────────► ContentPreviewPanel
 * (text/image/audio/video/json)       (renders content)
 *       │                                    │
 *       ▼                                    ▼
 * Pipeline Completed ───────────────► GenerationHistoryList
 *                                     (stores in history)
 * ```
 */

import { useState } from 'react';
import { useMockPipelineEvents } from '@/hooks/use-pipeline-events';
import { useLocalContentPreview } from '@/hooks/use-content-preview';
import { PipelineStatusPanel } from '@/components/PipelineStatusPanel';
import { ContentPreviewPanel } from '@/components/ContentPreviewPanel';
import { GenerationHistoryList } from '@/components/GenerationHistoryList';
import { PipelineHistoryItem } from '@/lib/pipeline-types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Play, ArrowsClockwise } from '@phosphor-icons/react';

// Mock history data for demonstration
const mockHistoryItems: PipelineHistoryItem[] = [
  {
    id: '1',
    pipelineId: 'pipeline-abc12345',
    status: 'completed',
    startedAt: new Date(Date.now() - 3600000).toISOString(),
    completedAt: new Date(Date.now() - 3500000).toISOString(),
    newsItemsCount: 5,
    postsCount: 10,
    imageSetsCount: 8,
    publishResultsCount: 10,
    errors: [],
    dryRun: false,
  },
  {
    id: '2',
    pipelineId: 'pipeline-def67890',
    status: 'failed',
    startedAt: new Date(Date.now() - 7200000).toISOString(),
    completedAt: new Date(Date.now() - 7100000).toISOString(),
    newsItemsCount: 3,
    postsCount: 4,
    imageSetsCount: 2,
    publishResultsCount: 0,
    errors: ['Image generation failed: API rate limit exceeded'],
    dryRun: false,
  },
  {
    id: '3',
    pipelineId: 'pipeline-ghi11223',
    status: 'completed',
    startedAt: new Date(Date.now() - 86400000).toISOString(),
    completedAt: new Date(Date.now() - 86300000).toISOString(),
    newsItemsCount: 8,
    postsCount: 16,
    imageSetsCount: 16,
    publishResultsCount: 16,
    errors: [],
    dryRun: true,
  },
];

// Mock generated content for preview
const mockGeneratedContent = {
  text: `🚀 Breaking: Tech innovation reaches new heights!

Exciting developments in AI and machine learning are transforming industries worldwide. From healthcare to finance, the impact is undeniable.

#TechNews #AI #Innovation #FutureIsNow`,
  json: {
    title: 'Breaking Tech News',
    platform: 'twitter',
    hashtags: ['#TechNews', '#AI', '#Innovation'],
    sentiment: 'positive',
    engagementScore: 0.85,
  },
  markdown: `# Content Generation Complete

## Summary
Successfully generated **10 posts** from **5 news items**.

### Platforms
- Twitter: 4 posts
- LinkedIn: 3 posts
- Instagram: 3 posts

### Next Steps
1. Review generated content
2. Approve for publishing
3. Schedule posts
`,
};

/**
 * Pipeline Demo Component
 * 
 * Demonstrates the integration of all pipeline-related components and hooks.
 */
export function PipelineDemo() {
  const [jobId, setJobId] = useState<string | null>(null);
  const [previewType, setPreviewType] = useState<'text' | 'json' | 'markdown'>('text');
  
  // Use mock pipeline events for demonstration
  const pipelineState = useMockPipelineEvents(jobId || '', !!jobId);
  
  // Create local preview from mock data
  const preview = useLocalContentPreview(
    mockGeneratedContent[previewType],
    previewType
  );

  const startNewPipeline = () => {
    setJobId(`job-${Date.now()}`);
  };

  const resetPipeline = () => {
    setJobId(null);
  };

  return (
    <div className="space-y-6 p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Pipeline Status Demo</h1>
          <p className="text-muted-foreground">
            Demonstrating real-time pipeline status and content preview components
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={startNewPipeline} disabled={!!jobId}>
            <Play size={16} className="mr-2" />
            Start Pipeline
          </Button>
          <Button variant="outline" onClick={resetPipeline} disabled={!jobId}>
            <ArrowsClockwise size={16} className="mr-2" />
            Reset
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pipeline Status */}
        <PipelineStatusPanel
          state={pipelineState}
          jobId={jobId || undefined}
          title="Content Generation Pipeline"
          showHistory={true}
        />

        {/* Content Preview */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Preview Content Type</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Tabs value={previewType} onValueChange={(v) => setPreviewType(v as typeof previewType)}>
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="text">Text</TabsTrigger>
                <TabsTrigger value="json">JSON</TabsTrigger>
                <TabsTrigger value="markdown">Markdown</TabsTrigger>
              </TabsList>
            </Tabs>
            
            <ContentPreviewPanel
              preview={preview}
              isLoading={false}
              title="Generated Content"
              maxHeight="300px"
            />
          </CardContent>
        </Card>
      </div>

      {/* Generation History */}
      <GenerationHistoryList
        items={mockHistoryItems}
        title="Pipeline Run History"
        onViewItem={(item) => console.log('View item:', item)}
        onRetryItem={(item) => console.log('Retry item:', item)}
        onDeleteItem={(item) => console.log('Delete item:', item)}
      />

      {/* Integration Documentation */}
      <Card>
        <CardHeader>
          <CardTitle>Integration Guide</CardTitle>
        </CardHeader>
        <CardContent className="prose prose-sm dark:prose-invert max-w-none">
          <h3>Using the Pipeline Components</h3>
          
          <h4>1. Import the hooks and components</h4>
          <pre className="bg-muted p-3 rounded-md overflow-x-auto">
{`import { usePipelineEvents } from '@/hooks/use-pipeline-events';
import { useContentPreview } from '@/hooks/use-content-preview';
import { PipelineStatusPanel } from '@/components/PipelineStatusPanel';
import { ContentPreviewPanel } from '@/components/ContentPreviewPanel';
import { GenerationHistoryList } from '@/components/GenerationHistoryList';`}
          </pre>

          <h4>2. Subscribe to pipeline events</h4>
          <pre className="bg-muted p-3 rounded-md overflow-x-auto">
{`// In your component
const { status, progress, error, events, isConnected } = usePipelineEvents(jobId);

// status: 'queued' | 'running' | 'completed' | 'failed'
// progress: 0-100
// events: Array of pipeline events`}
          </pre>

          <h4>3. Fetch content previews</h4>
          <pre className="bg-muted p-3 rounded-md overflow-x-auto">
{`// Fetch from API
const { preview, isLoading, error, refetch } = useContentPreview(contentId);

// Or use local data
const preview = useLocalContentPreview(localData, 'json');`}
          </pre>

          <h4>4. Render the components</h4>
          <pre className="bg-muted p-3 rounded-md overflow-x-auto">
{`<PipelineStatusPanel
  state={pipelineState}
  jobId={jobId}
  title="Content Generation"
/>

<ContentPreviewPanel
  preview={preview}
  isLoading={isLoading}
  error={error}
  onRefresh={refetch}
/>

<GenerationHistoryList
  items={historyItems}
  onViewItem={handleView}
  onRetryItem={handleRetry}
/>`}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}

export default PipelineDemo;
