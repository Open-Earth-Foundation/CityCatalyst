"""Chapter content accepted by both catalogue templates and run structure edits."""

from pydantic import BaseModel, Field, field_validator

MAX_CHAPTERS = 100


class ChapterContent(BaseModel):
    """Editable chapter text shared by template creation and the workspace."""

    title: str = Field(min_length=1, max_length=255)
    description: str = Field(default="", max_length=4000)

    @field_validator("title")
    @classmethod
    def validate_title(cls, value: str) -> str:
        """Keep chapter headings nonempty and on one line."""
        value = value.strip()
        if not value or "\n" in value or "\r" in value:
            raise ValueError("Chapter title must be nonempty and on one line")
        return value
