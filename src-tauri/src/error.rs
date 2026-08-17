use serde::Serialize;
use thiserror::Error;

/// Application-wide error type returned by every Tauri command.
/// Serializes to a plain string so the frontend can display it directly.
#[derive(Debug, Error)]
pub enum AppError {
    #[error("文件未找到: {0}")]
    FileNotFound(String),

    #[error("不是有效的 PDF 文件: {0}")]
    InvalidPdf(String),

    #[error("IO 错误: {0}")]
    Io(#[from] std::io::Error),

    #[error("PDF 解析错误: {0}")]
    Pdf(String),

    #[error("未知文件 ID: {0}")]
    UnknownId(String),
}

impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}
