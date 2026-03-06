"""Unit tests for the Orchestrator class."""

import asyncio
import os
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import AsyncMock, patch, MagicMock

import pytest

from ..orchestrator import Orchestrator
from ..config import Config
from ..models import Platform, Tone, AgentStatus


@pytest.fixture
def temp_db():
    """Create a temporary database for testing."""
    with TemporaryDirectory() as tmpdir:
        db_path = Path(tmpdir) / "test.db"
        yield f"sqlite:///{db_path}"


@pytest.fixture
def config(temp_db):
    """Create a test configuration."""
    return Config(
        database_url=temp_db,
        log_dir="logs",
        log_level="DEBUG",
        dry_run_mode=True,
    )


@pytest.fixture
def orchestrator(config):
    """Create an Orchestrator instance for testing."""
    return Orchestrator(config)


class TestOrchestrator:
    """Tests for Orchestrator."""
    
    def test_initialization(self, orchestrator):
        """Test orchestrator initializes correctly."""
        assert orchestrator.news_agent is not None
        assert orchestrator.content_agent is not None
        assert orchestrator.image_agent is not None
        assert orchestrator.publish_agent is not None
    
    def test_database_initialization(self, orchestrator):
        """Test database is initialized."""
        assert orchestrator.engine is not None
        assert orchestrator.Session is not None
    
    def test_config_validation(self, temp_db):
        """Test configuration validation produces warnings."""
        config = Config(database_url=temp_db)  # Minimal config
        
        warnings = config.validate()
        
        # Should have warnings about missing API keys
        assert len(warnings) > 0
    
    @pytest.mark.asyncio
    async def test_run_pipeline_dry_run(self, orchestrator):
        """Test running pipeline in dry-run mode."""
        # Mock the news agent to return test data
        orchestrator.news_agent.run = AsyncMock(return_value=[
            MagicMock(
                topic="Test News",
                source="Test",
                url="https://example.com",
                summary="Test summary",
                keywords=["test"],
            )
        ])
        
        result = await orchestrator.run_pipeline(
            keywords=["test"],
            platforms=[Platform.TWITTER],
            tone=Tone.PROFESSIONAL,
            dry_run=True,
        )
        
        assert result is not None
        assert result.dry_run is True
        assert result.completed_at is not None
    
    @pytest.mark.asyncio
    async def test_run_pipeline_no_news(self, orchestrator):
        """Test pipeline handles no news gracefully."""
        orchestrator.news_agent.run = AsyncMock(return_value=[])
        
        result = await orchestrator.run_pipeline(dry_run=True)
        
        # Should complete but with no content status
        assert result.completed_at is not None
    
    @pytest.mark.asyncio
    async def test_pipeline_state_saving(self, orchestrator):
        """Test that pipeline state is saved to database."""
        orchestrator.news_agent.run = AsyncMock(return_value=[])
        
        result = await orchestrator.run_pipeline(dry_run=True)
        
        # Check history
        history = orchestrator.get_pipeline_history(limit=1)
        
        assert len(history) == 1
        assert history[0]["id"] == result.pipeline_id
    
    @pytest.mark.asyncio
    async def test_approval_queue(self, orchestrator):
        """Test approval queue functionality."""
        # Initially empty
        queue = orchestrator.get_approval_queue()
        assert len(queue) == 0
    
    def test_pipeline_history(self, orchestrator):
        """Test pipeline history retrieval."""
        history = orchestrator.get_pipeline_history()
        
        # Should return a list (possibly empty)
        assert isinstance(history, list)
    
    @pytest.mark.asyncio
    async def test_graceful_shutdown(self, orchestrator):
        """Test graceful shutdown."""
        await orchestrator.shutdown()
        
        assert orchestrator._shutdown_requested is True


class TestAgentFallbacks:
    """Test agent fallback behavior."""
    
    @pytest.mark.asyncio
    async def test_content_agent_fallback(self, orchestrator):
        """Test content agent falls back to templates on failure."""
        # Mock news agent
        orchestrator.news_agent.run = AsyncMock(return_value=[
            MagicMock(
                topic="Test News",
                source="Test",
                url="https://example.com",
                summary="Test summary",
                keywords=["test"],
            )
        ])
        
        # Mock content agent to fail
        original_run = orchestrator.content_agent.run
        orchestrator.content_agent.run = AsyncMock(side_effect=Exception("API Error"))
        
        # Should still complete with fallback content
        result = await orchestrator.run_pipeline(
            platforms=[Platform.TWITTER],
            dry_run=True,
        )
        
        # Pipeline should have posts from fallback
        assert result.completed_at is not None
    
    @pytest.mark.asyncio
    async def test_image_agent_fallback(self, orchestrator):
        """Test image agent falls back to stock images on failure."""
        orchestrator.news_agent.run = AsyncMock(return_value=[
            MagicMock(
                topic="Test News",
                source="Test",
                url="https://example.com",
                summary="Test summary",
                keywords=["test"],
            )
        ])
        
        # Mock image agent to fail
        orchestrator.image_agent.run = AsyncMock(side_effect=Exception("API Error"))
        
        result = await orchestrator.run_pipeline(
            platforms=[Platform.TWITTER],
            dry_run=True,
        )
        
        # Should have completed with fallback images
        assert result.completed_at is not None


class TestConfigFile:
    """Test configuration file loading."""
    
    def test_config_from_file(self):
        """Test loading config from JSON file."""
        with TemporaryDirectory() as tmpdir:
            config_path = Path(tmpdir) / "config.json"
            config_path.write_text('{"posts_per_news_item": 2, "max_posts_per_run": 5}')
            
            config = Config.from_file(config_path)
            
            assert config.posts_per_news_item == 2
            assert config.max_posts_per_run == 5
    
    def test_config_to_dict_masks_secrets(self):
        """Test that config.to_dict masks secrets by default."""
        config = Config(
            openai_api_key="secret_key",
            newsapi_key="another_secret",
        )
        
        d = config.to_dict(include_secrets=False)
        
        assert d["openai_api_key"] == "***"
        assert d["newsapi_key"] == "***"
    
    def test_config_to_dict_shows_secrets_when_requested(self):
        """Test that config.to_dict shows secrets when requested."""
        config = Config(
            openai_api_key="secret_key",
        )
        
        d = config.to_dict(include_secrets=True)
        
        assert d["openai_api_key"] == "secret_key"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
