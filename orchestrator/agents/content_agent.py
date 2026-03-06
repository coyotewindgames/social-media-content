"""Content Generation Agent - Creates social media posts using LLMs."""

import asyncio
import uuid
from typing import List, Optional

import aiohttp

from .base_agent import BaseAgent
from ..models import NewsItem, SocialPost, Platform, Tone
from ..utils import retry_with_backoff, RateLimiter, get_logger
from ..config import Config

logger = get_logger(__name__)


# Platform-specific constraints
PLATFORM_LIMITS = {
    Platform.TWITTER: {
        "max_chars": 280,
        "max_hashtags": 5,
        "image_required": False,
    },
    Platform.LINKEDIN: {
        "max_chars": 3000,
        "max_hashtags": 5,
        "image_required": False,
    },
    Platform.INSTAGRAM: {
        "max_chars": 2200,
        "max_hashtags": 30,
        "image_required": True,
    },
    Platform.FACEBOOK: {
        "max_chars": 63206,
        "max_hashtags": 10,
        "image_required": False,
    },
    Platform.TIKTOK: {
        "max_chars": 2200,
        "max_hashtags": 10,
        "image_required": True,
    },
}


# Template fallbacks for when LLM is unavailable
TEMPLATE_POSTS = {
    Tone.CASUAL: [
        "Check this out! {topic} 🔥 {hashtags}",
        "Just saw this and had to share: {topic} 👀 {hashtags}",
        "This is wild - {topic} 🚀 {hashtags}",
    ],
    Tone.PROFESSIONAL: [
        "Key insight: {topic}. Learn more about how this impacts our industry. {hashtags}",
        "Important development: {topic}. Here's what you need to know. {hashtags}",
        "Industry update: {topic}. Stay informed. {hashtags}",
    ],
    Tone.PLAYFUL: [
        "POV: You just discovered {topic} 😎 {hashtags}",
        "When you realize {topic} changes everything 🤯 {hashtags}",
        "Okay but can we talk about {topic}? 💭 {hashtags}",
    ],
    Tone.INSPIRATIONAL: [
        "The future is being shaped by {topic}. Be part of the change. ✨ {hashtags}",
        "Innovation at its finest: {topic}. What possibilities do you see? 🌟 {hashtags}",
        "Dreaming big starts with understanding {topic}. Let's explore! 💡 {hashtags}",
    ],
    Tone.INFORMATIVE: [
        "Did you know? {topic}. Here are the key facts. 📊 {hashtags}",
        "Breaking down {topic}: What you need to understand. 📚 {hashtags}",
        "Quick explainer: {topic}. Stay informed. 📝 {hashtags}",
    ],
}


