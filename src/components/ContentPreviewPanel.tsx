import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { marked } from 'marked';
import { ContentPreview, ContentType } from '@/lib/pipeline-types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Image,
  FileText,
  FileAudio,
  VideoCamera,
  FileCode,
  Code,
  ArrowsClockwise,
  Copy,
  Download,
  Warning,
  File,
} from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface ContentPreviewPanelProps {
  /** The content preview data to display */
  preview: ContentPreview | null;
  /** Whether the content is currently loading */
  isLoading?: boolean;
  /** Optional error message */
  error?: string;
  /** Callback to refetch the content */
  onRefresh?: () => void;
  /** Optional title for the panel */
  title?: string;
  /** Optional className for styling */
  className?: string;
  /** Maximum height for the preview area */
  maxHeight?: string | number;
}

/**
 * Icon component for different content types.
 */
function ContentTypeIcon({ type, className }: { type: ContentType; className?: string }) {
  const iconProps = { size: 20, weight: 'duotone' as const, className };

  switch (type) {
    case 'image':
      return <Image {...iconProps} />;
    case 'audio':
      return <FileAudio {...iconProps} />;
    case 'video':
      return <VideoCamera {...iconProps} />;
    case 'json':
      return <FileCode {...iconProps} />;
    case 'markdown':
    case 'html':
      return <Code {...iconProps} />;
    case 'text':
    default:
      return <FileText {...iconProps} />;
  }
}

/**
 * Type badge for displaying content type.
 */
function ContentTypeBadge({ type }: { type: ContentType }) {
  const typeColors: Record<ContentType, string> = {
    text: 'bg-gray-100 text-gray-800',
    image: 'bg-purple-100 text-purple-800',
    audio: 'bg-pink-100 text-pink-800',
    video: 'bg-red-100 text-red-800',
    json: 'bg-blue-100 text-blue-800',
    markdown: 'bg-green-100 text-green-800',
    html: 'bg-orange-100 text-orange-800',
  };

  return (
    <Badge variant="outline" className={cn('gap-1', typeColors[type])}>
      <ContentTypeIcon type={type} className="size-3.5" />
      {type.toUpperCase()}
    </Badge>
  );
}

/**
 * Text preview component.
 */
function TextPreview({ content, className }: { content: string; className?: string }) {
  return (
    <pre className={cn(
      'whitespace-pre-wrap break-words font-mono text-sm p-4 bg-muted rounded-md',
      className
    )}>
      {content}
    </pre>
  );
}

/**
 * Image preview component.
 */
function ImagePreview({ 
  url, 
  alt = 'Content preview',
  className,
}: { 
  url: string; 
  alt?: string;
  className?: string;
}) {
  return (
    <div className={cn('relative overflow-hidden rounded-md', className)}>
      <img 
        src={url} 
        alt={alt}
        className="w-full h-auto object-contain max-h-96"
        loading="lazy"
      />
    </div>
  );
}

/**
 * Audio preview component.
 */
function AudioPreview({ url, className }: { url: string; className?: string }) {
  return (
    <div className={cn('p-4', className)}>
      <audio controls className="w-full">
        <source src={url} />
        Your browser does not support the audio element.
      </audio>
    </div>
  );
}

/**
 * Video preview component.
 */
function VideoPreview({ url, className }: { url: string; className?: string }) {
  return (
    <div className={cn('relative overflow-hidden rounded-md', className)}>
      <video 
        controls 
        className="w-full max-h-96"
        preload="metadata"
      >
        <source src={url} />
        Your browser does not support the video element.
      </video>
    </div>
  );
}

/**
 * JSON preview component with syntax highlighting.
 */
function JsonPreview({ content, className }: { content: string; className?: string }) {
  // Apply basic syntax highlighting
  const highlightedJson = useMemo(() => {
    return content
      .replace(/"([^"]+)":/g, '<span class="text-blue-600 dark:text-blue-400">"$1"</span>:')
      .replace(/: "([^"]+)"/g, ': <span class="text-green-600 dark:text-green-400">"$1"</span>')
      .replace(/: (\d+)/g, ': <span class="text-orange-600 dark:text-orange-400">$1</span>')
      .replace(/: (true|false|null)/g, ': <span class="text-purple-600 dark:text-purple-400">$1</span>');
  }, [content]);

  return (
    <pre 
      className={cn(
        'whitespace-pre-wrap break-words font-mono text-sm p-4 bg-muted rounded-md overflow-x-auto',
        className
      )}
      dangerouslySetInnerHTML={{ __html: highlightedJson }}
    />
  );
}

/**
 * Markdown preview component.
 */
