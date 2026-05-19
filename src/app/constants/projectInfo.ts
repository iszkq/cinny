export const PROJECT_SOURCE_URL = 'https://github.com/iszkq/cinny';

export const AUTHOR_CONTACT_ID = '@iszkq5:mtx01.cc';

export const FEATURE_UPDATE_NOTES = [
  '账号级 PIN 策略已接入登录流程。新设备登录同一账号时，会先要求为当前设备设置本机 PIN，而 PIN 码本身仍只保存在本地。',
  '锁屏改为完整的全页安全界面。锁定后不会再透出后方聊天内容，解锁前只能看到 PIN 锁屏页面。',
  'PIN 设置页、登录 PIN 验证页和锁屏页的布局与间距已整体重做，桌面端显示更舒展，输入区不再拥挤留白失衡。',
  '桌面端表情和贴纸资源加强了本地缓存与预热，不同账号会使用独立的资源缓存命名空间，分类资源保持隔离。',
  '个人表情/贴纸分类支持直接拖动排序，表情面板、贴纸面板和设置页中的分类顺序现在会保持同步。',
  '桌面通知权限提示、聊天输入工具区和其他细节交互已同步优化，输入框中重复的“经”按钮已移除。',
] as const;
