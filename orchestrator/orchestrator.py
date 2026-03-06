"""Core Orchestrator class that manages agent lifecycle and data flow."""

import asyncio
import signal
import sys
import uuid
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional

from sqlalchemy import create_engine, Column, String, Text, DateTime, Boolean, JSON
from sqlalchemy.orm import sessionmaker, declarative_base
from sqlalchemy.pool import StaticPool

from .agents import NewsAgent, ContentAgent, ImageAgent, PublishAgent
from .models import (
    NewsItem,
    SocialPost,
    ImageSet,
    PublishResult,
    PipelineState,
    AgentStatus,
    Platform,
    Tone,
    ContentApproval,
)
from .config import Config, load_config
from .utils import get_logger, setup_logging, RateLimiter

logger = get_logger(__name__)

# SQLAlchemy setup
Base = declarative_base()


class PipelineRun(Base):
    """SQLAlchemy model for storing pipeline state."""
    
    __tablename__ = "pipeline_runs"
    
    id = Column(String(36), primary_key=True)
    started_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)
    status = Column(String(20), default="running")
    dry_run = Column(Boolean, default=False)
    news_items = Column(JSON, default=list)
    posts = Column(JSON, default=list)
    image_sets = Column(JSON, default=list)
    publish_results = Column(JSON, default=list)
    error_log = Column(JSON, default=list)
    agent_statuses = Column(JSON, default=dict)


class ApprovalQueue(Base):
    """SQLAlchemy model for content approval queue."""
    
    __tablename__ = "approval_queue"
    
    id = Column(String(36), primary_key=True)
    post_id = Column(String(36), unique=True)
    post_data = Column(JSON)
    images_data = Column(JSON, nullable=True)
    status = Column(String(20), default="pending")
    reviewer_notes = Column(Text, nullable=True)
    submitted_at = Column(DateTime, default=datetime.utcnow)
    reviewed_at = Column(DateTime, nullable=True)


class Analytics(Base):
    """SQLAlchemy model for tracking post performance."""
    
    __tablename__ = "analytics"
    
    id = Column(String(36), primary_key=True)
    post_id = Column(String(36))
    platform = Column(String(20))
    post_url = Column(String(500), nullable=True)
    published_at = Column(DateTime)
    impressions = Column(JSON, default=dict)
    engagement = Column(JSON, default=dict)
    last_updated = Column(DateTime, default=datetime.utcnow)


