"""News Retrieval Agent - Fetches trending topics from multiple sources."""

import asyncio
from datetime import datetime, timedelta
from typing import List, Optional

import aiohttp

from .base_agent import BaseAgent
from ..models import NewsItem
from ..utils import cache_response, retry_with_backoff, RateLimiter, get_logger
from ..config import Config

logger = get_logger(__name__)


class NewsAgent(BaseAgent):
    """
    Agent #1: News Retrieval
    
    Fetches latest news and trending topics from:
    - NewsAPI (requires API key)
    - Reddit API (public endpoints)
    - Twitter/X trending (requires API key)
    
    Implements rate limiting and caching to avoid duplicate calls.
    """
    
    def __init__(self, config: Config, rate_limiter: Optional[RateLimiter] = None):
        super().__init__("news_agent", rate_limiter)
        self.config = config
        self._cache: dict = {}
        self._cache_ttl = 300  # 5 minutes
    
    async def execute(self, keywords: Optional[List[str]] = None) -> List[NewsItem]:
        """
        Fetch news from all configured sources.
        
        Args:
            keywords: Optional list of keywords to filter news
            
        Returns:
            List of NewsItem objects sorted by relevance
        """
        self.logger.info("Starting news retrieval from all sources")
        
        tasks = []
        
        # NewsAPI (if configured)
        if self.config.newsapi_key:
            tasks.append(self._fetch_newsapi(keywords))
        
        # Reddit (always available - public API)
        tasks.append(self._fetch_reddit(keywords))
        
        # Twitter/X (if configured)
        if self.config.twitter_bearer_token:
            tasks.append(self._fetch_twitter_trends())
        
        # Hacker News (always available - public API)
        tasks.append(self._fetch_hackernews())
        
        # Gather all results
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        # Combine and filter results
        all_news: List[NewsItem] = []
        for result in results:
            if isinstance(result, Exception):
                self.logger.error(f"Source failed: {result}")
                continue
            all_news.extend(result)
        
        # Sort by relevance and recency
        all_news.sort(key=lambda x: (x.relevance_score, x.timestamp), reverse=True)
        
        # Apply content filters
        filtered_news = self._apply_filters(all_news, keywords)
        
        self.logger.info(f"Retrieved {len(filtered_news)} news items")
        return filtered_news[:20]  # Return top 20
    
    @retry_with_backoff(max_retries=3, base_delay=2.0)
    @cache_response(ttl=300)
    async def _fetch_newsapi(self, keywords: Optional[List[str]] = None) -> List[NewsItem]:
        """Fetch news from NewsAPI."""
        if not await self.rate_limiter.acquire("newsapi"):
            self.logger.warning("NewsAPI rate limited")
            return []
        
        query = " OR ".join(keywords) if keywords else "technology OR business OR trending"
        url = "https://newsapi.org/v2/everything"
        params = {
            "q": query,
            "sortBy": "publishedAt",
            "language": "en",
            "pageSize": 20,
            "apiKey": self.config.newsapi_key,
        }
        
        async with aiohttp.ClientSession() as session:
            async with session.get(url, params=params, timeout=30) as response:
                if response.status != 200:
                    self.logger.error(f"NewsAPI error: {response.status}")
                    return []
                
                data = await response.json()
                
                news_items = []
                for article in data.get("articles", []):
                    try:
                        news_items.append(NewsItem(
                            topic=article.get("title", ""),
                            source="NewsAPI",
                            url=article.get("url", ""),
                            summary=article.get("description", "") or "",
                            keywords=self._extract_keywords(article.get("title", "")),
                            timestamp=datetime.fromisoformat(
                                article.get("publishedAt", "").replace("Z", "+00:00")
                            ) if article.get("publishedAt") else datetime.utcnow(),
                            relevance_score=0.8,
                        ))
                    except Exception as e:
                        self.logger.debug(f"Skipping article: {e}")
                
                return news_items
    
    @retry_with_backoff(max_retries=3, base_delay=2.0)
    @cache_response(ttl=300)
    async def _fetch_reddit(self, keywords: Optional[List[str]] = None) -> List[NewsItem]:
        """Fetch trending topics from Reddit."""
        if not await self.rate_limiter.acquire("reddit"):
            self.logger.warning("Reddit rate limited")
            return []
        
        # Subreddits for trending content
        subreddits = ["technology", "business", "news", "worldnews"]
        if keywords:
            # Add relevant subreddits based on keywords
            subreddits.extend([kw.lower() for kw in keywords[:3]])
        
        news_items = []
        
        async with aiohttp.ClientSession() as session:
            for subreddit in subreddits[:5]:  # Limit to 5 subreddits
                url = f"https://www.reddit.com/r/{subreddit}/hot.json"
                headers = {"User-Agent": "SocialMediaBot/1.0"}
                
                try:
                    async with session.get(url, headers=headers, timeout=30) as response:
                        if response.status != 200:
                            continue
                        
                        data = await response.json()
                        
                        for post in data.get("data", {}).get("children", [])[:5]:
                            post_data = post.get("data", {})
                            if post_data.get("is_self") and not post_data.get("selftext"):
                                continue
                            
                            news_items.append(NewsItem(
                                topic=post_data.get("title", ""),
                                source=f"Reddit r/{subreddit}",
                                url=f"https://reddit.com{post_data.get('permalink', '')}",
                                summary=post_data.get("selftext", "")[:500] or post_data.get("title", ""),
                                keywords=self._extract_keywords(post_data.get("title", "")),
                                timestamp=datetime.fromtimestamp(post_data.get("created_utc", 0)),
                                relevance_score=min(post_data.get("score", 0) / 10000, 1.0),
                            ))
                except Exception as e:
                    self.logger.debug(f"Reddit r/{subreddit} error: {e}")
        
        return news_items
    
    @retry_with_backoff(max_retries=3, base_delay=2.0)
    @cache_response(ttl=300)
    async def _fetch_twitter_trends(self) -> List[NewsItem]:
        """Fetch trending topics from Twitter/X API v2."""
        if not await self.rate_limiter.acquire("twitter"):
            self.logger.warning("Twitter rate limited")
            return []
        
        # Note: Twitter API v2 requires elevated access for trends
        # This is a simplified implementation
        url = "https://api.twitter.com/2/tweets/search/recent"
        headers = {
            "Authorization": f"Bearer {self.config.twitter_bearer_token}",
        }
        params = {
            "query": "trending OR viral -is:retweet",
            "max_results": 20,
            "tweet.fields": "created_at,public_metrics",
        }
        
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(url, headers=headers, params=params, timeout=30) as response:
                    if response.status != 200:
                        self.logger.error(f"Twitter API error: {response.status}")
                        return []
                    
                    data = await response.json()
                    
                    news_items = []
                    for tweet in data.get("data", []):
                        news_items.append(NewsItem(
                            topic=tweet.get("text", "")[:100],
                            source="Twitter/X",
                            url=f"https://twitter.com/i/web/status/{tweet.get('id', '')}",
                            summary=tweet.get("text", ""),
                            keywords=self._extract_keywords(tweet.get("text", "")),
                            timestamp=datetime.fromisoformat(
                                tweet.get("created_at", "").replace("Z", "+00:00")
                            ) if tweet.get("created_at") else datetime.utcnow(),
                            relevance_score=0.7,
                        ))
                    
                    return news_items
        except Exception as e:
            self.logger.error(f"Twitter fetch error: {e}")
            return []
    
    @retry_with_backoff(max_retries=3, base_delay=2.0)
    @cache_response(ttl=300)
    async def _fetch_hackernews(self) -> List[NewsItem]:
        """Fetch top stories from Hacker News."""
        if not await self.rate_limiter.acquire("hackernews"):
            self.logger.warning("Hacker News rate limited")
            return []
        
        try:
            async with aiohttp.ClientSession() as session:
                # Get top story IDs
                async with session.get(
                    "https://hacker-news.firebaseio.com/v0/topstories.json",
                    timeout=30
                ) as response:
                    if response.status != 200:
                        return []
                    story_ids = await response.json()
                
                # Fetch top 10 stories
                news_items = []
                for story_id in story_ids[:10]:
                    async with session.get(
                        f"https://hacker-news.firebaseio.com/v0/item/{story_id}.json",
                        timeout=30
                    ) as response:
                        if response.status != 200:
                            continue
                        story = await response.json()
                        
                        if not story or story.get("type") != "story":
                            continue
                        
                        news_items.append(NewsItem(
                            topic=story.get("title", ""),
                            source="Hacker News",
                            url=story.get("url", f"https://news.ycombinator.com/item?id={story_id}"),
                            summary=story.get("title", ""),
                            keywords=self._extract_keywords(story.get("title", "")),
                            timestamp=datetime.fromtimestamp(story.get("time", 0)),
                            relevance_score=min(story.get("score", 0) / 500, 1.0),
                        ))
                
                return news_items
        except Exception as e:
            self.logger.error(f"Hacker News fetch error: {e}")
            return []
    
    def _extract_keywords(self, text: str) -> List[str]:
        """Extract keywords from text using simple tokenization."""
        # Simple keyword extraction - remove common words
        stopwords = {
            "the", "a", "an", "is", "are", "was", "were", "be", "been",
            "being", "have", "has", "had", "do", "does", "did", "will",
            "would", "could", "should", "may", "might", "must", "shall",
            "can", "need", "dare", "ought", "used", "to", "of", "in",
            "for", "on", "with", "at", "by", "from", "as", "into",
            "through", "during", "before", "after", "above", "below",
            "between", "under", "again", "further", "then", "once",
            "here", "there", "when", "where", "why", "how", "all",
            "each", "few", "more", "most", "other", "some", "such",
            "no", "nor", "not", "only", "own", "same", "so", "than",
            "too", "very", "just", "and", "but", "if", "or", "because",
            "until", "while", "this", "that", "these", "those", "over",
        }
        
        words = text.lower().split()
        keywords = [
            word.strip(".,!?:;\"'()[]{}") 
            for word in words 
            if word.strip(".,!?:;\"'()[]{}") not in stopwords
            and len(word) > 2
        ]
        
        return list(set(keywords))[:10]  # Return up to 10 unique keywords
    
    def _apply_filters(
        self,
        news_items: List[NewsItem],
        keywords: Optional[List[str]] = None,
    ) -> List[NewsItem]:
        """Apply content filters to news items."""
        filtered = []
        
        # Remove duplicates based on topic similarity
        seen_topics = set()
        for item in news_items:
            # Simple deduplication
            topic_key = item.topic.lower()[:50]
            if topic_key in seen_topics:
                continue
            seen_topics.add(topic_key)
            
            # Filter by recency (last 24 hours)
            if item.timestamp < datetime.utcnow() - timedelta(hours=24):
                continue
            
            # Filter by keywords if provided
            if keywords:
                item_text = f"{item.topic} {item.summary}".lower()
                if not any(kw.lower() in item_text for kw in keywords):
                    continue
            
            filtered.append(item)
        
        return filtered
