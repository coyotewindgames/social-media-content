"""Main entry point for the social media content orchestrator."""

import argparse
import asyncio
import sys
from datetime import datetime
from pathlib import Path
from typing import List, Optional

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger

from .orchestrator import Orchestrator
from .config import load_config, Config
from .models import Platform, Tone
from .utils import get_logger, setup_logging

logger = get_logger(__name__)


class OrchestratorApp:
    """
    Application wrapper for the orchestrator.
    
    Handles CLI arguments, scheduling, and lifecycle management.
    """
    
    def __init__(self):
        self.orchestrator: Optional[Orchestrator] = None
        self.scheduler: Optional[AsyncIOScheduler] = None
        self._running = False
    
    async def run(
        self,
        config_file: Optional[Path] = None,
        dry_run: bool = False,
        keywords: Optional[List[str]] = None,
        platforms: Optional[List[str]] = None,
        tone: str = "professional",
        schedule: bool = False,
        once: bool = True,
        approval_mode: bool = False,
        show_queue: bool = False,
        approve_post: Optional[str] = None,
        reject_post: Optional[str] = None,
        history: bool = False,
    ):
        """
        Run the orchestrator application.
        
        Args:
            config_file: Optional path to config file
            dry_run: Run in dry-run mode (no actual posting)
            keywords: Keywords to filter news
            platforms: Target platforms
            tone: Content tone
            schedule: Enable scheduled runs
            once: Run pipeline once and exit
            approval_mode: Enable approval queue
            show_queue: Show pending approvals
            approve_post: Approve a post by ID
            reject_post: Reject a post by ID
            history: Show pipeline history
        """
        # Load configuration
        config = load_config(config_file)
        
        if dry_run:
            config.dry_run_mode = True
        
        if approval_mode:
            config.require_approval = True
        
        # Initialize orchestrator
        self.orchestrator = Orchestrator(config)
        
        # Handle admin commands
        if show_queue:
            await self._show_approval_queue()
            return
        
        if approve_post:
            await self.orchestrator.approve_post(approve_post, approved=True)
            logger.info(f"Post {approve_post} approved")
            return
        
        if reject_post:
            await self.orchestrator.approve_post(reject_post, approved=False)
            logger.info(f"Post {reject_post} rejected")
            return
        
        if history:
            self._show_history()
            return
        
        # Parse platforms
        platform_list = None
        if platforms:
            platform_list = [Platform(p.lower()) for p in platforms]
        
        # Parse tone
        content_tone = Tone(tone.lower())
        
        if schedule:
            # Run with scheduler
            await self._run_scheduled(
                keywords=keywords,
                platforms=platform_list,
                tone=content_tone,
            )
        elif once:
            # Run once
            result = await self.orchestrator.run_pipeline(
                keywords=keywords,
                platforms=platform_list,
                tone=content_tone,
            )
            self._print_summary(result)
        else:
            # Interactive mode
            await self._run_interactive(
                keywords=keywords,
                platforms=platform_list,
                tone=content_tone,
            )
    
    async def _run_scheduled(
        self,
        keywords: Optional[List[str]],
        platforms: Optional[List[Platform]],
        tone: Tone,
    ):
        """Run with APScheduler for scheduled execution."""
        self.scheduler = AsyncIOScheduler()
        self._running = True
        
        # Schedule based on config
        if self.orchestrator.config.optimal_posting_times:
            # Schedule at optimal times
            for time_str in self.orchestrator.config.optimal_posting_times:
                hour, minute = map(int, time_str.split(":"))
                self.scheduler.add_job(
                    self._scheduled_run,
                    CronTrigger(hour=hour, minute=minute),
                    args=[keywords, platforms, tone],
                    id=f"pipeline_{time_str}",
                    name=f"Pipeline run at {time_str}",
                )
                logger.info(f"Scheduled pipeline run at {time_str}")
        else:
            # Use interval-based scheduling
            self.scheduler.add_job(
                self._scheduled_run,
                IntervalTrigger(hours=self.orchestrator.config.schedule_interval_hours),
                args=[keywords, platforms, tone],
                id="pipeline_interval",
                name=f"Pipeline run every {self.orchestrator.config.schedule_interval_hours}h",
            )
        
        self.scheduler.start()
        logger.info("Scheduler started. Press Ctrl+C to stop.")
        
        try:
            # Keep running until interrupted
            while self._running:
                await asyncio.sleep(1)
        except KeyboardInterrupt:
            pass
        finally:
            self.scheduler.shutdown()
            await self.orchestrator.shutdown()
    
    async def _scheduled_run(
        self,
        keywords: Optional[List[str]],
        platforms: Optional[List[Platform]],
        tone: Tone,
    ):
        """Execute a scheduled pipeline run."""
        logger.info(f"Starting scheduled run at {datetime.now()}")
        
        try:
            result = await self.orchestrator.run_pipeline(
                keywords=keywords,
                platforms=platforms,
                tone=tone,
            )
            self._print_summary(result)
        except Exception as e:
            logger.error(f"Scheduled run failed: {e}")
    
    async def _run_interactive(
        self,
        keywords: Optional[List[str]],
        platforms: Optional[List[Platform]],
        tone: Tone,
    ):
        """Run in interactive mode."""
        self._running = True
        
        print("\n=== Social Media Content Orchestrator ===")
        print("Commands: run, queue, history, approve <id>, reject <id>, quit\n")
        
        while self._running:
            try:
                cmd = await asyncio.get_event_loop().run_in_executor(
                    None, lambda: input("orchestrator> ").strip().lower()
                )
                
                if cmd == "run":
                    result = await self.orchestrator.run_pipeline(
                        keywords=keywords,
                        platforms=platforms,
                        tone=tone,
                    )
                    self._print_summary(result)
                
                elif cmd == "queue":
                    await self._show_approval_queue()
                
                elif cmd == "history":
                    self._show_history()
                
                elif cmd.startswith("approve "):
                    post_id = cmd.split(" ", 1)[1]
                    await self.orchestrator.approve_post(post_id, approved=True)
                    print(f"Post {post_id} approved and published")
                
                elif cmd.startswith("reject "):
                    post_id = cmd.split(" ", 1)[1]
                    await self.orchestrator.approve_post(post_id, approved=False)
                    print(f"Post {post_id} rejected")
                
                elif cmd in ("quit", "exit", "q"):
                    self._running = False
                    await self.orchestrator.shutdown()
                
                else:
                    print("Unknown command. Try: run, queue, history, approve <id>, reject <id>, quit")
                    
            except KeyboardInterrupt:
                self._running = False
                await self.orchestrator.shutdown()
            except EOFError:
                self._running = False
    
    async def _show_approval_queue(self):
        """Display the content approval queue."""
        queue = self.orchestrator.get_approval_queue()
        
        if not queue:
            print("\nNo posts pending approval.\n")
            return
        
        print(f"\n=== Approval Queue ({len(queue)} pending) ===\n")
        
        for item in queue:
            print(f"Post ID: {item.post_id}")
            print(f"Platform: {item.post.platform.value}")
            print(f"Content: {item.post.content[:100]}...")
            print(f"Submitted: {item.submitted_at}")
            if item.images:
                print(f"Images: {len(item.images.images)}")
            print("-" * 40)
        
        print()
    
    def _show_history(self):
        """Display pipeline run history."""
        history = self.orchestrator.get_pipeline_history()
        
        if not history:
            print("\nNo pipeline history found.\n")
            return
        
        print("\n=== Pipeline History ===\n")
        
        for run in history:
            print(f"ID: {run['id'][:8]}...")
            print(f"Status: {run['status']}")
            print(f"Started: {run['started_at']}")
            print(f"Completed: {run['completed_at']}")
            print(f"News: {run['news_count']}, Posts: {run['posts_count']}, Published: {run['publish_count']}")
            if run['errors']:
                print(f"Errors: {len(run['errors'])}")
            print("-" * 40)
        
        print()
    
    def _print_summary(self, result):
        """Print pipeline execution summary."""
        print("\n=== Pipeline Summary ===\n")
        print(f"Pipeline ID: {result.pipeline_id}")
        print(f"Dry Run: {result.dry_run}")
        print(f"Started: {result.started_at}")
        print(f"Completed: {result.completed_at}")
        print(f"\nAgent Status:")
        for agent, status in result.agent_statuses.items():
            status_str = status.value if hasattr(status, 'value') else status
            print(f"  {agent}: {status_str}")
        print(f"\nResults:")
        print(f"  News Items: {len(result.news_items)}")
        print(f"  Posts Generated: {len(result.posts)}")
        print(f"  Image Sets: {len(result.image_sets)}")
        print(f"  Published: {len(result.publish_results)}")
        
        if result.error_log:
            print(f"\nErrors ({len(result.error_log)}):")
            for error in result.error_log[:5]:
                print(f"  - {error}")
        
        print()


