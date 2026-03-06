"""Unit tests for the Content Generation Agent."""

import uuid
from datetime import datetime
from unittest.mock import AsyncMock, patch

import pytest

from ..agents.content_agent import ContentAgent, PLATFORM_LIMITS, TEMPLATE_POSTS
from ..config import Config
from ..models import NewsItem, SocialPost, Platform, Tone


@pytest.fixture
def config():
    """Create a test configuration."""
    return Config(
        openai_api_key="test_openai_key",
        anthropic_api_key="test_anthropic_key",
    )


@pytest.fixture
def content_agent(config):
    """Create a ContentAgent instance for testing."""
    return ContentAgent(config)


@pytest.fixture
def sample_news_item():
    """Create a sample news item for testing."""
    return NewsItem(
        topic="AI Advances in Healthcare",
        source="TechNews",
        url="https://example.com/news/1",
        summary="Artificial intelligence is making strides in medical diagnosis.",
        keywords=["AI", "healthcare", "diagnosis", "technology"],
        timestamp=datetime.utcnow(),
        relevance_score=0.9,
    )


class TestContentAgent:
    """Tests for ContentAgent."""
    
    def test_template_post_generation(self, content_agent, sample_news_item):
        """Test template-based post generation."""
        post = content_agent._generate_template_post(
            sample_news_item,
            Platform.TWITTER,
            Tone.PROFESSIONAL,
        )
        
        assert isinstance(post, SocialPost)
        assert post.platform == Platform.TWITTER
        assert post.tone == Tone.PROFESSIONAL
        assert len(post.content) > 0
        assert len(post.hashtags) > 0
        assert post.image_prompt is not None
    
    def test_template_post_different_tones(self, content_agent, sample_news_item):
        """Test that different tones produce different content."""
        casual_post = content_agent._generate_template_post(
            sample_news_item, Platform.TWITTER, Tone.CASUAL
        )
        professional_post = content_agent._generate_template_post(
            sample_news_item, Platform.TWITTER, Tone.PROFESSIONAL
        )
        playful_post = content_agent._generate_template_post(
            sample_news_item, Platform.TWITTER, Tone.PLAYFUL
        )
        
        # Templates should produce different content styles
        assert casual_post.content != professional_post.content
        assert professional_post.content != playful_post.content
    
    def test_platform_limits_exist(self):
        """Test that all platforms have defined limits."""
        for platform in Platform:
            assert platform in PLATFORM_LIMITS
            limits = PLATFORM_LIMITS[platform]
            assert "max_chars" in limits
            assert "max_hashtags" in limits
            assert "image_required" in limits
    
    def test_template_posts_for_all_tones(self):
        """Test that templates exist for all tones."""
        for tone in Tone:
            assert tone in TEMPLATE_POSTS
            assert len(TEMPLATE_POSTS[tone]) > 0
    
    def test_post_validation(self, content_agent, sample_news_item):
        """Test post length validation."""
        post = content_agent._generate_template_post(
            sample_news_item,
            Platform.TWITTER,
            Tone.PROFESSIONAL,
        )
        
        # Twitter posts should be valid (under 280 chars)
        assert post.validate_length()
    
    def test_post_truncation(self, content_agent):
        """Test post truncation for long content."""
        long_post = SocialPost(
            post_id=str(uuid.uuid4()),
            content="A" * 500,  # Too long for Twitter
            platform=Platform.TWITTER,
            hashtags=["test1", "test2", "test3", "test4", "test5"],
            tone=Tone.PROFESSIONAL,
        )
        
        truncated = content_agent._truncate_post(long_post, 280)
        
        assert len(truncated.content) <= 280
        assert truncated.content.endswith("...")
        assert len(truncated.hashtags) <= 3
    
    @pytest.mark.asyncio
    async def test_execute_with_templates_fallback(self, sample_news_item):
        """Test execution falls back to templates when no API keys."""
        config = Config()  # No API keys
        agent = ContentAgent(config)
        
        posts = await agent.execute(
            news_items=[sample_news_item],
            platforms=[Platform.TWITTER],
            tone=Tone.PROFESSIONAL,
            posts_per_item=1,
        )
        
        assert len(posts) == 1
        assert posts[0].platform == Platform.TWITTER
    
    @pytest.mark.asyncio
    async def test_execute_multiple_platforms(self, sample_news_item):
        """Test generating posts for multiple platforms."""
        config = Config()  # No API keys, will use templates
        agent = ContentAgent(config)
        
        platforms = [Platform.TWITTER, Platform.LINKEDIN]
        
        posts = await agent.execute(
            news_items=[sample_news_item],
            platforms=platforms,
            tone=Tone.PROFESSIONAL,
            posts_per_item=1,
        )
        
        assert len(posts) == len(platforms)
        assert {p.platform for p in posts} == set(platforms)


class TestPlatformConstraints:
    """Test platform-specific constraints."""
    
    def test_twitter_char_limit(self):
        """Test Twitter character limit is 280."""
        assert PLATFORM_LIMITS[Platform.TWITTER]["max_chars"] == 280
    
    def test_linkedin_char_limit(self):
        """Test LinkedIn character limit is 3000."""
        assert PLATFORM_LIMITS[Platform.LINKEDIN]["max_chars"] == 3000
    
    def test_instagram_requires_image(self):
        """Test Instagram requires images."""
        assert PLATFORM_LIMITS[Platform.INSTAGRAM]["image_required"] is True
    
    def test_tiktok_requires_image(self):
        """Test TikTok requires images."""
        assert PLATFORM_LIMITS[Platform.TIKTOK]["image_required"] is True
    
    def test_twitter_hashtag_limit(self):
        """Test Twitter hashtag limit."""
        assert PLATFORM_LIMITS[Platform.TWITTER]["max_hashtags"] <= 10


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
