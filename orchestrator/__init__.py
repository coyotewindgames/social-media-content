"""
Social Media Content Orchestrator

A production-ready system for automated social media content generation
and publishing using specialized AI agents.

Components:
- NewsAgent: Fetches trending news from multiple sources
- ContentAgent: Generates platform-optimized posts using LLMs
- ImageAgent: Creates images using AI image generation
- PublishAgent: Posts content to social media platforms

Usage:
    from orchestrator import Orchestrator
    from orchestrator.config import Config
    
    orchestrator = Orchestrator()
    result = await orchestrator.run_pipeline(dry_run=True)
"""

from .orchestrator import Orchestrator
from .config import Config, load_config
from .agents import NewsAgent, ContentAgent, ImageAgent, PublishAgent
from .models import (
    NewsItem,
    SocialPost,
    GeneratedImage,
    ImageSet,
    PublishResult,
    Platform,
    Tone,
    PipelineState,
)

__version__ = "1.0.0"
__author__ = "Social Media Orchestrator Team"

__all__ = [
    "Orchestrator",
    "Config",
    "load_config",
    "NewsAgent",
    "ContentAgent",
    "ImageAgent",
    "PublishAgent",
    "NewsItem",
    "SocialPost",
    "GeneratedImage",
    "ImageSet",
    "PublishResult",
    "Platform",
    "Tone",
    "PipelineState",
]
