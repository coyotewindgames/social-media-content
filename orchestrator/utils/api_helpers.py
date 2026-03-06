"""API helper utilities including rate limiting, caching, and retry logic."""

import asyncio
import hashlib
import json
import time
from collections import defaultdict
from datetime import datetime, timedelta
from functools import wraps
from typing import Any, Callable, Dict, Optional, TypeVar, Union

import aiohttp

from .logger import get_logger

logger = get_logger(__name__)

T = TypeVar("T")


class RateLimiter:
    """
    Token bucket rate limiter for API calls.
    
    Implements per-API rate limiting to avoid exceeding quotas.
    """
    
    def __init__(self, calls_per_minute: int = 60, calls_per_day: int = 1000):
        self.calls_per_minute = calls_per_minute
        self.calls_per_day = calls_per_day
        self._minute_tokens: Dict[str, list] = defaultdict(list)
        self._day_tokens: Dict[str, list] = defaultdict(list)
        self._lock = asyncio.Lock()
    
    async def acquire(self, api_name: str) -> bool:
        """
        Acquire a rate limit token for the specified API.
        
        Args:
            api_name: Identifier for the API being called
            
        Returns:
            True if token acquired, False if rate limited
        """
        async with self._lock:
            now = datetime.utcnow()
            minute_ago = now - timedelta(minutes=1)
            day_ago = now - timedelta(days=1)
            
            # Clean old tokens
            self._minute_tokens[api_name] = [
                t for t in self._minute_tokens[api_name] if t > minute_ago
            ]
            self._day_tokens[api_name] = [
                t for t in self._day_tokens[api_name] if t > day_ago
            ]
            
            # Check limits
            if len(self._minute_tokens[api_name]) >= self.calls_per_minute:
                logger.warning(f"Rate limited (minute): {api_name}")
                return False
            
            if len(self._day_tokens[api_name]) >= self.calls_per_day:
                logger.warning(f"Rate limited (day): {api_name}")
                return False
            
            # Acquire token
            self._minute_tokens[api_name].append(now)
            self._day_tokens[api_name].append(now)
            return True
    
    async def wait_for_token(self, api_name: str, max_wait: float = 60.0) -> bool:
        """
        Wait for a rate limit token to become available.
        
        Args:
            api_name: Identifier for the API
            max_wait: Maximum seconds to wait
            
        Returns:
            True if token acquired within timeout
        """
        start = time.time()
        while time.time() - start < max_wait:
            if await self.acquire(api_name):
                return True
            await asyncio.sleep(1.0)
        return False


class ResponseCache:
    """
    Simple in-memory cache for API responses.
    
    Prevents duplicate API calls within a configurable TTL.
    """
    
    def __init__(self, default_ttl: int = 300):  # 5 minutes default
        self._cache: Dict[str, tuple] = {}  # key -> (value, expiry)
        self._lock = asyncio.Lock()
        self.default_ttl = default_ttl
    
    def _make_key(self, *args, **kwargs) -> str:
        """Generate cache key from arguments."""
        # Convert non-serializable objects to their string representation
        def make_serializable(obj):
            try:
                json.dumps(obj)
                return obj
            except (TypeError, ValueError):
                return f"{type(obj).__name__}:{id(obj)}"
        
        safe_args = tuple(make_serializable(a) for a in args)
        safe_kwargs = {k: make_serializable(v) for k, v in kwargs.items()}
        
        key_data = json.dumps({"args": safe_args, "kwargs": safe_kwargs}, sort_keys=True)
        return hashlib.md5(key_data.encode()).hexdigest()
    
    async def get(self, key: str) -> Optional[Any]:
        """Get cached value if not expired."""
        async with self._lock:
            if key in self._cache:
                value, expiry = self._cache[key]
                if datetime.utcnow() < expiry:
                    logger.debug(f"Cache hit: {key[:8]}...")
                    return value
                else:
                    del self._cache[key]
            return None
    
    async def set(self, key: str, value: Any, ttl: Optional[int] = None) -> None:
        """Set cache value with TTL."""
        async with self._lock:
            expiry = datetime.utcnow() + timedelta(seconds=ttl or self.default_ttl)
            self._cache[key] = (value, expiry)
            logger.debug(f"Cached: {key[:8]}...")
    
    async def clear(self) -> None:
        """Clear all cached values."""
        async with self._lock:
            self._cache.clear()


# Global cache instance
_cache = ResponseCache()


