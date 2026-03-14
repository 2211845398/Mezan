"""SQLAlchemy ORM model for user-role assignment (with optional branch scope)."""

from sqlalchemy import ForeignKey, Integer, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.database import Base


class UserRole(Base):
    """Assigns a role to a user; branch_id null means role applies to all branches."""

    __tablename__ = "user_roles"
    __table_args__ = (
        UniqueConstraint("user_id", "role_id", "branch_id", name="uq_user_role_branch"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    role_id: Mapped[int] = mapped_column(ForeignKey("roles.id", ondelete="CASCADE"), nullable=False)
    branch_id: Mapped[int | None] = mapped_column(ForeignKey("branches.id", ondelete="CASCADE"), nullable=True)

    user = relationship("User", back_populates="user_roles")
    role = relationship("Role", back_populates="user_roles")
    branch = relationship("Branch", back_populates="user_roles")
