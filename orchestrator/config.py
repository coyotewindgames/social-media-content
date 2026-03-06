"""Configuration management for the orchestrator."""

import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import List, Optional

import json


@dataclass
class Config:
    """
    Configuration for the social media content orchestrator.
    
    API keys and credentials are loaded from environment variables.
    Other settings can be loaded from a JSON config file.
    """
    
    # NewsAPI
    newsapi_key: Optional[str] = field(default_factory=lambda: os.getenv("NEWSAPI_KEY"))
    
    # Twitter/X API
    twitter_bearer_token: Optional[str] = field(
        default_factory=lambda: os.getenv("TWITTER_BEARER_TOKEN")
    )
    twitter_access_token: Optional[str] = field(
        default_factory=lambda: os.getenv("TWITTER_ACCESS_TOKEN")
    )
    twitter_access_secret: Optional[str] = field(
        default_factory=lambda: os.getenv("TWITTER_ACCESS_SECRET")
    )
    twitter_api_key: Optional[str] = field(
        default_factory=lambda: os.getenv("TWITTER_API_KEY")
    )
    twitter_api_secret: Optional[str] = field(
        default_factory=lambda: os.getenv("TWITTER_API_SECRET")
    )
    
    # LinkedIn API
    linkedin_access_token: Optional[str] = field(
        default_factory=lambda: os.getenv("LINKEDIN_ACCESS_TOKEN")
    )
    linkedin_client_id: Optional[str] = field(
        default_factory=lambda: os.getenv("LINKEDIN_CLIENT_ID")
    )
    linkedin_client_secret: Optional[str] = field(
        default_factory=lambda: os.getenv("LINKEDIN_CLIENT_SECRET")
    )
    
    # Instagram API (via Facebook Graph API)
    instagram_access_token: Optional[str] = field(
        default_factory=lambda: os.getenv("INSTAGRAM_ACCESS_TOKEN")
    )
    instagram_business_id: Optional[str] = field(
        default_factory=lambda: os.getenv("INSTAGRAM_BUSINESS_ID")
    )
    
    # Facebook API
    facebook_access_token: Optional[str] = field(
        default_factory=lambda: os.getenv("FACEBOOK_ACCESS_TOKEN")
    )
    facebook_page_id: Optional[str] = field(
        default_factory=lambda: os.getenv("FACEBOOK_PAGE_ID")
    )
    
    # OpenAI API (for GPT-4 and DALL-E)
    openai_api_key: Optional[str] = field(
        default_factory=lambda: os.getenv("OPENAI_API_KEY")
    )
    
    # Anthropic API (for Claude)
    anthropic_api_key: Optional[str] = field(
        default_factory=lambda: os.getenv("ANTHROPIC_API_KEY")
    )
    
    # Stability AI (for Stable Diffusion)
    stability_api_key: Optional[str] = field(
        default_factory=lambda: os.getenv("STABILITY_API_KEY")
    )
    
    # Reddit API (optional for authenticated requests)
    reddit_client_id: Optional[str] = field(
        default_factory=lambda: os.getenv("REDDIT_CLIENT_ID")
    )
    reddit_client_secret: Optional[str] = field(
        default_factory=lambda: os.getenv("REDDIT_CLIENT_SECRET")
    )
    
    # Pipeline settings
    posts_per_news_item: int = 1
    images_per_post: int = 1
    max_posts_per_run: int = 10
    
    # Scheduling settings
    schedule_enabled: bool = True
    schedule_interval_hours: int = 6  # Run every 6 hours
    optimal_posting_times: List[str] = field(
        default_factory=lambda: ["09:00", "12:00", "17:00", "20:00"]
    )
    stagger_delay_seconds: int = 30  # Delay between platform posts
    
    # Platform preferences
    enabled_platforms: List[str] = field(
        default_factory=lambda: ["twitter", "linkedin", "instagram", "facebook"]
    )
    default_tone: str = "professional"
    
    # Content filters
    blocked_keywords: List[str] = field(default_factory=list)
    required_keywords: List[str] = field(default_factory=list)
    content_categories: List[str] = field(
        default_factory=lambda: ["technology", "business", "news"]
    )
    
    # Database settings
    database_url: str = field(
        default_factory=lambda: os.getenv(
            "DATABASE_URL",
            "sqlite:///orchestrator.db"
        )
    )
    
    # Logging settings
    log_level: str = field(default_factory=lambda: os.getenv("LOG_LEVEL", "INFO"))
    log_dir: str = field(
        default_factory=lambda: os.getenv("LOG_DIR", "logs")
    )
    
    # Feature flags
    dry_run_mode: bool = field(
        default_factory=lambda: os.getenv("DRY_RUN", "false").lower() == "true"
    )
    require_approval: bool = field(
        default_factory=lambda: os.getenv("REQUIRE_APPROVAL", "false").lower() == "true"
    )
    enable_analytics: bool = True
    
    @classmethod
    def from_file(cls, config_path: Path) -> "Config":
        """
        Load configuration from a JSON file.
        
        Environment variables still take precedence for API keys.
        
        Args:
            config_path: Path to the JSON configuration file
            
        Returns:
            Config instance with merged settings
        """
        config = cls()
        
        if config_path.exists():
            with open(config_path) as f:
                data = json.load(f)
            
            # Update non-credential settings from file
            for key, value in data.items():
                if hasattr(config, key) and not key.endswith(("_key", "_token", "_secret", "_id")):
                    setattr(config, key, value)
        
        return config
    
    def to_dict(self, include_secrets: bool = False) -> dict:
        """
        Convert config to dictionary.
        
        Args:
            include_secrets: Whether to include API keys/tokens
            
        Returns:
            Dictionary representation of config
        """
        result = {}
        for key in self.__dataclass_fields__:
            value = getattr(self, key)
            
            # Mask secrets unless explicitly requested
            if not include_secrets and key.endswith(("_key", "_token", "_secret")):
                value = "***" if value else None
            
            result[key] = value
        
        return result
    
    def validate(self) -> List[str]:
        """
        Validate configuration and return list of warnings.
        
        Returns:
            List of warning/error messages
        """
        warnings = []
        
        # Check for at least one news source
        if not self.newsapi_key and not self.reddit_client_id:
            warnings.append(
                "No news API keys configured. "
                "Will use free Reddit/HackerNews endpoints only."
            )
        
        # Check for at least one LLM
        if not self.openai_api_key and not self.anthropic_api_key:
            warnings.append(
                "No LLM API keys configured. "
                "Will use template-based content generation."
            )
        
        # Check for at least one image generator
        if not self.openai_api_key and not self.stability_api_key:
            warnings.append(
                "No image generation API keys configured. "
                "Will use stock images."
            )
        
        # Check for at least one publishing platform
        has_publishing = any([
            self.twitter_access_token,
            self.linkedin_access_token,
            self.instagram_access_token,
            self.facebook_access_token,
        ])
        
        if not has_publishing:
            warnings.append(
                "No publishing credentials configured. "
                "Running in dry-run mode only."
            )
        
        return warnings


def load_config(config_file: Optional[Path] = None) -> Config:
    """
    Load configuration from environment and optional config file.
    
    Args:
        config_file: Optional path to JSON config file
        
    Returns:
        Loaded Config instance
    """
    if config_file:
        return Config.from_file(config_file)
    
    # Look for default config file
    default_paths = [
        Path("config.json"),
        Path("orchestrator/config.json"),
        Path.home() / ".config/social-media-orchestrator/config.json",
    ]
    
    for path in default_paths:
        if path.exists():
            return Config.from_file(path)
    
    return Config()
