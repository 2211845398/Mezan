"""Security utilities (placeholder)."""


def hash_password(plain_password: str) -> str:
    """
    Hash a plain-text password.

    This is a placeholder. Replace with a proper implementation
    using bcrypt or argon2 before production use.

    Args:
        plain_password: The plain-text password.

    Returns:
        Hashed password string.
    """
    # TODO: Use bcrypt / passlib
    return f"hashed_{plain_password}"


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    Verify a plain-text password against a hash.

    This is a placeholder. Replace with a proper implementation
    using bcrypt or argon2 before production use.

    Args:
        plain_password: The plain-text password to verify.
        hashed_password: The stored hashed password.

    Returns:
        True if the password matches the hash, False otherwise.
    """
    # TODO: Use bcrypt / passlib
    return hashed_password == f"hashed_{plain_password}"
