"""Publishing Agent - Posts content to social media platforms."""

import asyncio
from datetime import datetime
from typing import Dict, List, Optional

import aiohttp

from .base_agent import BaseAgent
from ..models import (
    SocialPost,
    ImageSet,
    PublishResult,
    PublishStatus,
    Platform,
)
from ..utils import retry_with_backoff, RateLimiter, get_logger
from ..config import Config

logger = get_logger(__name__)


class PublishAgent(BaseAgent):
    """
    Agent #4: Publishing
    
    Posts content to multiple social media platforms:
    - Twitter/X
    - LinkedIn
    - Instagram
    - Facebook
    - TikTok
    
    Handles OAuth authentication, retry logic, and status tracking.
    """
    
    def __init__(self, config: Config, rate_limiter: Optional[RateLimiter] = None):
        super().__init__("publish_agent", rate_limiter)
        self.config = config
        self._max_retries = 3
        self._manual_review_queue: List[PublishResult] = []
    
    async def execute(
        self,
        posts: List[SocialPost],
        image_sets: List[ImageSet],
        dry_run: bool = False,
    ) -> List[PublishResult]:
        """
        Publish posts to their target platforms.
        
        Args:
            posts: List of posts to publish
            image_sets: List of image sets (matched by post_id)
            dry_run: If True, simulate publishing without actually posting
            
        Returns:
            List of PublishResult objects with status for each post
        """
        self.logger.info(
            f"Publishing {len(posts)} posts (dry_run={dry_run})"
        )
        
        # Create image lookup
        images_by_post: Dict[str, ImageSet] = {
            img_set.post_id: img_set for img_set in image_sets
        }
        
        results = []
        
        for post in posts:
            images = images_by_post.get(post.post_id)
            
            if dry_run:
                result = self._simulate_publish(post, images)
            else:
                result = await self._publish_post(post, images)
            
            results.append(result)
            
            # Stagger posts to avoid spam appearance
            if not dry_run:
                await asyncio.sleep(2)  # 2 second delay between posts
        
        # Log summary
        success_count = sum(1 for r in results if r.status == PublishStatus.PUBLISHED)
        failed_count = sum(1 for r in results if r.status == PublishStatus.FAILED)
        review_count = sum(1 for r in results if r.status == PublishStatus.PENDING_REVIEW)
        
        self.logger.info(
            f"Publishing complete: {success_count} success, "
            f"{failed_count} failed, {review_count} pending review"
        )
        
        return results
    
    async def _publish_post(
        self,
        post: SocialPost,
        images: Optional[ImageSet],
    ) -> PublishResult:
        """Publish a single post with retry logic."""
        platform_handlers = {
            Platform.TWITTER: self._publish_twitter,
            Platform.LINKEDIN: self._publish_linkedin,
            Platform.INSTAGRAM: self._publish_instagram,
            Platform.FACEBOOK: self._publish_facebook,
            Platform.TIKTOK: self._publish_tiktok,
        }
        
        handler = platform_handlers.get(post.platform)
        if not handler:
            return PublishResult(
                post_id=post.post_id,
                platform=post.platform,
                status=PublishStatus.FAILED,
                error_message=f"Unsupported platform: {post.platform}",
            )
        
        last_error = None
        for attempt in range(self._max_retries):
            try:
                result = await handler(post, images)
                if result.status == PublishStatus.PUBLISHED:
                    return result
                last_error = result.error_message
            except Exception as e:
                last_error = str(e)
                self.logger.warning(
                    f"Publish attempt {attempt + 1} failed for {post.post_id}: {e}"
                )
                
                if attempt < self._max_retries - 1:
                    await asyncio.sleep(5 * (attempt + 1))  # Exponential backoff
        
        # All retries failed - queue for manual review
        result = PublishResult(
            post_id=post.post_id,
            platform=post.platform,
            status=PublishStatus.PENDING_REVIEW,
            error_message=f"Max retries exceeded: {last_error}",
            retry_count=self._max_retries,
        )
        self._manual_review_queue.append(result)
        return result
    
    @retry_with_backoff(max_retries=2, base_delay=3.0)
    async def _publish_twitter(
        self,
        post: SocialPost,
        images: Optional[ImageSet],
    ) -> PublishResult:
        """Publish to Twitter/X using API v2."""
        if not self.config.twitter_access_token:
            return PublishResult(
                post_id=post.post_id,
                platform=Platform.TWITTER,
                status=PublishStatus.FAILED,
                error_message="Twitter credentials not configured",
            )
        
        if not await self.rate_limiter.acquire("twitter_post"):
            return PublishResult(
                post_id=post.post_id,
                platform=Platform.TWITTER,
                status=PublishStatus.FAILED,
                error_message="Twitter rate limited",
            )
        
        # First upload media if present
        media_ids = []
        if images and images.images:
            for image in images.images[:4]:  # Twitter allows max 4 images
                try:
                    media_id = await self._upload_twitter_media(str(image.url))
                    if media_id:
                        media_ids.append(media_id)
                except Exception as e:
                    self.logger.warning(f"Failed to upload media: {e}")
        
        async with aiohttp.ClientSession() as session:
            tweet_data = {"text": post.content}
            if media_ids:
                tweet_data["media"] = {"media_ids": media_ids}
            
            async with session.post(
                "https://api.twitter.com/2/tweets",
                headers={
                    "Authorization": f"Bearer {self.config.twitter_access_token}",
                    "Content-Type": "application/json",
                },
                json=tweet_data,
                timeout=30,
            ) as response:
                if response.status == 201:
                    data = await response.json()
                    tweet_id = data["data"]["id"]
                    return PublishResult(
                        post_id=post.post_id,
                        platform=Platform.TWITTER,
                        status=PublishStatus.PUBLISHED,
                        post_url=f"https://twitter.com/i/web/status/{tweet_id}",
                        published_at=datetime.utcnow(),
                    )
                else:
                    error_text = await response.text()
                    return PublishResult(
                        post_id=post.post_id,
                        platform=Platform.TWITTER,
                        status=PublishStatus.FAILED,
                        error_message=f"Twitter API error: {response.status} - {error_text}",
                    )
    
    async def _upload_twitter_media(self, image_url: str) -> Optional[str]:
        """Upload media to Twitter for attachment."""
        # Twitter media upload requires downloading and re-uploading
        # This is a simplified placeholder
        return None
    
    @retry_with_backoff(max_retries=2, base_delay=3.0)
    async def _publish_linkedin(
        self,
        post: SocialPost,
        images: Optional[ImageSet],
    ) -> PublishResult:
        """Publish to LinkedIn using API."""
        if not self.config.linkedin_access_token:
            return PublishResult(
                post_id=post.post_id,
                platform=Platform.LINKEDIN,
                status=PublishStatus.FAILED,
                error_message="LinkedIn credentials not configured",
            )
        
        if not await self.rate_limiter.acquire("linkedin_post"):
            return PublishResult(
                post_id=post.post_id,
                platform=Platform.LINKEDIN,
                status=PublishStatus.FAILED,
                error_message="LinkedIn rate limited",
            )
        
        async with aiohttp.ClientSession() as session:
            # First get user URN
            async with session.get(
                "https://api.linkedin.com/v2/me",
                headers={
                    "Authorization": f"Bearer {self.config.linkedin_access_token}",
                },
            ) as response:
                if response.status != 200:
                    return PublishResult(
                        post_id=post.post_id,
                        platform=Platform.LINKEDIN,
                        status=PublishStatus.FAILED,
                        error_message="Failed to get LinkedIn user info",
                    )
                user_data = await response.json()
                user_urn = f"urn:li:person:{user_data['id']}"
            
            # Create post
            post_data = {
                "author": user_urn,
                "lifecycleState": "PUBLISHED",
                "specificContent": {
                    "com.linkedin.ugc.ShareContent": {
                        "shareCommentary": {"text": post.content},
                        "shareMediaCategory": "NONE",
                    }
                },
                "visibility": {
                    "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC"
                },
            }
            
            async with session.post(
                "https://api.linkedin.com/v2/ugcPosts",
                headers={
                    "Authorization": f"Bearer {self.config.linkedin_access_token}",
                    "Content-Type": "application/json",
                    "X-Restli-Protocol-Version": "2.0.0",
                },
                json=post_data,
                timeout=30,
            ) as response:
                if response.status == 201:
                    data = await response.json()
                    post_urn = data.get("id", "")
                    return PublishResult(
                        post_id=post.post_id,
                        platform=Platform.LINKEDIN,
                        status=PublishStatus.PUBLISHED,
                        post_url=f"https://www.linkedin.com/feed/update/{post_urn}",
                        published_at=datetime.utcnow(),
                    )
                else:
                    error_text = await response.text()
                    return PublishResult(
                        post_id=post.post_id,
                        platform=Platform.LINKEDIN,
                        status=PublishStatus.FAILED,
                        error_message=f"LinkedIn API error: {response.status} - {error_text}",
                    )
    
    async def _publish_instagram(
        self,
        post: SocialPost,
        images: Optional[ImageSet],
    ) -> PublishResult:
        """Publish to Instagram using Graph API."""
        if not self.config.instagram_access_token or not self.config.instagram_business_id:
            return PublishResult(
                post_id=post.post_id,
                platform=Platform.INSTAGRAM,
                status=PublishStatus.FAILED,
                error_message="Instagram credentials not configured",
            )
        
        if not images or not images.images:
            return PublishResult(
                post_id=post.post_id,
                platform=Platform.INSTAGRAM,
                status=PublishStatus.FAILED,
                error_message="Instagram requires an image",
            )
        
        if not await self.rate_limiter.acquire("instagram_post"):
            return PublishResult(
                post_id=post.post_id,
                platform=Platform.INSTAGRAM,
                status=PublishStatus.FAILED,
                error_message="Instagram rate limited",
            )
        
        async with aiohttp.ClientSession() as session:
            # Step 1: Create media container
            async with session.post(
                f"https://graph.facebook.com/v18.0/{self.config.instagram_business_id}/media",
                params={
                    "image_url": str(images.images[0].url),
                    "caption": post.content,
                    "access_token": self.config.instagram_access_token,
                },
                timeout=60,
            ) as response:
                if response.status != 200:
                    error_text = await response.text()
                    return PublishResult(
                        post_id=post.post_id,
                        platform=Platform.INSTAGRAM,
                        status=PublishStatus.FAILED,
                        error_message=f"Instagram container error: {error_text}",
                    )
                data = await response.json()
                container_id = data["id"]
            
            # Step 2: Publish the container
            async with session.post(
                f"https://graph.facebook.com/v18.0/{self.config.instagram_business_id}/media_publish",
                params={
                    "creation_id": container_id,
                    "access_token": self.config.instagram_access_token,
                },
                timeout=60,
            ) as response:
                if response.status == 200:
                    data = await response.json()
                    media_id = data["id"]
                    return PublishResult(
                        post_id=post.post_id,
                        platform=Platform.INSTAGRAM,
                        status=PublishStatus.PUBLISHED,
                        post_url=f"https://www.instagram.com/p/{media_id}",
                        published_at=datetime.utcnow(),
                    )
                else:
                    error_text = await response.text()
                    return PublishResult(
                        post_id=post.post_id,
                        platform=Platform.INSTAGRAM,
                        status=PublishStatus.FAILED,
                        error_message=f"Instagram publish error: {error_text}",
                    )
    
    async def _publish_facebook(
        self,
        post: SocialPost,
        images: Optional[ImageSet],
    ) -> PublishResult:
        """Publish to Facebook Page using Graph API."""
        if not self.config.facebook_access_token or not self.config.facebook_page_id:
            return PublishResult(
                post_id=post.post_id,
                platform=Platform.FACEBOOK,
                status=PublishStatus.FAILED,
                error_message="Facebook credentials not configured",
            )
        
        if not await self.rate_limiter.acquire("facebook_post"):
            return PublishResult(
                post_id=post.post_id,
                platform=Platform.FACEBOOK,
                status=PublishStatus.FAILED,
                error_message="Facebook rate limited",
            )
        
        async with aiohttp.ClientSession() as session:
            post_data = {
                "message": post.content,
                "access_token": self.config.facebook_access_token,
            }
            
            # Add image if present
            if images and images.images:
                post_data["link"] = str(images.images[0].url)
            
            async with session.post(
                f"https://graph.facebook.com/v18.0/{self.config.facebook_page_id}/feed",
                data=post_data,
                timeout=30,
            ) as response:
                if response.status == 200:
                    data = await response.json()
                    fb_post_id = data["id"]
                    return PublishResult(
                        post_id=post.post_id,
                        platform=Platform.FACEBOOK,
                        status=PublishStatus.PUBLISHED,
                        post_url=f"https://www.facebook.com/{fb_post_id}",
                        published_at=datetime.utcnow(),
                    )
                else:
                    error_text = await response.text()
                    return PublishResult(
                        post_id=post.post_id,
                        platform=Platform.FACEBOOK,
                        status=PublishStatus.FAILED,
                        error_message=f"Facebook API error: {response.status} - {error_text}",
                    )
    
    async def _publish_tiktok(
        self,
        post: SocialPost,
        images: Optional[ImageSet],
    ) -> PublishResult:
        """Publish to TikTok (placeholder - TikTok API is limited for posting)."""
        # Note: TikTok's Content Posting API has limited availability
        # This is a placeholder implementation
        return PublishResult(
            post_id=post.post_id,
            platform=Platform.TIKTOK,
            status=PublishStatus.PENDING_REVIEW,
            error_message="TikTok posting requires manual upload or approved API access",
        )
    
    def _simulate_publish(
        self,
        post: SocialPost,
        images: Optional[ImageSet],
    ) -> PublishResult:
        """Simulate publishing for dry-run mode."""
        self.logger.info(f"[DRY RUN] Would publish to {post.platform.value}:")
        self.logger.info(f"  Content: {post.content[:100]}...")
        if images and images.images:
            self.logger.info(f"  Images: {len(images.images)}")
        
        return PublishResult(
            post_id=post.post_id,
            platform=post.platform,
            status=PublishStatus.PUBLISHED,
            post_url=f"https://example.com/dry-run/{post.post_id}",
            published_at=datetime.utcnow(),
        )
    
    def get_manual_review_queue(self) -> List[PublishResult]:
        """Get posts queued for manual review."""
        return self._manual_review_queue.copy()
    
    def clear_manual_review_queue(self):
        """Clear the manual review queue."""
        self._manual_review_queue.clear()
