"""Base agent class with common functionality."""

from abc import ABC, abstractmethod
from typing import Any, Optional

from ..models import AgentStatus
from ..utils import get_logger, RateLimiter


class BaseAgent(ABC):
    """
    Abstract base class for all agents.
    
    Provides common functionality like logging, rate limiting,
    and status management.
    """
    
    def __init__(self, name: str, rate_limiter: Optional[RateLimiter] = None):
        self.name = name
        self.logger = get_logger(f"agents.{name}")
        self.rate_limiter = rate_limiter or RateLimiter()
        self._status = AgentStatus.PENDING
        self._last_error: Optional[str] = None
    
    @property
    def status(self) -> AgentStatus:
        """Current agent status."""
        return self._status
    
    @status.setter
    def status(self, value: AgentStatus):
        self.logger.info(f"Status changed: {self._status} -> {value}")
        self._status = value
    
    @property
    def last_error(self) -> Optional[str]:
        """Last error message if agent failed."""
        return self._last_error
    
    @abstractmethod
    async def execute(self, *args, **kwargs) -> Any:
        """
        Execute the agent's main task.
        
        Override this method in subclasses to implement
        agent-specific logic.
        """
        pass
    
    async def run(self, *args, **kwargs) -> Any:
        """
        Run the agent with status tracking and error handling.
        
        This is the main entry point that wraps execute()
        with proper status management.
        """
        self.status = AgentStatus.RUNNING
        self._last_error = None
        
        try:
            result = await self.execute(*args, **kwargs)
            self.status = AgentStatus.SUCCESS
            return result
        except Exception as e:
            self._last_error = str(e)
            self.status = AgentStatus.FAILED
            self.logger.error(f"Agent failed: {e}")
            raise
    
    def reset(self):
        """Reset agent state for new execution."""
        self._status = AgentStatus.PENDING
        self._last_error = None
