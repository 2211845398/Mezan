"""Detect raster image formats from file magic bytes (JPEG / PNG / WebP)."""


def detect_raster_image_extension(header: bytes) -> str | None:
    """Return file extension for JPEG / PNG / WebP from magic bytes."""
    if len(header) >= 3 and header[:3] == b"\xff\xd8\xff":
        return "jpg"
    if len(header) >= 8 and header[:8] == b"\x89PNG\r\n\x1a\n":
        return "png"
    if len(header) >= 12 and header[:4] == b"RIFF" and header[8:12] == b"WEBP":
        return "webp"
    return None
