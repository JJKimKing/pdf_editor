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

    #[error("未知任务 ID: {0}")]
    UnknownTask(String),

    #[error("PDF 已加密，无法转换: {0}")]
    Encrypted(String),

    #[error("未找到转换程序，请安装 LibreOffice 后重试")]
    EngineNotFound,

    #[error("没有权限写入该目录，请选择其他输出位置: {0}")]
    OutputDirNotWritable(String),

    #[error("任务已取消")]
    Cancelled,

    #[error("{user_message}")]
    Conversion {
        user_message: String,
        /// Raw stderr/exit detail for the "查看详细信息" expandable panel —
        /// never shown as the primary message, only on demand.
        detail: String,
    },

    #[error("{user_message}")]
    EngineInstall {
        user_message: String,
        /// Raw error detail (network/verification/subprocess failure) for
        /// the "查看详细信息" panel — same convention as `Conversion`.
        detail: String,
    },

    #[error("本地数据库错误: {0}")]
    Db(String),

    #[error("设置读写错误: {0}")]
    Settings(String),
}

impl From<rusqlite::Error> for AppError {
    fn from(e: rusqlite::Error) -> Self {
        AppError::Db(e.to_string())
    }
}

impl AppError {
    /// Raw developer-facing detail (stderr, exit code, …), when available.
    /// Never rendered as the primary UI message — only behind "查看详细信息".
    pub fn detail(&self) -> Option<&str> {
        match self {
            AppError::Conversion { detail, .. } => Some(detail.as_str()),
            AppError::EngineInstall { detail, .. } => Some(detail.as_str()),
            _ => None,
        }
    }
}

impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}
