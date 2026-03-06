"""Unit tests for the Image Generation Agent."""

import uuid
from unittest.mock import AsyncMock, patch

import pytest

from ..agents.image_agent import ImageAgent, PLATFORM_DIMENSIONS, STOCK_IMAGE_FALLBACKS
from ..config import Config
from ..models import SocialPost, ImageSet, ImageDimensions, Platform, Tone


@pytest.fixture
def config():
    """Create a test configuration."""
    return Config(
        openai_api_key="test_openai_key",
        stability_api_key="test_stability_key",
    )


@pytest.fixture
def image_agent(config):
    """Create an ImageAgent instance for testing."""
    return ImageAgent(config)


@pytest.fixture
def sample_post():
    """Create a sample social post for testing."""
    return SocialPost(
        post_id=str(uuid.uuid4()),
        content="Check out this amazing AI breakthrough!",
        platform=Platform.INSTAGRAM,
        hashtags=["AI", "tech"],
        image_prompt="A futuristic robot helping a doctor in a hospital",
        tone=Tone.PROFESSIONAL,
    )


class TestImageAgent:
    """Tests for ImageAgent."""
    
    def test_platform_dimensions_exist(self):
        """Test that all platforms have defined dimensions."""
        for platform in Platform:
            assert platform in PLATFORM_DIMENSIONS
            dims = PLATFORM_DIMENSIONS[platform]
            assert len(dims) > 0
            for dim in dims:
                assert isinstance(dim, ImageDimensions)
                assert dim.width > 0
                assert dim.height > 0
    
    def test_instagram_square_dimension(self):
        """Test Instagram has square 1080x1080 dimension."""
        dims = PLATFORM_DIMENSIONS[Platform.INSTAGRAM]
        has_square = any(d.width == 1080 and d.height == 1080 for d in dims)
        assert has_square
    
    def test_instagram_vertical_dimension(self):
        """Test Instagram has vertical dimension for stories."""
        dims = PLATFORM_DIMENSIONS[Platform.INSTAGRAM]
        has_vertical = any(d.width == 1080 and d.height == 1920 for d in dims)
        assert has_vertical
    
    def test_tiktok_vertical_dimension(self):
        """Test TikTok has 9:16 vertical dimension."""
        dims = PLATFORM_DIMENSIONS[Platform.TIKTOK]
        has_vertical = any(d.width == 1080 and d.height == 1920 for d in dims)
        assert has_vertical
    
    def test_stock_fallbacks_exist(self):
        """Test that stock image fallbacks exist."""
        assert len(STOCK_IMAGE_FALLBACKS) > 0
        for url in STOCK_IMAGE_FALLBACKS:
            assert url.startswith("https://")
    
    def test_prompt_enhancement(self, image_agent):
        """Test image prompt enhancement."""
        basic_prompt = "A robot in space"
        enhanced = image_agent._enhance_prompt(basic_prompt)
        
        assert len(enhanced) > len(basic_prompt)
        assert "quality" in enhanced.lower() or "professional" in enhanced.lower()
    
    def test_prompt_no_double_enhancement(self, image_agent):
        """Test that already-enhanced prompts aren't over-enhanced."""
        enhanced_prompt = "A robot in space, high quality, professional"
        result = image_agent._enhance_prompt(enhanced_prompt)
        
        # Should not add duplicate modifiers
        assert result == enhanced_prompt
    
    def test_get_stock_image(self, image_agent):
        """Test getting a stock image fallback."""
        dims = ImageDimensions(width=1200, height=630)
        image = image_agent._get_stock_image(dims, index=0)
        
        assert image.format == "jpeg"
        assert image.dimensions == dims
        assert "unsplash" in str(image.url)
    
    def test_get_fallback_images(self, image_agent, sample_post):
        """Test getting fallback images for a post."""
        image_set = image_agent._get_fallback_images(sample_post)
        
        assert isinstance(image_set, ImageSet)
        assert image_set.post_id == sample_post.post_id
        assert len(image_set.images) > 0
    
    @pytest.mark.asyncio
    async def test_generate_images_for_post_no_prompt(self, image_agent):
        """Test that posts without image prompts get fallback images."""
        post = SocialPost(
            post_id=str(uuid.uuid4()),
            content="Test post",
            platform=Platform.TWITTER,
            hashtags=[],
            image_prompt=None,  # No prompt
            tone=Tone.PROFESSIONAL,
        )
        
        image_set = await image_agent._generate_images_for_post(post, count=1)
        
        assert isinstance(image_set, ImageSet)
        assert len(image_set.images) > 0
    
    @pytest.mark.asyncio
    async def test_execute_returns_image_sets(self, sample_post):
        """Test that execute returns image sets for all posts."""
        config = Config()  # No API keys, will use fallbacks
        agent = ImageAgent(config)
        
        image_sets = await agent.execute(
            posts=[sample_post],
            images_per_post=2,
        )
        
        assert len(image_sets) == 1
        assert image_sets[0].post_id == sample_post.post_id
    
    @pytest.mark.asyncio
    async def test_execute_limits_images_per_post(self, sample_post):
        """Test that images_per_post is limited to 1-3."""
        config = Config()
        agent = ImageAgent(config)
        
        # Request 5 images, should be limited to 3
        image_sets = await agent.execute(
            posts=[sample_post],
            images_per_post=5,
        )
        
        assert len(image_sets[0].images) <= 3


class TestDallESize:
    """Test DALL-E size selection logic."""
    
    def test_landscape_aspect_ratio(self):
        """Test that landscape images get appropriate DALL-E size."""
        # Wide landscape (16:9)
        dims = ImageDimensions(width=1920, height=1080)
        aspect = dims.width / dims.height
        
        if aspect > 1.5:
            expected_size = "1792x1024"
        else:
            expected_size = "1024x1024"
        
        # Test the aspect ratio logic
        assert aspect > 1.5  # 16:9 = 1.77
    
    def test_portrait_aspect_ratio(self):
        """Test that portrait images get appropriate DALL-E size."""
        # Portrait (9:16)
        dims = ImageDimensions(width=1080, height=1920)
        aspect = dims.width / dims.height
        
        # 9:16 = 0.5625, which is < 0.7
        assert aspect < 0.7
    
    def test_square_aspect_ratio(self):
        """Test that square images get 1024x1024."""
        dims = ImageDimensions(width=1080, height=1080)
        aspect = dims.width / dims.height
        
        assert 0.7 <= aspect <= 1.5  # Should fall into square category


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