def main():
    """CLI entry point."""
    parser = argparse.ArgumentParser(
        description="Social Media Content Orchestrator",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Run once in dry-run mode
  python -m orchestrator --dry-run
  
  # Run with specific keywords
  python -m orchestrator --keywords "AI" "technology" "startups"
  
  # Run with scheduler
  python -m orchestrator --schedule
  
  # Show approval queue
  python -m orchestrator --show-queue
  
  # Approve a post
  python -m orchestrator --approve-post abc123
        """
    )
    
    parser.add_argument(
        "--config",
        type=Path,
        help="Path to configuration file",
    )
    
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Run without actually posting to social media",
    )
    
    parser.add_argument(
        "--keywords",
        nargs="+",
        help="Keywords to filter news content",
    )
    
    parser.add_argument(
        "--platforms",
        nargs="+",
        choices=["twitter", "linkedin", "instagram", "facebook", "tiktok"],
        help="Target platforms for posting",
    )
    
    parser.add_argument(
        "--tone",
        choices=["casual", "professional", "playful", "inspirational", "informative"],
        default="professional",
        help="Content tone (default: professional)",
    )
    
    parser.add_argument(
        "--schedule",
        action="store_true",
        help="Run with scheduler at optimal posting times",
    )
    
    parser.add_argument(
        "--interactive",
        action="store_true",
        help="Run in interactive mode",
    )
    
    parser.add_argument(
        "--approval-mode",
        action="store_true",
        help="Queue posts for approval before publishing",
    )
    
    parser.add_argument(
        "--show-queue",
        action="store_true",
        help="Show pending approvals",
    )
    
    parser.add_argument(
        "--approve-post",
        type=str,
        help="Approve a post by ID",
    )
    
    parser.add_argument(
        "--reject-post",
        type=str,
        help="Reject a post by ID",
    )
    
    parser.add_argument(
        "--history",
        action="store_true",
        help="Show pipeline run history",
    )
    
    args = parser.parse_args()
    
    # Determine run mode
    once = not args.schedule and not args.interactive
    
    # Run the application
    app = OrchestratorApp()
    
    try:
        asyncio.run(app.run(
            config_file=args.config,
            dry_run=args.dry_run,
            keywords=args.keywords,
            platforms=args.platforms,
            tone=args.tone,
            schedule=args.schedule,
            once=once,
            approval_mode=args.approval_mode,
            show_queue=args.show_queue,
            approve_post=args.approve_post,
            reject_post=args.reject_post,
            history=args.history,
        ))
    except KeyboardInterrupt:
        print("\nShutting down...")
        sys.exit(0)


if __name__ == "__main__":
    main()
