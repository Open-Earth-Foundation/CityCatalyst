"""
Configuration loader for embedding settings.

This module provides functionality to load and access configuration
parameters from the embedding_config.yml file.
"""

import os
import yaml
from pathlib import Path
from typing import Dict, Any, Optional, Union


class EmbeddingConfig:
    """
    Configuration class for embedding settings.
    
    Loads configuration from embedding_config.yml and provides
    easy access to configuration parameters.
    """
    
    def __init__(self, config_path: Optional[str] = None):
        """
        Initialize configuration loader.
        
        Args:
            config_path: Optional path to config file. If None, uses default location.
        """
        if config_path is None:
            # Default to embedding_config.yml in the same directory as this file
            config_path = str(Path(__file__).parent / "embedding_config.yml")
        
        self._config = self._load_config(config_path)
    
    def _load_config(self, config_path: Union[str, Path]) -> Dict[str, Any]:
        """
        Load configuration from YAML file.
        
        Args:
            config_path: Path to configuration file
            
        Returns:
            Configuration dictionary
            
        Raises:
            FileNotFoundError: If config file doesn't exist
            yaml.YAMLError: If config file is invalid
        """
        if not os.path.exists(config_path):
            raise FileNotFoundError(f"Configuration file not found: {config_path}")
        
        with open(config_path, 'r') as f:
            config = yaml.safe_load(f)
        
        if config is None:
            raise ValueError(f"Configuration file is empty: {config_path}")
        
        return config
    
    # Text Processing Configuration
    @property
    def max_token_limit(self) -> int:
        """Maximum token limit for embedding generation."""
        return self._config.get('text_processing', {}).get('max_token_limit', 8000)
    
    # Document Chunking Configuration
    @property
    def default_chunk_size(self) -> int:
        """Default chunk size in characters."""
        return self._config.get('chunking', {}).get('default_chunk_size', 2000)
    
    @property
    def default_chunk_overlap(self) -> int:
        """Default overlap between chunks in characters."""
        return self._config.get('chunking', {}).get('default_chunk_overlap', 200)
    
    # File Processing Configuration
    @property
    def default_directory(self) -> str:
        """Default directory containing documents to process."""
        return self._config.get('file_processing', {}).get('default_directory', 'files')
    
    # Embedding Service Configuration
    @property
    def batch_size(self) -> int:
        """Batch size for embedding generation."""
        return self._config.get('embedding_service', {}).get('batch_size', 100)
    
    @property
    def requests_per_minute(self) -> int:
        """Rate limiting: requests per minute."""
        return self._config.get('embedding_service', {}).get('requests_per_minute', 3500)


# Global config instance
_config_instance = None


def get_embedding_config() -> EmbeddingConfig:
    """
    Get the global embedding configuration instance.
    
    Returns:
        EmbeddingConfig instance
    """
    global _config_instance
    
    if _config_instance is None:
        _config_instance = EmbeddingConfig()
    
    return _config_instance

