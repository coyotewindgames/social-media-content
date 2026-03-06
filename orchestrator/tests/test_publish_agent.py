"""Unit tests for the Publishing Agent."""

import uuid
from datetime import datetime
from unittest.mock import AsyncMock, patch, MagicMock

import pytest

from ..agents.publish_agent import PublishAgent
from ..config import Config
from ..models import SocialPost, ImageSet, GeneratedImage, ImageDimensions, PublishResult, PublishStatus, Platform, Tone


@pytest.fixture
def config():
    """Create a test configuration."""
    return Config(
        twitter_access_token="test_twitter_token",
        linkedin_access_token="test_linkedin_token",
        instagram_access_token="test_instagram_token",
        instagram_business_id="test_instagram_id",
        facebook_access_token="test_facebook_token",
        facebook_page_id="test_page_id",
    )


@pytest.fixture
def publish_agent(config):
    """Create a PublishAgent instance for testing."""
    return PublishAgent(config)


@pytest.fixture
def sample_post():
    """Create a sample social post for testing."""
    return SocialPost(
        post_id=str(uuid.uuid4()),
        content="Test post content #testing",
        platform=Platform.TWITTER,
        hashtags=["testing"],
        tone=Tone.PROFESSIONAL,
    )


@pytest.fixture
def sample_image_set(sample_post):
    """Create a sample image set for testing."""
    return ImageSet(
        post_id=sample_post.post_id,
        images=[
            GeneratedImage(
                url="https://example.com/image.jpg",
                format="jpeg",
                dimensions=ImageDimensions(width=1200, height=675),
            )
        ],
    )


class TestPublishAgent:
    """Tests for PublishAgent."""
    
    def test_simulate_publish(self, publish_agent, sample_post, sample_image_set):
        """Test dry-run simulation."""
        result = publish_agent._simulate_publish(sample_post, sample_image_set)
        
        assert isinstance(result, PublishResult)
        assert result.post_id == sample_post.post_id
        assert result.platform == sample_post.platform
        assert result.status == PublishStatus.PUBLISHED
        assert "dry-run" in str(result.post_url)
    
    def test_simulate_publish_without_images(self, publish_agent, sample_post):
        """Test dry-run simulation without images."""
        result = publish_agent._simulate_publish(sample_post, None)
        
        assert result.status == PublishStatus.PUBLISHED
    
    @pytest.mark.asyncio
    async def test_execute_dry_run(self, publish_agent, sample_post, sample_image_set):
        """Test execute in dry-run mode."""
        results = await publish_agent.execute(
            posts=[sample_post],
            image_sets=[sample_image_set],
            dry_run=True,
        )
        
        assert len(results) == 1
        assert results[0].status == PublishStatus.PUBLISHED
    
    @pytest.mark.asyncio
    async def test_execute_multiple_posts_dry_run(self, publish_agent):
        """Test executing multiple posts in dry-run mode."""
        posts = [
            SocialPost(
                post_id=str(uuid.uuid4()),
                content=f"Test post {i}",
                platform=Platform.TWITTER,
                hashtags=[],
                tone=Tone.PROFESSIONAL,
            )
            for i in range(3)
        ]
        
        results = await publish_agent.execute(
            posts=posts,
            image_sets=[],
            dry_run=True,
        )
        
        assert len(results) == 3
        assert all(r.status == PublishStatus.PUBLISHED for r in results)
    
    @pytest.mark.asyncio
    async def test_publish_fails_without_credentials(self):
        """Test that publishing fails gracefully without credentials."""
        config = Config()  # No credentials
        agent = PublishAgent(config)
        
        post = SocialPost(
            post_id=str(uuid.uuid4()),
            content="Test post",
            platform=Platform.TWITTER,
            hashtags=[],
            tone=Tone.PROFESSIONAL,
        )
        
        result = await agent._publish_twitter(post, None)
        
        assert result.status == PublishStatus.FAILED
        assert "not configured" in result.error_message
    
    @pytest.mark.asyncio
    async def test_instagram_requires_image(self, publish_agent):
        """Test that Instagram fails without images."""
        post = SocialPost(
            post_id=str(uuid.uuid4()),
            content="Instagram test",
            platform=Platform.INSTAGRAM,
            hashtags=[],
            tone=Tone.PROFESSIONAL,
        )
        
        result = await publish_agent._publish_instagram(post, None)
        
        assert result.status == PublishStatus.FAILED
        assert "requires an image" in result.error_message
    
    @pytest.mark.asyncio
    async def test_tiktok_pending_review(self, publish_agent, sample_post):
        """Test TikTok posts go to pending review (API limitations)."""
        post = SocialPost(
            post_id=str(uuid.uuid4()),
            content="TikTok test",
            platform=Platform.TIKTOK,
            hashtags=[],
            tone=Tone.PLAYFUL,
        )
        
        result = await publish_agent._publish_tiktok(post, None)
        
        assert result.status == PublishStatus.PENDING_REVIEW
    
    def test_manual_review_queue(self, publish_agent):
        """Test manual review queue management."""
        assert publish_agent.get_manual_review_queue() == []
        
        # Add to queue (internally)
        result = PublishResult(
            post_id="test123",
            platform=Platform.TWITTER,
            status=PublishStatus.PENDING_REVIEW,
            error_message="Test error",
        )
        publish_agent._manual_review_queue.append(result)
        
        queue = publish_agent.get_manual_review_queue()
        assert len(queue) == 1
        
        # Clear queue
        publish_agent.clear_manual_review_queue()
        assert publish_agent.get_manual_review_queue() == []


class TestPublishingPlatforms:
    """Test platform-specific publishing logic."""
    
    @pytest.mark.asyncio
    async def test_twitter_rate_limiting(self, publish_agent, sample_post):
        """Test Twitter rate limiting."""
        # Mock rate limiter to deny
        publish_agent.rate_limiter.acquire = AsyncMock(return_value=False)
        
        result = await publish_agent._publish_twitter(sample_post, None)
        
        assert result.status == PublishStatus.FAILED
        assert "rate limited" in result.error_message.lower()
    
    @pytest.mark.asyncio
    async def test_linkedin_rate_limiting(self):
        """Test LinkedIn rate limiting."""
        config = Config(linkedin_access_token="test_token")
        agent = PublishAgent(config)
        agent.rate_limiter.acquire = AsyncMock(return_value=False)
        
        post = SocialPost(
            post_id=str(uuid.uuid4()),
            content="LinkedIn test",
            platform=Platform.LINKEDIN,
            hashtags=[],
            tone=Tone.PROFESSIONAL,
        )
        
        result = await agent._publish_linkedin(post, None)
        
        assert result.status == PublishStatus.FAILED
        assert "rate limited" in result.error_message.lower()


class TestRetryLogic:
    """Test retry logic for failed posts."""
    
    @pytest.mark.asyncio
    async def test_max_retries(self, publish_agent):
        """Test that max retries are respected."""
        post = SocialPost(
            post_id=str(uuid.uuid4()),
            content="Test",
            platform=Platform.TWITTER,
            hashtags=[],
            tone=Tone.PROFESSIONAL,
        )
        
        # Mock handler to always fail
        async def failing_handler(p, i):
            raise Exception("Always fails")
        
        publish_agent._publish_twitter = failing_handler
        
        result = await publish_agent._publish_post(post, None)
        
        # Should be queued for manual review after max retries
        assert result.status == PublishStatus.PENDING_REVIEW
        assert result.retry_count == publish_agent._max_retries


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