class ContentAgent(BaseAgent):
    """
    Agent #2: Content Generation
    
    Uses LLMs (OpenAI GPT-4 or Anthropic Claude) to generate
    platform-optimized social media posts with hashtags, CTAs,
    and image prompts.
    """
    
    def __init__(self, config: Config, rate_limiter: Optional[RateLimiter] = None):
        super().__init__("content_agent", rate_limiter)
        self.config = config
        self._use_openai = bool(config.openai_api_key)
        self._use_anthropic = bool(config.anthropic_api_key)
    
    async def execute(
        self,
        news_items: List[NewsItem],
        platforms: Optional[List[Platform]] = None,
        tone: Tone = Tone.PROFESSIONAL,
        posts_per_item: int = 1,
    ) -> List[SocialPost]:
        """
        Generate social media posts from news items.
        
        Args:
            news_items: List of news items to create posts from
            platforms: Target platforms (defaults to all)
            tone: Content tone
            posts_per_item: Number of posts per news item
            
        Returns:
            List of generated SocialPost objects
        """
        if not platforms:
            platforms = list(Platform)
        
        self.logger.info(
            f"Generating posts for {len(news_items)} news items "
            f"across {len(platforms)} platforms"
        )
        
        all_posts = []
        
        for news_item in news_items[:10]:  # Limit to 10 items
            for platform in platforms:
                try:
                    posts = await self._generate_posts(
                        news_item=news_item,
                        platform=platform,
                        tone=tone,
                        count=posts_per_item,
                    )
                    all_posts.extend(posts)
                except Exception as e:
                    self.logger.error(f"Error generating post: {e}")
                    # Fallback to templates
                    post = self._generate_template_post(news_item, platform, tone)
                    all_posts.append(post)
        
        self.logger.info(f"Generated {len(all_posts)} posts")
        return all_posts
    
    async def _generate_posts(
        self,
        news_item: NewsItem,
        platform: Platform,
        tone: Tone,
        count: int = 1,
    ) -> List[SocialPost]:
        """Generate posts using LLM."""
        if self._use_openai:
            return await self._generate_with_openai(news_item, platform, tone, count)
        elif self._use_anthropic:
            return await self._generate_with_anthropic(news_item, platform, tone, count)
        else:
            # Fallback to templates
            return [self._generate_template_post(news_item, platform, tone) for _ in range(count)]
    
    @retry_with_backoff(max_retries=3, base_delay=2.0)
    async def _generate_with_openai(
        self,
        news_item: NewsItem,
        platform: Platform,
        tone: Tone,
        count: int,
    ) -> List[SocialPost]:
        """Generate posts using OpenAI GPT-4."""
        if not await self.rate_limiter.acquire("openai"):
            self.logger.warning("OpenAI rate limited, using templates")
            return [self._generate_template_post(news_item, platform, tone)]
        
        limits = PLATFORM_LIMITS[platform]
        
        system_prompt = f"""You are a social media content expert. Generate engaging {platform.value} posts.
        
Rules:
- Maximum {limits['max_chars']} characters
- Maximum {limits['max_hashtags']} hashtags
- Tone: {tone.value}
- Include a call-to-action when appropriate
- Make content platform-appropriate

For each post, also provide an image prompt that could be used with DALL-E to generate a relevant image."""

        user_prompt = f"""Create {count} unique {platform.value} post(s) about this news:

Topic: {news_item.topic}
Summary: {news_item.summary}
Keywords: {', '.join(news_item.keywords)}

Respond in JSON format:
{{
    "posts": [
        {{
            "content": "The post text with hashtags",
            "hashtags": ["hashtag1", "hashtag2"],
            "image_prompt": "DALL-E prompt for generating an image",
            "call_to_action": "Optional CTA text"
        }}
    ]
}}"""

        async with aiohttp.ClientSession() as session:
            async with session.post(
                "https://api.openai.com/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {self.config.openai_api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": "gpt-4",
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_prompt},
                    ],
                    "temperature": 0.7,
                    "response_format": {"type": "json_object"},
                },
                timeout=60,
            ) as response:
                if response.status != 200:
                    error_text = await response.text()
                    raise Exception(f"OpenAI API error: {response.status} - {error_text}")
                
                data = await response.json()
                content = data["choices"][0]["message"]["content"]
                
                import json
                parsed = json.loads(content)
                
                posts = []
                for post_data in parsed.get("posts", []):
                    post = SocialPost(
                        post_id=str(uuid.uuid4()),
                        content=post_data.get("content", ""),
                        platform=platform,
                        hashtags=post_data.get("hashtags", []),
                        image_prompt=post_data.get("image_prompt"),
                        tone=tone,
                        call_to_action=post_data.get("call_to_action"),
                        news_source=str(news_item.url),
                    )
                    
                    # Validate length
                    if not post.validate_length():
                        # Truncate if too long
                        post = self._truncate_post(post, limits["max_chars"])
                    
                    posts.append(post)
                
                return posts
    
    @retry_with_backoff(max_retries=3, base_delay=2.0)
    async def _generate_with_anthropic(
        self,
        news_item: NewsItem,
        platform: Platform,
        tone: Tone,
        count: int,
    ) -> List[SocialPost]:
        """Generate posts using Anthropic Claude."""
        if not await self.rate_limiter.acquire("anthropic"):
            self.logger.warning("Anthropic rate limited, using templates")
            return [self._generate_template_post(news_item, platform, tone)]
        
        limits = PLATFORM_LIMITS[platform]
        
        prompt = f"""Generate {count} unique {platform.value} post(s) about this news.

Rules:
- Maximum {limits['max_chars']} characters
- Maximum {limits['max_hashtags']} hashtags
- Tone: {tone.value}
- Include a call-to-action when appropriate

News:
Topic: {news_item.topic}
Summary: {news_item.summary}
Keywords: {', '.join(news_item.keywords)}

Respond in JSON format:
{{
    "posts": [
        {{
            "content": "The post text with hashtags",
            "hashtags": ["hashtag1", "hashtag2"],
            "image_prompt": "DALL-E prompt for generating an image",
            "call_to_action": "Optional CTA text"
        }}
    ]
}}"""

        async with aiohttp.ClientSession() as session:
            async with session.post(
                "https://api.anthropic.com/v1/messages",
                headers={
                    "x-api-key": self.config.anthropic_api_key,
                    "Content-Type": "application/json",
                    "anthropic-version": "2023-06-01",
                },
                json={
                    "model": "claude-3-sonnet-20240229",
                    "max_tokens": 1024,
                    "messages": [
                        {"role": "user", "content": prompt},
                    ],
                },
                timeout=60,
            ) as response:
                if response.status != 200:
                    error_text = await response.text()
                    raise Exception(f"Anthropic API error: {response.status} - {error_text}")
                
                data = await response.json()
                content = data["content"][0]["text"]
                
                # Extract JSON from response
                import json
                import re
                json_match = re.search(r'\{[\s\S]*\}', content)
                if not json_match:
                    raise Exception("No JSON found in response")
                
                parsed = json.loads(json_match.group())
                
                posts = []
                for post_data in parsed.get("posts", []):
                    post = SocialPost(
                        post_id=str(uuid.uuid4()),
                        content=post_data.get("content", ""),
                        platform=platform,
                        hashtags=post_data.get("hashtags", []),
                        image_prompt=post_data.get("image_prompt"),
                        tone=tone,
                        call_to_action=post_data.get("call_to_action"),
                        news_source=str(news_item.url),
                    )
                    
                    if not post.validate_length():
                        post = self._truncate_post(post, limits["max_chars"])
                    
                    posts.append(post)
                
                return posts
    
    def _generate_template_post(
        self,
        news_item: NewsItem,
        platform: Platform,
        tone: Tone,
    ) -> SocialPost:
        """Generate a post using templates (fallback)."""
        import random
        
        templates = TEMPLATE_POSTS.get(tone, TEMPLATE_POSTS[Tone.PROFESSIONAL])
        template = random.choice(templates)
        
        # Generate hashtags from keywords
        hashtags = [f"#{kw.replace(' ', '')}" for kw in news_item.keywords[:5]]
        hashtags_str = " ".join(hashtags)
        
        # Format the template
        content = template.format(
            topic=news_item.topic[:100],
            hashtags=hashtags_str,
        )
        
        # Generate simple image prompt
        image_prompt = f"Professional illustration representing: {news_item.topic[:50]}"
        
        return SocialPost(
            post_id=str(uuid.uuid4()),
            content=content,
            platform=platform,
            hashtags=[h.lstrip("#") for h in hashtags],
            image_prompt=image_prompt,
            tone=tone,
            news_source=str(news_item.url),
        )
    
    def _truncate_post(self, post: SocialPost, max_chars: int) -> SocialPost:
        """Truncate post content to fit within character limit."""
        if len(post.content) <= max_chars:
            return post
        
        # Remove hashtags from content first
        content = post.content
        for hashtag in post.hashtags:
            content = content.replace(f"#{hashtag}", "").strip()
        
        # Truncate and add ellipsis
        truncated = content[: max_chars - 3].rsplit(" ", 1)[0] + "..."
        
        return SocialPost(
            post_id=post.post_id,
            content=truncated,
            platform=post.platform,
            hashtags=post.hashtags[:3],  # Reduce hashtags
            image_prompt=post.image_prompt,
            tone=post.tone,
            call_to_action=post.call_to_action,
            news_source=post.news_source,
        )
