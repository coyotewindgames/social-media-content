"""Logging utility with rotation and comprehensive formatting."""

import logging
import os
import sys
from datetime import datetime
from logging.handlers import RotatingFileHandler, TimedRotatingFileHandler
from pathlib import Path
from typing import Optional


# Default log directory
LOG_DIR = Path(__file__).parent.parent / "logs"


def setup_logging(
    log_dir: Optional[Path] = None,
    log_level: str = "INFO",
    max_bytes: int = 10 * 1024 * 1024,  # 10MB
    backup_count: int = 5,
) -> None:
    """
    Set up logging configuration with rotation.
    
    Args:
        log_dir: Directory to store log files
        log_level: Logging level (DEBUG, INFO, WARNING, ERROR, CRITICAL)
        max_bytes: Maximum size per log file before rotation
        backup_count: Number of backup files to keep
    """
    log_dir = log_dir or LOG_DIR
    log_dir.mkdir(parents=True, exist_ok=True)
    
    # Create formatter
    formatter = logging.Formatter(
        fmt="%(asctime)s | %(levelname)-8s | %(name)s | %(filename)s:%(lineno)d | %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S"
    )
    
    # Root logger configuration
    root_logger = logging.getLogger()
    root_logger.setLevel(getattr(logging, log_level.upper()))
    
    # Clear existing handlers
    root_logger.handlers.clear()
    
    # Console handler (stdout)
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(logging.INFO)
    console_handler.setFormatter(formatter)
    root_logger.addHandler(console_handler)
    
    # File handler with rotation (main log)
    file_handler = RotatingFileHandler(
        log_dir / "orchestrator.log",
        maxBytes=max_bytes,
        backupCount=backup_count,
        encoding="utf-8"
    )
    file_handler.setLevel(logging.DEBUG)
    file_handler.setFormatter(formatter)
    root_logger.addHandler(file_handler)
    
    # Error log (separate file for errors only)
    error_handler = RotatingFileHandler(
        log_dir / "errors.log",
        maxBytes=max_bytes,
        backupCount=backup_count,
        encoding="utf-8"
    )
    error_handler.setLevel(logging.ERROR)
    error_handler.setFormatter(formatter)
    root_logger.addHandler(error_handler)
    
    # Agent-specific daily rotating log
    agent_handler = TimedRotatingFileHandler(
        log_dir / "agents.log",
        when="midnight",
        interval=1,
        backupCount=30,
        encoding="utf-8"
    )
    agent_handler.setLevel(logging.INFO)
    agent_handler.setFormatter(formatter)
    
    # Add agent handler to a specific logger
    agent_logger = logging.getLogger("agents")
    agent_logger.addHandler(agent_handler)


def get_logger(name: str) -> logging.Logger:
    """
    Get a logger instance with the specified name.
    
    Args:
        name: Logger name (typically __name__ of the module)
        
    Returns:
        Configured logger instance
    """
    return logging.getLogger(name)


class LogContext:
    """Context manager for adding extra context to log messages."""
    
    def __init__(self, logger: logging.Logger, **context):
        self.logger = logger
        self.context = context
        self._original_name = logger.name
    
    def __enter__(self):
        context_str = " | ".join(f"{k}={v}" for k, v in self.context.items())
        self.logger.name = f"{self._original_name} | {context_str}"
        return self.logger
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        self.logger.name = self._original_name


def log_execution_time(logger: logging.Logger):
    """Decorator to log function execution time."""
    def decorator(func):
        async def async_wrapper(*args, **kwargs):
            start = datetime.utcnow()
            logger.info(f"Starting {func.__name__}")
            try:
                result = await func(*args, **kwargs)
                elapsed = (datetime.utcnow() - start).total_seconds()
                logger.info(f"Completed {func.__name__} in {elapsed:.2f}s")
                return result
            except Exception as e:
                elapsed = (datetime.utcnow() - start).total_seconds()
                logger.error(f"Failed {func.__name__} after {elapsed:.2f}s: {e}")
                raise
        
        def sync_wrapper(*args, **kwargs):
            start = datetime.utcnow()
            logger.info(f"Starting {func.__name__}")
            try:
                result = func(*args, **kwargs)
                elapsed = (datetime.utcnow() - start).total_seconds()
                logger.info(f"Completed {func.__name__} in {elapsed:.2f}s")
                return result
            except Exception as e:
                elapsed = (datetime.utcnow() - start).total_seconds()
                logger.error(f"Failed {func.__name__} after {elapsed:.2f}s: {e}")
                raise
        
        import asyncio
        if asyncio.iscoroutinefunction(func):
            return async_wrapper
        return sync_wrapper
    return decorator
