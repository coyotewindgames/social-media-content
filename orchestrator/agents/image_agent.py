"""Image Generation Agent - Creates images using AI image generation APIs."""

import asyncio
from typing import List, Optional

import aiohttp

from .base_agent import BaseAgent
from ..models import SocialPost, ImageSet, GeneratedImage, ImageDimensions, Platform
from ..utils import retry_with_backoff, RateLimiter, get_logger
from ..config import Config

logger = get_logger(__name__)


# Platform-specific image dimensions
PLATFORM_DIMENSIONS = {
    Platform.TWITTER: [
        ImageDimensions(width=1200, height=675),  # 16:9 landscape
        ImageDimensions(width=1200, height=1200),  # 1:1 square
    ],
    Platform.LINKEDIN: [
        ImageDimensions(width=1200, height=627),  # LinkedIn recommended
        ImageDimensions(width=1200, height=1200),  # Square
    ],
    Platform.INSTAGRAM: [
        ImageDimensions(width=1080, height=1080),  # Square (feed)
        ImageDimensions(width=1080, height=1350),  # 4:5 portrait
        ImageDimensions(width=1080, height=1920),  # 9:16 stories/reels
    ],
    Platform.FACEBOOK: [
        ImageDimensions(width=1200, height=630),  # Link share
        ImageDimensions(width=1200, height=1200),  # Square
    ],
    Platform.TIKTOK: [
        ImageDimensions(width=1080, height=1920),  # 9:16 vertical
    ],
}

# Stock image URLs for fallback (placeholder approach)
STOCK_IMAGE_FALLBACKS = [
    "https://images.unsplash.com/photo-1504711434969-e33886168f5c?w=1200",  # News
    "https://images.unsplash.com/photo-1611162617474-5b21e879e113?w=1200",  # Social
    "https://images.unsplash.com/photo-1557804506-669a67965ba0?w=1200",  # Business
    "https://images.unsplash.com/photo-1518770660439-4636190af475?w=1200",  # Tech
    "https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=1200",  # Analytics
]