def cache_response(ttl: int = 300):
    """
    Decorator to cache function responses.
    
    Args:
        ttl: Time-to-live in seconds for cached values
    """
    def decorator(func: Callable[..., T]) -> Callable[..., T]:
        @wraps(func)
        async def wrapper(*args, **kwargs) -> T:
            key = _cache._make_key(func.__name__, *args, **kwargs)
            
            # Try to get from cache
            cached = await _cache.get(key)
            if cached is not None:
                return cached
            
            # Call function and cache result
            result = await func(*args, **kwargs)
            await _cache.set(key, result, ttl)
            return result
        
        return wrapper
    return decorator


def retry_with_backoff(
    max_retries: int = 3,
    base_delay: float = 1.0,
    max_delay: float = 60.0,
    exponential: bool = True,
    exceptions: tuple = (Exception,),
):
    """
    Decorator for retry logic with exponential backoff.
    
    Args:
        max_retries: Maximum number of retry attempts
        base_delay: Initial delay between retries in seconds
        max_delay: Maximum delay between retries
        exponential: Whether to use exponential backoff
        exceptions: Tuple of exceptions to catch and retry
    """
    def decorator(func: Callable[..., T]) -> Callable[..., T]:
        @wraps(func)
        async def wrapper(*args, **kwargs) -> T:
            last_exception = None
            
            for attempt in range(max_retries + 1):
                try:
                    return await func(*args, **kwargs)
                except exceptions as e:
                    last_exception = e
                    if attempt < max_retries:
                        if exponential:
                            delay = min(base_delay * (2 ** attempt), max_delay)
                        else:
                            delay = base_delay
                        
                        logger.warning(
                            f"Retry {attempt + 1}/{max_retries} for {func.__name__}: {e}"
                        )
                        await asyncio.sleep(delay)
                    else:
                        logger.error(
                            f"Max retries exceeded for {func.__name__}: {e}"
                        )
            
            raise last_exception
        
        return wrapper
    return decorator


async def make_api_request(
    url: str,
    method: str = "GET",
    headers: Optional[Dict[str, str]] = None,
    params: Optional[Dict[str, Any]] = None,
    json_data: Optional[Dict[str, Any]] = None,
    timeout: int = 30,
    rate_limiter: Optional[RateLimiter] = None,
    api_name: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Make an async HTTP request with optional rate limiting.
    
    Args:
        url: Request URL
        method: HTTP method
        headers: Request headers
        params: Query parameters
        json_data: JSON body data
        timeout: Request timeout in seconds
        rate_limiter: Optional rate limiter instance
        api_name: API identifier for rate limiting
        
    Returns:
        JSON response as dictionary
        
    Raises:
        aiohttp.ClientError: On request failure
        ValueError: On non-JSON response
    """
    if rate_limiter and api_name:
        if not await rate_limiter.wait_for_token(api_name):
            raise RuntimeError(f"Rate limit exceeded for {api_name}")
    
    async with aiohttp.ClientSession() as session:
        async with session.request(
            method=method,
            url=url,
            headers=headers,
            params=params,
            json=json_data,
            timeout=aiohttp.ClientTimeout(total=timeout),
        ) as response:
            response.raise_for_status()
            
            content_type = response.headers.get("Content-Type", "")
            if "application/json" in content_type:
                return await response.json()
            else:
                text = await response.text()
                return {"text": text}


class APIClient:
    """Base class for API clients with built-in rate limiting and retries."""
    
    def __init__(
        self,
        base_url: str,
        api_key: Optional[str] = None,
        rate_limiter: Optional[RateLimiter] = None,
    ):
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.rate_limiter = rate_limiter or RateLimiter()
        self.logger = get_logger(self.__class__.__name__)
    
    def _get_headers(self) -> Dict[str, str]:
        """Get default headers. Override in subclasses."""
        headers = {"Content-Type": "application/json"}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        return headers
    
    @retry_with_backoff(max_retries=3)
    async def _request(
        self,
        endpoint: str,
        method: str = "GET",
        **kwargs,
    ) -> Dict[str, Any]:
        """Make an API request with rate limiting and retry logic."""
        url = f"{self.base_url}/{endpoint.lstrip('/')}"
        return await make_api_request(
            url=url,
            method=method,
            headers=self._get_headers(),
            rate_limiter=self.rate_limiter,
            api_name=self.__class__.__name__,
            **kwargs,
        )
