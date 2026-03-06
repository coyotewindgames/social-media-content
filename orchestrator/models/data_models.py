"""Pydantic data models for validation between agents."""

from datetime import datetime
from enum import Enum
from typing import Optional, List
from pydantic import BaseModel, Field, HttpUrl


class Platform(str, Enum):
    """Supported social media platforms."""
    TWITTER = "twitter"
    LINKEDIN = "linkedin"
    INSTAGRAM = "instagram"
    FACEBOOK = "facebook"
    TIKTOK = "tiktok"


class Tone(str, Enum):
    """Content tone options."""
    CASUAL = "casual"
    PROFESSIONAL = "professional"
    PLAYFUL = "playful"
    INSPIRATIONAL = "inspirational"
    INFORMATIVE = "informative"


class AgentStatus(str, Enum):
    """Agent execution status."""
    PENDING = "pending"
    RUNNING = "running"
    SUCCESS = "success"
    FAILED = "failed"
    RETRYING = "retrying"


class NewsItem(BaseModel):
    """Structured data from news retrieval agent."""
    topic: str = Field(..., description="Main topic or headline")
    source: str = Field(..., description="News source (e.g., NewsAPI, Reddit, Twitter)")
    url: HttpUrl = Field(..., description="Original source URL")
    summary: str = Field(..., description="Brief summary of the news item")
    keywords: List[str] = Field(default_factory=list, description="Relevant keywords")
    timestamp: datetime = Field(default_factory=datetime.utcnow, description="When the news was retrieved")
    relevance_score: float = Field(default=0.0, ge=0.0, le=1.0, description="Relevance score (0-1)")
    
    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }


class SocialPost(BaseModel):
    """Generated social media post content."""
    post_id: str = Field(..., description="Unique identifier for the post")
    content: str = Field(..., description="The actual post content")
    platform: Platform = Field(..., description="Target platform")
    hashtags: List[str] = Field(default_factory=list, description="Platform-appropriate hashtags")
    image_prompt: Optional[str] = Field(None, description="Prompt for image generation")
    tone: Tone = Field(default=Tone.PROFESSIONAL, description="Content tone")
    call_to_action: Optional[str] = Field(None, description="CTA text")
    character_count: int = Field(default=0, description="Character count for validation")
    news_source: Optional[str] = Field(None, description="Original news source reference")
    created_at: datetime = Field(default_factory=datetime.utcnow)
    
    def __init__(self, **data):
        super().__init__(**data)
        # Auto-calculate character count
        object.__setattr__(self, 'character_count', len(self.content))
    
    def validate_length(self) -> bool:
        """
        Validate post length against platform limits.
        
        Note: These are the maximum technical limits. For optimal engagement,
        shorter posts are recommended (e.g., Twitter: 280 max but 100-150 optimal,
        Facebook: 63,206 max but 40-80 optimal for engagement).
        """
        limits = {
            Platform.TWITTER: 280,
            Platform.LINKEDIN: 3000,
            Platform.INSTAGRAM: 2200,
            Platform.FACEBOOK: 63206,  # Facebook's actual technical limit
            Platform.TIKTOK: 2200,
        }
        return len(self.content) <= limits.get(self.platform, 280)
    
    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }


class ImageDimensions(BaseModel):
    """Image dimension specifications."""
    width: int = Field(..., gt=0)
    height: int = Field(..., gt=0)


class GeneratedImage(BaseModel):
    """Generated image data from image agent."""
    url: HttpUrl = Field(..., description="URL to the generated image")
    format: str = Field(default="png", description="Image format (png, jpg, webp)")
    dimensions: ImageDimensions = Field(..., description="Image dimensions")
    alt_text: Optional[str] = Field(None, description="Alt text for accessibility")


class ImageSet(BaseModel):
    """Collection of images for a post."""
    post_id: str = Field(..., description="Associated post ID")
    images: List[GeneratedImage] = Field(default_factory=list, max_length=3)
    created_at: datetime = Field(default_factory=datetime.utcnow)


class PublishStatus(str, Enum):
    """Publishing status options."""
    QUEUED = "queued"
    PUBLISHED = "published"
    FAILED = "failed"
    PENDING_REVIEW = "pending_review"
    SCHEDULED = "scheduled"


class PublishResult(BaseModel):
    """Result from publishing agent."""
    post_id: str = Field(..., description="Internal post ID")
    platform: Platform = Field(..., description="Platform published to")
    status: PublishStatus = Field(..., description="Publishing status")
    post_url: Optional[HttpUrl] = Field(None, description="URL of published post")
    error_message: Optional[str] = Field(None, description="Error message if failed")
    retry_count: int = Field(default=0, description="Number of retry attempts")
    published_at: Optional[datetime] = Field(None, description="When successfully published")
    
    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat() if v else None
        }


class PipelineState(BaseModel):
    """Overall pipeline execution state."""
    pipeline_id: str = Field(..., description="Unique pipeline run ID")
    started_at: datetime = Field(default_factory=datetime.utcnow)
    completed_at: Optional[datetime] = Field(None)
    news_items: List[NewsItem] = Field(default_factory=list)
    posts: List[SocialPost] = Field(default_factory=list)
    image_sets: List[ImageSet] = Field(default_factory=list)
    publish_results: List[PublishResult] = Field(default_factory=list)
    current_agent: Optional[str] = Field(None, description="Currently executing agent")
    agent_statuses: dict = Field(default_factory=dict)
    error_log: List[str] = Field(default_factory=list)
    dry_run: bool = Field(default=False, description="Whether this is a dry run")
    
    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat() if v else None
        }


class ContentApproval(BaseModel):
    """Content approval queue item."""
    post_id: str
    post: SocialPost
    images: Optional[ImageSet] = None
    approval_status: str = Field(default="pending")  # pending, approved, rejected
    reviewer_notes: Optional[str] = None
    submitted_at: datetime = Field(default_factory=datetime.utcnow)
    reviewed_at: Optional[datetime] = None
