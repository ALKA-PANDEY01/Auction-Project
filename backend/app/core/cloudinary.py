from __future__ import annotations

from typing import Any

import cloudinary
import cloudinary.uploader
from fastapi import HTTPException, UploadFile, status

from app.core.config import settings


def configure_cloudinary() -> None:
    if not settings.CLOUDINARY_CLOUD_NAME or not settings.CLOUDINARY_API_KEY or not settings.CLOUDINARY_API_SECRET:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Cloudinary credentials are not configured.",
        )

    cloudinary.config(
        cloud_name=settings.CLOUDINARY_CLOUD_NAME,
        api_key=settings.CLOUDINARY_API_KEY,
        api_secret=settings.CLOUDINARY_API_SECRET,
        secure=True,
    )


def upload_image_to_cloudinary(file: UploadFile) -> tuple[str, str]:
    if file is None or not file.filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No image file provided.",
        )

    try:
        configure_cloudinary()
        file.file.seek(0)
        upload_result: dict[str, Any] = cloudinary.uploader.upload(
            file.file,
            folder=settings.CLOUDINARY_FOLDER,
            resource_type="image",
        )
    except Exception as exc:  # pragma: no cover - runtime integration concern
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Image upload failed: {str(exc)}",
        ) from exc

    secure_url = upload_result.get("secure_url")
    public_id = upload_result.get("public_id")

    if not secure_url or not public_id:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Cloudinary did not return a valid image URL.",
        )

    return secure_url, public_id


def delete_image_from_cloudinary(public_id: str | None) -> None:
    if not public_id:
        return

    try:
        configure_cloudinary()
        cloudinary.uploader.destroy(public_id, resource_type="image")
    except Exception:
        return
