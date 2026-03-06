"""Unit tests for the News Agent."""

import asyncio
from datetime import datetime
from unittest.mock import AsyncMock, patch, MagicMock

import pytest

from ..agents.news_agent import NewsAgent
from ..config import Config
from ..models import NewsItem


@pytest.fixture
def config():
    """Create a test configuration."""
    return Config(
        newsapi_key="test_newsapi_key",
        twitter_bearer_token="test_twitter_token",
    )


@pytest.fixture
def news_agent(config):
    """Create a NewsAgent instance for testing."""
    return NewsAgent(config)


class TestNewsAgent:
    """Tests for NewsAgent."""
    
    @pytest.mark.asyncio
    async def test_extract_keywords(self, news_agent):
        """Test keyword extraction from text."""
        text = "The quick brown fox jumps over the lazy dog in the park"
        keywords = news_agent._extract_keywords(text)
        
        # Should not include stopwords
        assert "the" not in keywords
        assert "over" not in keywords
        
        # Should include meaningful words
        assert any(kw in keywords for kw in ["quick", "brown", "fox", "jumps", "lazy", "dog", "park"])
    
    @pytest.mark.asyncio
    async def test_apply_filters_removes_duplicates(self, news_agent):
        """Test that filters remove duplicate topics."""
        news_items = [
            NewsItem(
                topic="Breaking: AI Revolution",
                source="Source1",
                url="https://example.com/1",
                summary="Summary 1",
                timestamp=datetime.utcnow(),
            ),
            NewsItem(
                topic="Breaking: AI Revolution",  # Duplicate
                source="Source2",
                url="https://example.com/2",
                summary="Summary 2",
                timestamp=datetime.utcnow(),
            ),
        ]
        
        filtered = news_agent._apply_filters(news_items)
        
        # Should remove duplicate
        assert len(filtered) == 1
    
    @pytest.mark.asyncio
    async def test_apply_filters_by_keywords(self, news_agent):
        """Test filtering by keywords."""
        news_items = [
            NewsItem(
                topic="AI and Machine Learning",
                source="Source1",
                url="https://example.com/1",
                summary="Advances in AI",
                timestamp=datetime.utcnow(),
            ),
            NewsItem(
                topic="Sports Championship",
                source="Source2",
                url="https://example.com/2",
                summary="Team wins big",
                timestamp=datetime.utcnow(),
            ),
        ]
        
        filtered = news_agent._apply_filters(news_items, keywords=["AI"])
        
        # Should only include AI-related news
        assert len(filtered) == 1
        assert "AI" in filtered[0].topic
    
    @pytest.mark.asyncio
    async def test_fetch_hackernews_returns_list(self):
        """Test Hacker News fetching returns a list."""
        from ..config import Config
        
        # Create a fresh agent (no caching issues)
        config = Config()
        agent = NewsAgent(config)
        
        # The actual API call would require network, so we just verify
        # the method exists and returns a list type
        agent.rate_limiter.acquire = AsyncMock(return_value=False)  # Rate limit it
        
        result = await agent._fetch_hackernews()
        
        # Should return empty list due to rate limiting
        assert isinstance(result, list)
    
    @pytest.mark.asyncio
    async def test_agent_status_tracking(self, news_agent):
        """Test that agent status is properly tracked."""
        from ..models import AgentStatus
        
        assert news_agent.status == AgentStatus.PENDING
        
        # Mock the execute method to succeed
        news_agent.execute = AsyncMock(return_value=[])
        
        await news_agent.run()
        
        assert news_agent.status == AgentStatus.SUCCESS
    
    @pytest.mark.asyncio
    async def test_agent_failure_tracking(self, news_agent):
        """Test that agent failures are properly tracked."""
        from ..models import AgentStatus
        
        # Mock the execute method to fail
        news_agent.execute = AsyncMock(side_effect=Exception("Test error"))
        
        with pytest.raises(Exception):
            await news_agent.run()
        
        assert news_agent.status == AgentStatus.FAILED
        assert news_agent.last_error == "Test error"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
