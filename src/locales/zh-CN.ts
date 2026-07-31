/** 简体中文语言包 */
export const zhCN = {
  appName: 'Aevum',
  appSubtitle: '倒数日',

  // 导航/页面
  navHome: '主页',
  navSettings: '设置',
  pageEditTitleNew: '添加新事件',
  pageEditTitleEdit: '编辑事件',
  pageSettingsTitle: '设置',

  // 通用操作
  actionAdd: '添加事件',
  actionSave: '保存',
  actionCancel: '取消',
  actionEdit: '编辑',
  actionDelete: '删除',
  actionConfirmDelete: '删除',
  actionClose: '关闭',
  actionBack: '返回',

  // 空状态
  emptyTitle: '还没有记录任何日子',
  emptyHint: '点击右下角按钮，记录你的第一个重要日子',

  // 表单
  fieldName: '事件名称',
  fieldNamePlaceholder: '如：高考、恋爱纪念日',
  fieldNameRequired: '请输入事件名称',
  fieldCalendar: '历法',
  fieldDate: '目标日期',
  fieldYear: '年',
  fieldMonth: '月',
  fieldDay: '日',
  fieldPreciseTime: '精确时间',
  fieldPreciseTimeHint: '开启后可设置具体时分',
  fieldGranularity: '时间展示粒度',
  fieldRecurrence: '循环',
  fieldRecurNone: '不循环',
  recurWeekly: '每周循环',
  recurMonthly: '每月循环',
  recurYearly: '每年循环',
  recurSummaryWeekly: '每周 {weekday}',
  recurSummaryMonthly: '每月 {day} 日',
  recurSummaryYearly: '每年 {date}',
  recurHint: '循环事件按规则自动滚动到下一个相同日期继续倒数：每周同一天、每月同日、每年同月同日。',
  fieldTags: '分类 / 标签',
  fieldPinned: '置顶显示',
  fieldCustomTag: '新建标签',
  fieldCustomTagPlaceholder: '标签名称',

  // 粒度
  granDay: '仅天数',
  granDhms: '日 · 时 · 分 · 秒',
  granYmd: '年 · 月 · 日',
  granYwd: '年 · 周 · 日',
  granWd: '周 · 日',

  // 历法
  calGregory: '公历',
  calChinese: '农历',
  calIslamic: '伊斯兰历',
  calHebrew: '希伯来历',
  calPersian: '波斯历',
  calBuddhist: '佛教历',
  calJapanese: '日本和历',

  // 历法纪元名（用于覆盖 Android Chrome 被裁剪 ICU 的错误 era）
  eraIslamic: '伊斯兰历',
  eraHebrew: '希伯来历',
  eraPersian: '波斯历',
  eraBuddhist: '佛历',

  // 时间单位
  unitYear: '年',
  unitMonth: '个月',
  unitWeek: '周',
  unitDay: '天',
  unitHour: '时',
  unitMinute: '分',
  unitSecond: '秒',

  // 状态
  statusFuture: '还有',
  statusPast: '已经',
  statusToday: '就是今天',
  countdownPrefix: '距离',
  elapsedPrefix: '已过',
  todayBadge: '今天',

  // 详情弹窗
  detailTargetDate: '目标日期',
  detailCalendar: '历法',
  detailGranularity: '展示粒度',
  detailRecurrence: '循环',
  detailCreatedAt: '创建于',
  deleteConfirmTitle: '删除事件',
  deleteConfirmBody: '确定要删除「{name}」吗？此操作无法撤销。',

  // 提示
  toastSaved: '保存成功',
  toastDeleted: '删除成功',
  toastUpdated: '已更新',
  toastNameEmpty: '事件名称不能为空',
  toastInvalidDate: '所选日期无效，请重新选择',

  // 设置
  settingsSectionGeneral: '通用',
  settingsSectionAppearance: '外观',
  settingsSectionTime: '时间与历法',
  settingsLanguage: '语言',
  langSystem: '跟随系统',
  langZhCN: '简体中文',
  langEnUS: 'English',
  settingsThemeMode: '主题模式',
  themeSystem: '跟随系统',
  themeLight: '亮色',
  themeDark: '暗色',
  settingsSeedColor: '主题色',
  settingsGradientBg: '渐变背景',
  settingsGradientBgHint: '使用OKLCH色彩空间插值，过渡更平滑自然',
  experimental: '实验性功能',
  settingsDayBoundary: '日界限',
  settingsDayBoundaryHint: '自定义一天的起始时刻，影响仅设置日期事件的天数计算',
  settingsDefaultCalendar: '默认历法',
  settingsDefaultGranularity: '默认展示粒度',

  // 数据与背景
  settingsSectionData: '数据',
  dataExport: '导出备份',
  dataImport: '导入备份',
  dataHint: '导出全部事件与设置为JSON文件；导入将覆盖当前所有事件',
  toastExported: '已导出备份文件',
  toastImported: '已导入 {count} 个事件',
  toastImportFailed: '导入失败：文件格式无效',
  settingsBgImage: '卡片背景图',
  settingsBgImageHint: '上传图片作为该事件卡片的背景，自动压暗以保证文字可读',
  actionUpload: '上传图片',
  actionClear: '清除',
  toastBgSet: '背景图已更新',
  toastBgCleared: '已恢复默认背景',
  toastBgTooLarge: '图片过大，请选择10MB以内的图片',

  // 分享
  actionShareImage: '保存为图片',
  toastImageSaved: '图片已保存',

  // 标签预设
  tagLife: '生活',
  tagWork: '工作',
  tagBirthday: '生日',
  tagAnniversary: '纪念日',
  tagHoliday: '节假日',
  tagStudy: '学习',

  // 标签（全局管理）
  settingsSectionTags: '分类 / 标签',
  filterAll: '全部',
  filterEmpty: '没有符合筛选条件的事件',
  tagEditColor: '标签颜色',
  tagNewName: '新标签名称',
  settingsAddTag: '添加标签',
  tagEmptyHint: '还没有标签，可在下方或设置页新建',
  tagDeleteConfirmTitle: '删除标签',
  tagDeleteConfirmBody: '删除「{name}」后，所有使用该标签的事件将不再显示此分类。此操作无法撤销。',
  toastTagCreated: '标签已创建',
  toastTagDeleted: '标签已删除',

  // 自定义主题色（可添加 / 删除 / 重命名）
  settingsSectionCustomThemes: '自定义主题色',
  customThemeEmptyHint: '还没有保存的自定义主题色，可在下方添加',
  settingsAddTheme: '添加主题色',
  customThemeNamePlaceholder: '主题色名称',
  customThemePickColor: '修改主题色',
  customThemeApply: '应用此主题色',
  customThemeActive: '使用中',
  customThemeDeleteConfirmTitle: '删除主题色',
  customThemeDeleteConfirmBody: '删除「{name}」后，该自定义主题色将被移除。此操作无法撤销。',
  toastThemeAdded: '主题色已添加',
  toastThemeDeleted: '主题色已删除',
  toastThemeDupe: '该颜色已存在，已切换至已有主题',
  toastThemeNameEmpty: '请输入主题色名称',
  customThemeNameHint: '为这个主题色取个名字，方便在列表中识别',

  // 安装到主屏幕（PWA）
  installToHome: '安装到主屏幕',
  installHint: '将Aevum安装到主屏幕，获得类似原生App的体验：离线可用、全屏运行、一键直达。',
  installNow: '立即安装',
  installManualHint: '未检测到自动安装入口。请在浏览器菜单中选择「添加到主屏幕」即可安装本应用。',
  toastInstalled: '已安装到主屏幕',
  toastInstallCancelled: '已取消安装',
};

export type LocaleDict = typeof zhCN;
