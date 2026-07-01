"""Tests for backup history and download endpoints."""

from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from app.services.backup_service import (
    _format_size,
    _is_valid_backup_filename,
    list_backup_files,
    safe_backup_file_path,
)


class TestFormatSize:
    """Tests for _format_size helper."""

    def test_bytes(self):
        assert _format_size(0) == "0 B"
        assert _format_size(512) == "512 B"

    def test_kilobytes(self):
        assert _format_size(1024) == "1.0 KB"
        assert _format_size(1536) == "1.5 KB"

    def test_megabytes(self):
        assert _format_size(1024 * 1024) == "1.0 MB"
        assert _format_size(5 * 1024 * 1024) == "5.0 MB"

    def test_gigabytes(self):
        assert _format_size(1024 * 1024 * 1024) == "1.0 GB"


class TestIsValidBackupFilename:
    """Tests for filename validation."""

    def test_valid_filenames(self):
        assert _is_valid_backup_filename("mezan_20240115_120000.dump") is True
        assert _is_valid_backup_filename("mezan_20231231_235959.dump") is True

    def test_invalid_extensions(self):
        assert _is_valid_backup_filename("mezan_20240115_120000.sql") is False
        assert _is_valid_backup_filename("mezan_20240115_120000") is False

    def test_path_traversal_attempts(self):
        assert _is_valid_backup_filename("../etc/passwd.dump") is False
        assert _is_valid_backup_filename("..\\windows\\system32.dump") is False
        assert _is_valid_backup_filename("mezan_20240115/../../../etc/passwd.dump") is False

    def test_special_characters(self):
        assert _is_valid_backup_filename("mezan_20240115_120000;rm -rf.dump") is False
        assert _is_valid_backup_filename("mezan_20240115_120000$(whoami).dump") is False

    def test_empty_and_none(self):
        assert _is_valid_backup_filename("") is False
        assert _is_valid_backup_filename(None) is False  # type: ignore


class TestSafeBackupFilePath:
    """Tests for safe file path resolution."""

    @patch("app.services.backup_service._backup_dir")
    def test_valid_file_exists(self, mock_backup_dir):
        """Should return path when filename is valid and file exists."""
        mock_path = MagicMock(spec=Path)
        mock_path.exists.return_value = True
        mock_backup_dir.return_value = mock_path

        result = safe_backup_file_path("mezan_20240115_120000.dump")

        assert result == mock_path.__truediv__.return_value

    @patch("app.services.backup_service._backup_dir")
    def test_file_not_found(self, mock_backup_dir):
        """Should raise NotFoundError when file doesn't exist."""
        mock_path = MagicMock(spec=Path)
        mock_path.exists.return_value = False
        mock_backup_dir.return_value = mock_path

        from app.core.errors import NotFoundError

        with pytest.raises(NotFoundError):
            safe_backup_file_path("mezan_20240115_120000.dump")

    def test_invalid_filename_raises(self):
        """Should raise NotFoundError for invalid filename."""
        from app.core.errors import NotFoundError

        with pytest.raises(NotFoundError):
            safe_backup_file_path("../../../etc/passwd.dump")


class TestListBackupFiles:
    """Tests for listing backup files."""

    @patch("app.services.backup_service._backup_dir")
    def test_empty_directory(self, mock_backup_dir):
        """Should return empty list when no backup files exist."""
        mock_path = MagicMock(spec=Path)
        mock_path.exists.return_value = False
        mock_backup_dir.return_value = mock_path

        result = list_backup_files()

        assert result["items"] == []
        assert result["total"] == 0

    @patch("app.services.backup_service._backup_dir")
    @patch("pathlib.Path.stat")
    @patch("pathlib.Path.is_file")
    @patch("pathlib.Path.glob")
    def test_returns_backup_files(self, mock_glob, mock_is_file, mock_stat, mock_backup_dir):
        """Should return list of backup file metadata."""
        # Setup mock file
        mock_file = MagicMock(spec=Path)
        mock_file.name = "mezan_20240115_120000.dump"
        mock_file.is_file.return_value = True

        stat_result = MagicMock()
        stat_result.st_mtime = 1705310400  # 2024-01-15 12:00:00 UTC
        stat_result.st_size = 1024 * 1024 * 100  # 100 MB
        mock_file.stat.return_value = stat_result

        mock_glob.return_value = [mock_file]

        mock_path = MagicMock(spec=Path)
        mock_path.exists.return_value = True
        mock_backup_dir.return_value = mock_path

        result = list_backup_files()

        assert len(result["items"]) == 1
        assert result["items"][0]["filename"] == "mezan_20240115_120000.dump"
        assert result["items"][0]["size_label"] == "100.0 MB"
        assert result["items"][0]["success"] is True

    @patch("app.services.backup_service._backup_dir")
    def test_respects_pagination(self, mock_backup_dir):
        """Should respect limit and offset parameters."""
        mock_path = MagicMock(spec=Path)
        mock_path.exists.return_value = True

        # Create 10 mock files
        mock_files = []
        for i in range(10):
            mock_file = MagicMock(spec=Path)
            mock_file.name = f"mezan_20240115_{i:02d}0000.dump"
            mock_file.is_file.return_value = True
            stat = MagicMock()
            stat.st_mtime = 1705310400 + i
            stat.st_size = 1024 * 1024
            mock_file.stat.return_value = stat
            mock_files.append(mock_file)

        mock_path.glob.return_value = mock_files
        mock_backup_dir.return_value = mock_path

        result = list_backup_files(limit=5, offset=0)
        assert len(result["items"]) == 5
        assert result["total"] == 10

        result = list_backup_files(limit=5, offset=5)
        # Note: items are sliced by offset, so with 10 items and offset 5, we get 5
        assert len(result["items"]) == 5
