import { Lightbulb } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'

interface EmptyStateProps {
  onCreateFirst: () => void
}

export function EmptyState({ onCreateFirst }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-4">
      <div className="w-20 h-20 rounded-full bg-gradient-to-br from-accent/20 to-primary/20 flex items-center justify-center mb-6">
        <Lightbulb size={40} weight="duotone" className="text-primary" />
      </div>
      <h2 className="text-2xl font-bold mb-2">No Content Ideas Yet</h2>
      <p className="text-muted-foreground text-center mb-6 max-w-md">
        Start planning your social media content by creating your first idea. Use AI to help generate engaging captions!
      </p>
      <Button
        onClick={onCreateFirst}
        className="bg-gradient-to-r from-accent to-primary text-white"
        size="lg"
      >
        <Lightbulb size={20} className="mr-2" weight="fill" />
        Create Your First Idea
      </Button>
    </div>
  )
}
