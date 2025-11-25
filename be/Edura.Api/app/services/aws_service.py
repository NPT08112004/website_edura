from __future__ import annotations

import os
from io import BufferedReader, BytesIO
from typing import Optional, Union

import boto3
from boto3.s3.transfer import TransferConfig
from botocore.config import Config  # dùng cho retry/backoff


BinaryLike = Union[BytesIO, BufferedReader]


class AwsService:
    def __init__(self) -> None:
        self.bucket: str = os.getenv("S3_BUCKET_NAME") or ""
        if not self.bucket:
            raise ValueError("Thiếu biến môi trường S3_BUCKET_NAME")

        self.region: str = os.getenv("AWS_REGION", "ap-southeast-1")
        self.accelerate: bool = os.getenv("S3_ACCELERATE", "false").lower() == "true"

        # Cấu hình retry (tăng độ bền mạng)
        retry_cfg = Config(
            region_name=self.region,
            retries={
                "max_attempts": 6,          # thử tối đa 6 lần
                "mode": "standard",         # standard/backoff
            },
            s3={"use_accelerate_endpoint": self.accelerate},
        )

        # Khởi tạo session + client
        self.session = boto3.session.Session(region_name=self.region)
        self.s3_client = self.session.client("s3", config=retry_cfg)

        # Cấu hình multipart upload
        # - ngưỡng multipart 5MB (chuẩn S3)
        # - chunk size & concurrency có thể chỉnh qua ENV
        chunk_mb = int(os.getenv("S3_MULTIPART_CHUNK_MB", "16"))  # 16MB mặc định
        self.transfer_cfg = TransferConfig(
            multipart_threshold=5 * 1024 * 1024,
            multipart_chunksize=chunk_mb * 1024 * 1024,
            max_concurrency=int(os.getenv("S3_MAX_CONCURRENCY", "16")),
            use_threads=True,
        )

    # -------------------------------------------------------------
    # URL builder (public URL — nếu bucket public hoặc có policy phù hợp)
    # -------------------------------------------------------------
    def _public_base(self) -> str:
        if self.accelerate:
            return f"https://{self.bucket}.s3-accelerate.amazonaws.com"
        return f"https://{self.bucket}.s3.{self.region}.amazonaws.com"

    def to_public_url(self, key: str) -> str:
        return f"{self._public_base().rstrip('/')}/{key.lstrip('/')}"

    # -------------------------------------------------------------
    # Upload fileobj (giữ nguyên API cũ để không phá vỡ BE hiện có)
    # -------------------------------------------------------------
    def upload_file(
        self,
        fileobj: BinaryLike,
        object_name: str,
        content_type: Optional[str] = None,
    ) -> Optional[str]:
        """
        Upload một stream (BytesIO/BufferedReader) lên S3 bằng multipart.
        Trả về public URL (nếu bucket cho phép public access) hoặc None nếu lỗi.
        """
        try:
            extra = {"ContentType": content_type} if content_type else {}
            # boto3 sẽ đọc fileobj theo stream; không cần load toàn bộ vào RAM
            self.s3_client.upload_fileobj(
                Fileobj=fileobj,
                Bucket=self.bucket,
                Key=object_name,
                ExtraArgs=extra,
                Config=self.transfer_cfg,
            )
            return self.to_public_url(object_name)
        except Exception as e:
            print(f"[ERROR] S3 upload_file: {e}")
            return None

    # -------------------------------------------------------------
    # Presign URL cho PUT (direct-to-S3 từ FE)
    # -------------------------------------------------------------
    def presign_put_url(
        self,
        key: str,
        content_type: Optional[str] = None,
        expires_in: int = 900,
    ) -> Optional[str]:
        """
        Tạo presigned URL cho PUT object (FE upload trực tiếp).
        - key: path trong bucket (vd: documents/uuid.pdf)
        - content_type: bắt FE gửi đúng Content-Type
        - expires_in: TTL (giây), mặc định 900s (15 phút)
        """
        try:
            params = {"Bucket": self.bucket, "Key": key}
            if content_type:
                params["ContentType"] = content_type
            url = self.s3_client.generate_presigned_url(
                ClientMethod="put_object",
                Params=params,
                ExpiresIn=expires_in,
            )
            return url
        except Exception as e:
            print(f"[ERROR] presign_put_url: {e}")
            return None

    # -------------------------------------------------------------
    # Xóa object (tiện cho admin/GC)
    # -------------------------------------------------------------
    def delete_object(self, key: str) -> bool:
        try:
            self.s3_client.delete_object(Bucket=self.bucket, Key=key)
            return True
        except Exception as e:
            print(f"[ERROR] delete_object: {e}")
            return False

    # -------------------------------------------------------------
    # Kiểm tra tồn tại object (head)
    # -------------------------------------------------------------
    def exists(self, key: str) -> bool:
        try:
            self.s3_client.head_object(Bucket=self.bucket, Key=key)
            return True
        except Exception:
            return False


# Singleton để import dùng ở controller
aws_service = AwsService()