class Orchestrator:
    """
    Core orchestrator that manages the social media content pipeline.
    
    Coordinates four specialized agents:
    1. NewsAgent - Fetches trending news and topics
    2. ContentAgent - Generates social media posts using LLMs
    3. ImageAgent - Creates images for posts
    4. PublishAgent - Posts content to social platforms
    
    Features:
    - Async/await for parallel operations
    - SQLite database for state persistence
    - Comprehensive logging with rotation
    - Graceful error handling with retry logic
    - Dry-run mode for testing
    - Content approval queue
    """
    
    def __init__(
        self,
        config: Optional[Config] = None,
        config_file: Optional[Path] = None,
    ):
        """
        Initialize the orchestrator.
        
        Args:
            config: Configuration object (optional)
            config_file: Path to config file (optional)
        """
        self.config = config or load_config(config_file)
        
        # Setup logging
        setup_logging(
            log_dir=Path(self.config.log_dir),
            log_level=self.config.log_level,
        )
        
        # Validate configuration
        warnings = self.config.validate()
        for warning in warnings:
            logger.warning(warning)
        
        # Initialize database
        self._init_database()
        
        # Shared rate limiter for all agents
        self.rate_limiter = RateLimiter(
            calls_per_minute=30,
            calls_per_day=1000,
        )
        
        # Initialize agents
        self.news_agent = NewsAgent(self.config, self.rate_limiter)
        self.content_agent = ContentAgent(self.config, self.rate_limiter)
        self.image_agent = ImageAgent(self.config, self.rate_limiter)
        self.publish_agent = PublishAgent(self.config, self.rate_limiter)
        
        # State tracking
        self._current_pipeline: Optional[PipelineState] = None
        self._shutdown_requested = False
        
        # Setup signal handlers for graceful shutdown
        self._setup_signal_handlers()
        
        logger.info("Orchestrator initialized")
    
    def _init_database(self):
        """Initialize SQLite database for state persistence."""
        db_url = self.config.database_url
        
        # Use in-memory with special settings for SQLite
        if "sqlite" in db_url:
            self.engine = create_engine(
                db_url,
                connect_args={"check_same_thread": False},
                poolclass=StaticPool,
            )
        else:
            self.engine = create_engine(db_url)
        
        Base.metadata.create_all(self.engine)
        self.Session = sessionmaker(bind=self.engine)
        
        logger.info(f"Database initialized: {db_url}")
    
    def _setup_signal_handlers(self):
        """Setup handlers for graceful shutdown."""
        def signal_handler(signum, frame):
            logger.info(f"Received signal {signum}, initiating graceful shutdown...")
            self._shutdown_requested = True
        
        # Only set handlers in main thread
        try:
            signal.signal(signal.SIGINT, signal_handler)
            signal.signal(signal.SIGTERM, signal_handler)
        except ValueError:
            # Not in main thread
            pass
    
    async def run_pipeline(
        self,
        keywords: Optional[List[str]] = None,
        platforms: Optional[List[Platform]] = None,
        tone: Tone = Tone.PROFESSIONAL,
        dry_run: Optional[bool] = None,
        require_approval: Optional[bool] = None,
    ) -> PipelineState:
        """
        Run the complete content pipeline.
        
        Args:
            keywords: Optional keywords to filter news
            platforms: Target platforms (default: from config)
            tone: Content tone
            dry_run: Whether to simulate publishing (default: from config)
            require_approval: Whether to queue for approval (default: from config)
            
        Returns:
            PipelineState with all results
        """
        # Use config defaults if not specified
        dry_run = dry_run if dry_run is not None else self.config.dry_run_mode
        require_approval = require_approval if require_approval is not None else self.config.require_approval
        
        if not platforms:
            platforms = [Platform(p) for p in self.config.enabled_platforms]
        
        # Initialize pipeline state
        pipeline_id = str(uuid.uuid4())
        self._current_pipeline = PipelineState(
            pipeline_id=pipeline_id,
            dry_run=dry_run,
        )
        
        logger.info(f"Starting pipeline {pipeline_id} (dry_run={dry_run})")
        
        # Save initial state to database
        self._save_pipeline_state()
        
        try:
            # Agent #1: News Retrieval
            await self._run_news_agent(keywords)
            
            if self._shutdown_requested:
                return self._finalize_pipeline("interrupted")
            
            if not self._current_pipeline.news_items:
                logger.warning("No news items found, aborting pipeline")
                return self._finalize_pipeline("no_content")
            
            # Agent #2: Content Generation
            await self._run_content_agent(platforms, tone)
            
            if self._shutdown_requested:
                return self._finalize_pipeline("interrupted")
            
            if not self._current_pipeline.posts:
                logger.warning("No posts generated, aborting pipeline")
                return self._finalize_pipeline("no_content")
            
            # Agent #3: Image Generation
            await self._run_image_agent()
            
            if self._shutdown_requested:
                return self._finalize_pipeline("interrupted")
            
            # Check if approval is required
            if require_approval:
                await self._queue_for_approval()
                return self._finalize_pipeline("pending_approval")
            
            # Agent #4: Publishing
            await self._run_publish_agent(dry_run)
            
            return self._finalize_pipeline("success")
            
        except Exception as e:
            logger.error(f"Pipeline failed: {e}")
            self._current_pipeline.error_log.append(str(e))
            return self._finalize_pipeline("failed")
    
    async def _run_news_agent(self, keywords: Optional[List[str]]):
        """Run the news retrieval agent."""
        self._current_pipeline.current_agent = "news_agent"
        self._current_pipeline.agent_statuses["news_agent"] = AgentStatus.RUNNING
        self._save_pipeline_state()
        
        try:
            news_items = await self.news_agent.run(keywords=keywords)
            self._current_pipeline.news_items = news_items
            self._current_pipeline.agent_statuses["news_agent"] = AgentStatus.SUCCESS
            logger.info(f"News agent completed: {len(news_items)} items")
        except Exception as e:
            logger.error(f"News agent failed: {e}")
            self._current_pipeline.agent_statuses["news_agent"] = AgentStatus.FAILED
            self._current_pipeline.error_log.append(f"News agent: {e}")
            
            # Retry after delay
            logger.info("Retrying news agent after 30s delay...")
            await asyncio.sleep(30)
            
            try:
                news_items = await self.news_agent.run(keywords=keywords)
                self._current_pipeline.news_items = news_items
                self._current_pipeline.agent_statuses["news_agent"] = AgentStatus.SUCCESS
            except Exception as retry_error:
                logger.error(f"News agent retry failed: {retry_error}")
                raise
        
        self._save_pipeline_state()
    
    async def _run_content_agent(
        self,
        platforms: List[Platform],
        tone: Tone,
    ):
        """Run the content generation agent."""
        self._current_pipeline.current_agent = "content_agent"
        self._current_pipeline.agent_statuses["content_agent"] = AgentStatus.RUNNING
        self._save_pipeline_state()
        
        try:
            posts = await self.content_agent.run(
                news_items=self._current_pipeline.news_items,
                platforms=platforms,
                tone=tone,
                posts_per_item=self.config.posts_per_news_item,
            )
            
            # Limit to max posts
            posts = posts[:self.config.max_posts_per_run]
            self._current_pipeline.posts = posts
            self._current_pipeline.agent_statuses["content_agent"] = AgentStatus.SUCCESS
            logger.info(f"Content agent completed: {len(posts)} posts")
        except Exception as e:
            logger.error(f"Content agent failed: {e}")
            self._current_pipeline.agent_statuses["content_agent"] = AgentStatus.FAILED
            self._current_pipeline.error_log.append(f"Content agent: {e}")
            
            # Fallback to template-based posts
            logger.info("Falling back to template-based posts...")
            posts = []
            for news_item in self._current_pipeline.news_items[:5]:
                for platform in platforms:
                    post = self.content_agent._generate_template_post(
                        news_item, platform, tone
                    )
                    posts.append(post)
            
            self._current_pipeline.posts = posts[:self.config.max_posts_per_run]
        
        self._save_pipeline_state()
    
    async def _run_image_agent(self):
        """Run the image generation agent."""
        self._current_pipeline.current_agent = "image_agent"
        self._current_pipeline.agent_statuses["image_agent"] = AgentStatus.RUNNING
        self._save_pipeline_state()
        
        try:
            image_sets = await self.image_agent.run(
                posts=self._current_pipeline.posts,
                images_per_post=self.config.images_per_post,
            )
            self._current_pipeline.image_sets = image_sets
            self._current_pipeline.agent_statuses["image_agent"] = AgentStatus.SUCCESS
            logger.info(f"Image agent completed: {len(image_sets)} image sets")
        except Exception as e:
            logger.error(f"Image agent failed: {e}")
            self._current_pipeline.agent_statuses["image_agent"] = AgentStatus.FAILED
            self._current_pipeline.error_log.append(f"Image agent: {e}")
            
            # Fallback to stock images
            logger.info("Using stock images as fallback...")
            image_sets = []
            for post in self._current_pipeline.posts:
                image_set = self.image_agent._get_fallback_images(post)
                image_sets.append(image_set)
            
            self._current_pipeline.image_sets = image_sets
        
        self._save_pipeline_state()
    
    async def _run_publish_agent(self, dry_run: bool):
        """Run the publishing agent."""
        self._current_pipeline.current_agent = "publish_agent"
        self._current_pipeline.agent_statuses["publish_agent"] = AgentStatus.RUNNING
        self._save_pipeline_state()
        
        try:
            results = await self.publish_agent.run(
                posts=self._current_pipeline.posts,
                image_sets=self._current_pipeline.image_sets,
                dry_run=dry_run,
            )
            self._current_pipeline.publish_results = results
            self._current_pipeline.agent_statuses["publish_agent"] = AgentStatus.SUCCESS
            logger.info(f"Publish agent completed: {len(results)} results")
            
            # Track analytics
            if self.config.enable_analytics:
                await self._track_analytics(results)
                
        except Exception as e:
            logger.error(f"Publish agent failed: {e}")
            self._current_pipeline.agent_statuses["publish_agent"] = AgentStatus.FAILED
            self._current_pipeline.error_log.append(f"Publish agent: {e}")
            
            # Queue failed posts for manual review
            logger.info("Queuing posts for manual review...")
            for post in self._current_pipeline.posts:
                images = next(
                    (img for img in self._current_pipeline.image_sets 
                     if img.post_id == post.post_id),
                    None
                )
                await self._add_to_approval_queue(post, images)
        
        self._save_pipeline_state()
    
    async def _queue_for_approval(self):
        """Queue all posts for approval before publishing."""
        logger.info("Queuing posts for approval...")
        
        for post in self._current_pipeline.posts:
            images = next(
                (img for img in self._current_pipeline.image_sets 
                 if img.post_id == post.post_id),
                None
            )
            await self._add_to_approval_queue(post, images)
    
    async def _add_to_approval_queue(
        self,
        post: SocialPost,
        images: Optional[ImageSet],
    ):
        """Add a post to the approval queue."""
        session = self.Session()
        try:
            approval = ApprovalQueue(
                id=str(uuid.uuid4()),
                post_id=post.post_id,
                post_data=post.model_dump(),
                images_data=images.model_dump() if images else None,
            )
            session.add(approval)
            session.commit()
        finally:
            session.close()
    
    async def _track_analytics(self, results: List[PublishResult]):
        """Track published posts for analytics."""
        session = self.Session()
        try:
            for result in results:
                if result.status.value == "published":
                    analytics = Analytics(
                        id=str(uuid.uuid4()),
                        post_id=result.post_id,
                        platform=result.platform.value,
                        post_url=str(result.post_url) if result.post_url else None,
                        published_at=result.published_at or datetime.utcnow(),
                    )
                    session.add(analytics)
            session.commit()
        finally:
            session.close()
    
    def _save_pipeline_state(self):
        """Save current pipeline state to database."""
        if not self._current_pipeline:
            return
        
        session = self.Session()
        try:
            # Convert models to JSON-serializable format
            run = session.query(PipelineRun).get(self._current_pipeline.pipeline_id)
            
            if not run:
                run = PipelineRun(id=self._current_pipeline.pipeline_id)
                session.add(run)
            
            run.started_at = self._current_pipeline.started_at
            run.completed_at = self._current_pipeline.completed_at
            run.dry_run = self._current_pipeline.dry_run
            run.news_items = [item.model_dump() for item in self._current_pipeline.news_items]
            run.posts = [post.model_dump() for post in self._current_pipeline.posts]
            run.image_sets = [img.model_dump() for img in self._current_pipeline.image_sets]
            run.publish_results = [res.model_dump() for res in self._current_pipeline.publish_results]
            run.error_log = self._current_pipeline.error_log
            run.agent_statuses = {
                k: v.value if isinstance(v, AgentStatus) else v 
                for k, v in self._current_pipeline.agent_statuses.items()
            }
            
            session.commit()
        finally:
            session.close()
    
    def _finalize_pipeline(self, status: str) -> PipelineState:
        """Finalize the pipeline with the given status."""
        self._current_pipeline.completed_at = datetime.utcnow()
        self._current_pipeline.current_agent = None
        
        # Update status in database
        session = self.Session()
        try:
            run = session.query(PipelineRun).get(self._current_pipeline.pipeline_id)
            if run:
                run.status = status
                run.completed_at = self._current_pipeline.completed_at
                session.commit()
        finally:
            session.close()
        
        logger.info(f"Pipeline {self._current_pipeline.pipeline_id} completed: {status}")
        
        return self._current_pipeline
    
    async def approve_post(self, post_id: str, approved: bool, notes: Optional[str] = None):
        """
        Approve or reject a post in the approval queue.
        
        Args:
            post_id: ID of the post to review
            approved: Whether to approve the post
            notes: Optional reviewer notes
        """
        session = self.Session()
        try:
            approval = session.query(ApprovalQueue).filter_by(post_id=post_id).first()
            
            if not approval:
                raise ValueError(f"Post {post_id} not found in approval queue")
            
            approval.status = "approved" if approved else "rejected"
            approval.reviewer_notes = notes
            approval.reviewed_at = datetime.utcnow()
            
            session.commit()
            
            if approved:
                # Publish the approved post
                post = SocialPost(**approval.post_data)
                images = ImageSet(**approval.images_data) if approval.images_data else None
                
                result = await self.publish_agent._publish_post(post, images)
                logger.info(f"Published approved post {post_id}: {result.status}")
                
        finally:
            session.close()
    
    def get_approval_queue(self) -> List[ContentApproval]:
        """Get all pending posts in the approval queue."""
        session = self.Session()
        try:
            items = session.query(ApprovalQueue).filter_by(status="pending").all()
            
            return [
                ContentApproval(
                    post_id=item.post_id,
                    post=SocialPost(**item.post_data),
                    images=ImageSet(**item.images_data) if item.images_data else None,
                    approval_status=item.status,
                    reviewer_notes=item.reviewer_notes,
                    submitted_at=item.submitted_at,
                    reviewed_at=item.reviewed_at,
                )
                for item in items
            ]
        finally:
            session.close()
    
    def get_pipeline_history(self, limit: int = 10) -> List[Dict]:
        """Get recent pipeline run history."""
        session = self.Session()
        try:
            runs = (
                session.query(PipelineRun)
                .order_by(PipelineRun.started_at.desc())
                .limit(limit)
                .all()
            )
            
            return [
                {
                    "id": run.id,
                    "started_at": run.started_at,
                    "completed_at": run.completed_at,
                    "status": run.status,
                    "dry_run": run.dry_run,
                    "news_count": len(run.news_items or []),
                    "posts_count": len(run.posts or []),
                    "publish_count": len(run.publish_results or []),
                    "errors": run.error_log,
                }
                for run in runs
            ]
        finally:
            session.close()
    
    async def shutdown(self):
        """Gracefully shutdown the orchestrator."""
        logger.info("Shutting down orchestrator...")
        self._shutdown_requested = True
        
        # Wait for current pipeline to finish
        if self._current_pipeline and not self._current_pipeline.completed_at:
            logger.info("Waiting for current pipeline to complete...")
            for _ in range(30):  # Wait up to 30 seconds
                if self._current_pipeline.completed_at:
                    break
                await asyncio.sleep(1)
        
        logger.info("Orchestrator shutdown complete")