function MarkdownPreview({ content, className }: { content: string; className?: string }) {
  const html = useMemo(() => {
    return marked.parse(content, { async: false }) as string;
  }, [content]);

  return (
    <div 
      className={cn(
        'prose prose-sm dark:prose-invert max-w-none p-4',
        className
      )}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

/**
 * HTML preview component with iframe sandbox.
 */
function HtmlPreview({ content, className }: { content: string; className?: string }) {
  const srcDoc = useMemo(() => {
    // Add basic styling to the HTML
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { 
              font-family: system-ui, sans-serif; 
              padding: 16px; 
              margin: 0;
              font-size: 14px;
              line-height: 1.5;
            }
          </style>
        </head>
        <body>${content}</body>
      </html>
    `;
  }, [content]);

  return (
    <iframe
      srcDoc={srcDoc}
      sandbox="allow-same-origin"
      className={cn('w-full min-h-48 border rounded-md bg-white', className)}
      title="HTML Preview"
    />
  );
}

/**
 * Loading skeleton for the preview panel.
 */
function PreviewSkeleton() {
  return (
    <div className="space-y-3 p-4">
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-5/6" />
      <Skeleton className="h-32 w-full" />
    </div>
  );
}

/**
 * Empty state when no preview is available.
 */
function EmptyPreviewState() {
  return (
    <div className="flex flex-col items-center justify-center p-8 text-center">
      <File size={48} weight="duotone" className="text-muted-foreground mb-3" />
      <p className="text-sm text-muted-foreground">No content to preview</p>
    </div>
  );
}

/**
 * Error state for preview failures.
 */
function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center p-8 text-center">
      <Warning size={48} weight="duotone" className="text-red-500 mb-3" />
      <p className="text-sm font-medium text-red-800 dark:text-red-200 mb-2">
        Failed to load preview
      </p>
      <p className="text-sm text-muted-foreground mb-4">{message}</p>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <ArrowsClockwise size={14} className="mr-1.5" />
          Retry
        </Button>
      )}
    </div>
  );
}

/**
 * ContentPreviewPanel displays a polymorphic preview of generated content.
 * Supports text, images, audio, video, JSON, markdown, and HTML content types.
 *
 * @example
 * ```tsx
 * const { preview, isLoading, error, refetch } = useContentPreview('content-123');
 * return (
 *   <ContentPreviewPanel
 *     preview={preview}
 *     isLoading={isLoading}
 *     error={error}
 *     onRefresh={refetch}
 *   />
 * );
 * ```
 */
export function ContentPreviewPanel({
  preview,
  isLoading = false,
  error,
  onRefresh,
  title = 'Content Preview',
  className,
  maxHeight = '400px',
}: ContentPreviewPanelProps) {
  
  /**
   * Copy content to clipboard.
   */
  const handleCopy = () => {
    if (preview?.content) {
      navigator.clipboard.writeText(preview.content);
      toast.success('Content copied to clipboard');
    }
  };

  /**
   * Download content as file.
   */
  const handleDownload = () => {
    if (!preview) return;

    let blob: Blob;
    let filename: string;

    if (preview.url) {
      // For media files, open the URL directly
      window.open(preview.url, '_blank');
      return;
    }

    const mimeType = preview.mimeType || 'text/plain';
    blob = new Blob([preview.content], { type: mimeType });
    
    const ext = {
      text: 'txt',
      json: 'json',
      markdown: 'md',
      html: 'html',
      image: 'png',
      audio: 'mp3',
      video: 'mp4',
    }[preview.type] || 'txt';
    
    filename = `content-${preview.id}.${ext}`;

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  /**
   * Render the appropriate preview based on content type.
   */
  const renderPreview = () => {
    if (isLoading) {
      return <PreviewSkeleton />;
    }

    if (error) {
      return <ErrorState message={error} onRetry={onRefresh} />;
    }

    if (!preview) {
      return <EmptyPreviewState />;
    }

    switch (preview.type) {
      case 'image':
        return <ImagePreview url={preview.url || preview.content} alt={preview.id} />;
      case 'audio':
        return <AudioPreview url={preview.url || preview.content} />;
      case 'video':
        return <VideoPreview url={preview.url || preview.content} />;
      case 'json':
        return <JsonPreview content={preview.content} />;
      case 'markdown':
        return <MarkdownPreview content={preview.content} />;
      case 'html':
        return <HtmlPreview content={preview.content} />;
      case 'text':
      default:
        return <TextPreview content={preview.content} />;
    }
  };

  return (
    <Card className={cn('overflow-hidden', className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold">{title}</CardTitle>
          <div className="flex items-center gap-2">
            {preview && <ContentTypeBadge type={preview.type} />}
            {onRefresh && (
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-8 w-8"
                onClick={onRefresh}
                disabled={isLoading}
              >
                <ArrowsClockwise 
                  size={16} 
                  className={cn(isLoading && 'animate-spin')} 
                />
              </Button>
            )}
          </div>
        </div>
        {preview && (
          <p className="text-xs text-muted-foreground">
            Created: {new Date(preview.createdAt).toLocaleString()}
          </p>
        )}
      </CardHeader>

      <CardContent className="p-0">
        <ScrollArea style={{ maxHeight }} className="w-full">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2 }}
          >
            {renderPreview()}
          </motion.div>
        </ScrollArea>

        {/* Action buttons */}
        {preview && !error && (
          <div className="flex items-center gap-2 p-3 border-t bg-muted/50">
            {preview.content && (
              <Button variant="outline" size="sm" onClick={handleCopy}>
                <Copy size={14} className="mr-1.5" />
                Copy
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={handleDownload}>
              <Download size={14} className="mr-1.5" />
              Download
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Inline content preview for compact displays.
 */
export function InlineContentPreview({
  preview,
  maxLength = 100,
  className,
}: {
  preview: ContentPreview | null;
  maxLength?: number;
  className?: string;
}) {
  if (!preview) {
    return <span className="text-muted-foreground text-sm">No preview</span>;
  }

  const truncatedContent = preview.content.length > maxLength
    ? `${preview.content.slice(0, maxLength)}...`
    : preview.content;

  return (
    <div className={cn('flex items-start gap-2', className)}>
      <ContentTypeIcon type={preview.type} className="size-4 text-muted-foreground shrink-0 mt-0.5" />
      {preview.type === 'image' && preview.url ? (
        <img 
          src={preview.url} 
          alt="Preview" 
          className="w-16 h-16 object-cover rounded-md"
        />
      ) : (
        <span className="text-sm text-muted-foreground line-clamp-2">
          {truncatedContent}
        </span>
      )}
    </div>
  );
}