class ImageAgent(BaseAgent):
    """
    Agent #3: Image Generation
    
    Generates images for social media posts using:
    - OpenAI DALL-E 3
    - Stability AI (Stable Diffusion)
    
    Falls back to stock images if generation fails.
    """
    
    def __init__(self, config: Config, rate_limiter: Optional[RateLimiter] = None):
        super().__init__("image_agent", rate_limiter)
        self.config = config
        self._use_dalle = bool(config.openai_api_key)
        self._use_stability = bool(config.stability_api_key)
    
    async def execute(
        self,
        posts: List[SocialPost],
        images_per_post: int = 1,
    ) -> List[ImageSet]:
        """
        Generate images for social media posts.
        
        Args:
            posts: List of posts to generate images for
            images_per_post: Number of images per post (1-3)
            
        Returns:
            List of ImageSet objects containing generated images
        """
        images_per_post = min(max(images_per_post, 1), 3)
        
        self.logger.info(f"Generating images for {len(posts)} posts")
        
        image_sets = []
        
        # Process posts in batches to avoid overwhelming API
        batch_size = 5
        for i in range(0, len(posts), batch_size):
            batch = posts[i:i + batch_size]
            tasks = [
                self._generate_images_for_post(post, images_per_post)
                for post in batch
            ]
            
            results = await asyncio.gather(*tasks, return_exceptions=True)
            
            for post, result in zip(batch, results):
                if isinstance(result, Exception):
                    self.logger.error(f"Image generation failed for {post.post_id}: {result}")
                    # Use fallback stock image
                    image_set = self._get_fallback_images(post)
                else:
                    image_set = result
                
                image_sets.append(image_set)
        
        self.logger.info(f"Generated {len(image_sets)} image sets")
        return image_sets
    
    async def _generate_images_for_post(
        self,
        post: SocialPost,
        count: int,
    ) -> ImageSet:
        """Generate images for a single post."""
        if not post.image_prompt:
            self.logger.debug(f"No image prompt for post {post.post_id}")
            return self._get_fallback_images(post)
        
        # Get platform-appropriate dimensions
        dimensions = PLATFORM_DIMENSIONS.get(
            post.platform, 
            [ImageDimensions(width=1024, height=1024)]
        )
        
        images = []
        
        for i in range(count):
            dim = dimensions[i % len(dimensions)]
            
            try:
                if self._use_dalle:
                    image = await self._generate_with_dalle(post.image_prompt, dim)
                elif self._use_stability:
                    image = await self._generate_with_stability(post.image_prompt, dim)
                else:
                    image = self._get_stock_image(dim, i)
                
                images.append(image)
            except Exception as e:
                self.logger.error(f"Failed to generate image {i + 1}: {e}")
                images.append(self._get_stock_image(dim, i))
        
        return ImageSet(
            post_id=post.post_id,
            images=images,
        )
    
    @retry_with_backoff(max_retries=2, base_delay=5.0)
    async def _generate_with_dalle(
        self,
        prompt: str,
        dimensions: ImageDimensions,
    ) -> GeneratedImage:
        """Generate image using OpenAI DALL-E 3."""
        if not await self.rate_limiter.acquire("openai_dalle"):
            raise Exception("DALL-E rate limited")
        
        # DALL-E 3 supports specific sizes
        dalle_sizes = {
            (1024, 1024): "1024x1024",
            (1792, 1024): "1792x1024",
            (1024, 1792): "1024x1792",
        }
        
        # Find closest DALL-E size
        aspect_ratio = dimensions.width / dimensions.height
        if aspect_ratio > 1.5:
            size = "1792x1024"
        elif aspect_ratio < 0.7:
            size = "1024x1792"
        else:
            size = "1024x1024"
        
        async with aiohttp.ClientSession() as session:
            async with session.post(
                "https://api.openai.com/v1/images/generations",
                headers={
                    "Authorization": f"Bearer {self.config.openai_api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": "dall-e-3",
                    "prompt": self._enhance_prompt(prompt),
                    "n": 1,
                    "size": size,
                    "quality": "standard",
                    "response_format": "url",
                },
                timeout=120,  # DALL-E can be slow
            ) as response:
                if response.status != 200:
                    error_text = await response.text()
                    raise Exception(f"DALL-E API error: {response.status} - {error_text}")
                
                data = await response.json()
                image_url = data["data"][0]["url"]
                
                # Parse actual dimensions from size string
                actual_dims = size.split("x")
                
                return GeneratedImage(
                    url=image_url,
                    format="png",
                    dimensions=ImageDimensions(
                        width=int(actual_dims[0]),
                        height=int(actual_dims[1]),
                    ),
                    alt_text=prompt[:200],
                )
    
    @retry_with_backoff(max_retries=2, base_delay=5.0)
    async def _generate_with_stability(
        self,
        prompt: str,
        dimensions: ImageDimensions,
    ) -> GeneratedImage:
        """Generate image using Stability AI (Stable Diffusion)."""
        if not await self.rate_limiter.acquire("stability"):
            raise Exception("Stability AI rate limited")
        
        async with aiohttp.ClientSession() as session:
            async with session.post(
                "https://api.stability.ai/v1/generation/stable-diffusion-xl-1024-v1-0/text-to-image",
                headers={
                    "Authorization": f"Bearer {self.config.stability_api_key}",
                    "Content-Type": "application/json",
                    "Accept": "application/json",
                },
                json={
                    "text_prompts": [
                        {"text": self._enhance_prompt(prompt), "weight": 1.0}
                    ],
                    "cfg_scale": 7,
                    "height": min(dimensions.height, 1024),
                    "width": min(dimensions.width, 1024),
                    "samples": 1,
                    "steps": 30,
                },
                timeout=120,
            ) as response:
                if response.status != 200:
                    error_text = await response.text()
                    raise Exception(f"Stability API error: {response.status} - {error_text}")
                
                data = await response.json()
                
                # Stability returns base64, we'd need to upload to get URL
                # For simplicity, using a placeholder approach
                image_data = data["artifacts"][0]
                
                # In production, you would upload this to cloud storage
                # and return the actual URL
                return GeneratedImage(
                    url=f"data:image/png;base64,{image_data['base64'][:100]}...",
                    format="png",
                    dimensions=dimensions,
                    alt_text=prompt[:200],
                )
    
    def _enhance_prompt(self, prompt: str) -> str:
        """Enhance image prompt for better results."""
        enhancements = [
            "high quality",
            "professional",
            "detailed",
            "vibrant colors",
        ]
        
        # Check if prompt already has style modifiers
        if any(e in prompt.lower() for e in enhancements):
            return prompt
        
        return f"{prompt}, {', '.join(enhancements)}"
    
    def _get_stock_image(
        self,
        dimensions: ImageDimensions,
        index: int = 0,
    ) -> GeneratedImage:
        """Get a stock image as fallback."""
        stock_url = STOCK_IMAGE_FALLBACKS[index % len(STOCK_IMAGE_FALLBACKS)]
        
        # Add dimension parameters if Unsplash URL
        if "unsplash.com" in stock_url:
            stock_url = f"{stock_url}&h={dimensions.height}&w={dimensions.width}&fit=crop"
        
        return GeneratedImage(
            url=stock_url,
            format="jpeg",
            dimensions=dimensions,
            alt_text="Stock image",
        )
    
    def _get_fallback_images(self, post: SocialPost) -> ImageSet:
        """Get fallback stock images for a post."""
        dimensions = PLATFORM_DIMENSIONS.get(
            post.platform,
            [ImageDimensions(width=1024, height=1024)]
        )[0]
        
        return ImageSet(
            post_id=post.post_id,
            images=[self._get_stock_image(dimensions)],
        )
