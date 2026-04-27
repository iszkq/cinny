export const PROJECT_SOURCE_URL = 'https://github.com/iszkq/cinny';

export const AUTHOR_CONTACT_ID = '@iszkq5:mtx01.cc';

export const FEATURE_UPDATE_NOTES = [
  '进一步细化中文汉化，补齐欢迎页、用户资料、房间设置、权限与多处细节提示。',
  '优化消息发送可靠性，发送失败会明确提示，并支持失败消息重试。',
  '修复附件发送链路，避免上传完成后消息事件未真正发出，导致消息在双方视角中消失。',
  '首屏与关于页改为本地化展示，新增源码入口与联系作者二维码弹窗。',
  '连接状态提示更清晰，断线、重连与异常状态更容易识别。',
  '保留并整合 AI 助手、消息收藏、圣经工具等扩展功能。',
] as const;
