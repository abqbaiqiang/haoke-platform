// Phase 1 Mock 数据 —— 仅用于 UI 骨架静态展示。
// docs/miniapp/DEV_LOG.md 风险⑧：参考图中的示例客户/金额/距离均为占位，集中放在本文件，
// Phase 3 起由 /api/mobile 真实数据替换，禁止把 mock 硬编码进业务组件。

import type {
  CustomerListItem,
  FilterKey,
  ItinerarySuggestion,
  MineSummary,
  NearbyCustomer,
  RecentCustomer,
  TaskRowItem,
  TimelineItem,
} from '../types'

export const mockCurrentUser = {
  name: '张经理',
  role: '销售员',
  greeting: '上午好',
  dateLabel: '2026年4月18日 星期六',
}

export const mockTodayTasks: TaskRowItem[] = [
  { id: 't1', customerId: 'c1', customerName: '山东华礼商贸', content: '跟进中秋礼盒采购需求，发送最新产品报价', dueLabel: '今天 11:00', isToday: true, isOverdue: false },
  { id: 't2', customerId: 'c2', customerName: '泉城礼品', content: '回访上周样品试吃反馈，确认下一步合作意向', dueLabel: '今天 15:00', isToday: true, isOverdue: false },
  { id: 't3', customerId: 'c3', customerName: '鲁信福利', content: '沟通企业福利套餐方案，预约负责人面谈', dueLabel: '明天 10:00', isToday: false, isOverdue: false },
  { id: 't4', customerId: 'c4', customerName: '鼎盛供应链', content: '跟进年度框架协议进展，确认合同细节', dueLabel: '4月20日 14:00', isToday: false, isOverdue: false },
]

export const mockRecentCustomers: RecentCustomer[] = [
  { id: 'c1', name: '山东华礼商贸有限公司', tags: ['礼品批发', '节日礼盒', '济南'], viewedAtLabel: '今天 09:23', note: '查看了客户资料' },
  { id: 'c2', name: '泉城礼品有限公司', tags: ['商务礼品', '员工福利', '济南'], viewedAtLabel: '昨天 16:40', note: '沟通了中秋礼盒方案' },
  { id: 'c3', name: '鲁信福利商贸有限公司', tags: ['企业福利', '食品团购', '济南'], viewedAtLabel: '4月16日 11:20', note: '发送了产品资料' },
]

export const mockItinerary: ItinerarySuggestion[] = [
  { id: 'r1', timeLabel: '10:30', customerName: '济南鲁丰食品有限公司', address: '历下区工业南路 88 号', distanceLabel: '1.2公里', etaLabel: '预计 40 分钟' },
  { id: 'r2', timeLabel: '14:00', customerName: '齐鲁优选商贸', address: '市中区英雄山路 216 号', distanceLabel: '3.6公里', etaLabel: '预计 1 小时' },
]

export const mockCustomerFilters: { key: FilterKey; label: string; count: number }[] = [
  { key: 'all', label: '全部', count: 125 },
  { key: 'a', label: 'A类', count: 32 },
  { key: 'pending', label: '待跟进', count: 18 },
  { key: 'dormant', label: '30天未联系', count: 12 },
  { key: 'opportunity', label: '有商机', count: 8 },
]

export const mockCustomerAttention = {
  todayPending: 6,
  dormant30: 12,
  withOpportunity: 8,
}

export const mockCustomers: CustomerListItem[] = [
  {
    id: 'c1', name: '山东华礼商贸有限公司', level: 'A',
    tags: ['礼品批发', '节日礼品', '济南'],
    primaryContact: { id: 'p1', name: '张经理', role: '老板', mobileMasked: '138****6789' },
    lastFollowupAt: '2026-04-16', followupStatus: '沟通中',
    nextAction: '发送新款礼盒报价', nextFollowupAt: '今天 11:00',
  },
  {
    id: 'c2', name: '泉城礼品有限公司', level: 'B',
    tags: ['商务礼品', '员工福利', '济南'],
    primaryContact: { id: 'p2', name: '李总', role: '采购负责人', mobileMasked: '139****8899' },
    lastFollowupAt: '2026-04-15', followupStatus: '需求确认',
    nextAction: '回访样品试吃反馈', nextFollowupAt: '今天 15:00',
    hasActiveOpportunity: true,
  },
  {
    id: 'c3', name: '鲁信福利商贸有限公司', level: 'A',
    tags: ['企业福利', '食品团购', '济南'],
    primaryContact: { id: 'p3', name: '王经理', role: '行政主管', mobileMasked: '136****1122' },
    lastFollowupAt: '2026-04-10', followupStatus: '方案沟通',
    nextAction: '预约负责人面谈', nextFollowupAt: '明天 10:00',
  },
  {
    id: 'c4', name: '鼎盛供应链有限公司', level: 'C',
    tags: ['供应链', '日用百货', '青岛'],
    primaryContact: { id: 'p4', name: '刘总', role: '总经理', mobileMasked: '158****5566' },
    lastFollowupAt: '2026-03-12', followupStatus: '暂无进展',
    nextAction: '尽快联系',
  },
  {
    id: 'c5', name: '齐鲁优选商贸', level: 'A',
    tags: ['商超零售', '社区团购', '淄博'],
    primaryContact: { id: 'p5', name: '陈经理', role: '店长', mobileMasked: '187****3344' },
    lastFollowupAt: '2026-04-14', followupStatus: '意向明确',
    nextAction: '确认合同细节', nextFollowupAt: '4月20日 14:00',
    hasActiveOpportunity: true,
  },
]

export const mockCustomerDetail = {
  customer: mockCustomers[0],
  contactCount: 3,
  address: '历下区工业南路 88 号',
  visitBrief: {
    lastContact: { value: '4月16日 11:20', note: '微信沟通产品方案' },
    lastPromise: { value: '4月20日前', note: '发送新款礼盒报价' },
    currentOpportunity: { value: '企业端节日礼盒', note: '初步洽谈 · 预算 20 万+' },
    recentOrder: { value: '¥ 86,500', note: '2026年3月15日' },
  },
}

export const mockTimeline: TimelineItem[] = [
  {
    id: 'tl1', type: 'followup', occurredAtLabel: '11:20', dateLabel: '4月16日',
    title: '上门拜访', actorName: '我', locationLabel: '历下区工业南路 88 号',
    interactionMethod: '上门拜访',
    summary: '与张总沟通端午礼盒合作方案，客户对我们的定制设计表示认可，希望尽快提供 3 套方案和报价。',
    ai: {
      customerNeeds: ['客户重点关注：产品品质、定制能力、交付周期', '计划下周内部评估，5 月初确定供应商', '需提供：3 套设计方案 + 详细报价单'],
    },
    media: [
      { id: 'm1', kind: 'image', name: ' IMG_3281' },
      { id: 'm2', kind: 'image', name: 'IMG_3282' },
      { id: 'm3', kind: 'image', name: 'IMG_3283' },
    ],
    nextAction: '4月20日前发送新款礼盒报价',
  },
  {
    id: 'tl2', type: 'followup', occurredAtLabel: '16:40', dateLabel: '4月14日',
    title: '微信沟通', contactName: '张总', interactionMethod: '微信',
    summary: '张总：这个方案看起来不错，麻烦再给一个红色主题的设计，另外确认下最晚交货时间。',
    media: [{ id: 'm4', kind: 'audio', durationSec: 22, name: '沟通录音' }],
  },
  {
    id: 'tl3', type: 'order', occurredAtLabel: '10:30', dateLabel: '3月15日',
    title: '历史订单', orderStatusLabel: '已完成',
    summary: '2026年妇女节礼盒采购 · 定制款礼盒 500 套',
    orderAmountLabel: '¥ 86,500',
  },
  {
    id: 'tl4', type: 'material', occurredAtLabel: '14:10', dateLabel: '3月2日',
    title: '上传资料', actorName: '我',
    summary: '上传了《公司介绍 PPT》和《产品手册》',
    media: [
      { id: 'm5', kind: 'file', name: '公司介绍 PPT.pdf', sizeLabel: '12.3 MB' },
      { id: 'm6', kind: 'file', name: '产品手册.pptx', sizeLabel: '28.6 MB' },
    ],
  },
]

export const mockFollowupEdit = {
  customer: mockCustomers[0],
  contacts: [
    { id: 'p1', name: '张总', primary: true },
    { id: 'p4', name: '王经理', primary: false },
  ],
  interactionMethods: ['上门拜访', '电话', '微信', '其他'],
  occurredAtLabel: '2026年4月18日 10:30',
  transcriptSample: '今天上午到山东华礼商贸拜访了张总，主要介绍了我们新款中秋礼盒和企业定制方案。张总对国潮系列很感兴趣，认为设计有特色，准备在下个月的员工福利和中秋渠道采购中试一批。希望我们尽快提供详细报价和产品手册，并安排样品寄送。',
  aiDraft: {
    communicationSummary: '拜访张总，介绍了新款中秋礼盒和企业定制方案，客户对国潮系列很感兴趣，计划在员工福利和中秋渠道采购中试一批。',
    customerNeeds: '需要中秋礼盒报价、产品手册，并寄送样品；关注定制方案和交付周期。',
    nextActions: '1. 今天内发送详细报价和产品手册  2. 安排样品寄送  3. 跟进定制方案细节（LOGO、数量、交期）',
    suggestedNextFollowupAt: '2026年4月28日（周日）',
  },
  attachments: [
    { id: 'm1', kind: 'image' as const, name: 'IMG_3281.jpg' },
    { id: 'm2', kind: 'image' as const, name: 'IMG_3282.jpg' },
    { id: 'm3', kind: 'image' as const, name: 'IMG_3283.jpg' },
    { id: 'm4', kind: 'audio' as const, durationSec: 32, name: '拜访记录.mp3' },
  ],
}

export const mockNearby: NearbyCustomer[] = [
  { id: 'c1', name: '山东华礼商贸有限公司', level: 'A', tags: ['礼品批发', '济南'], distanceLabel: '0.8公里', hint: '42天未联系', latitude: 36.668, longitude: 117.02 },
  { id: 'c2', name: '泉城礼品有限公司', level: 'B', tags: ['商务礼品', '济南'], distanceLabel: '1.2公里', hint: '半年未成交', latitude: 36.674, longitude: 117.065 },
  { id: 'c3', name: '鲁信福利商贸有限公司', level: 'A', tags: ['企业福利', '济南'], distanceLabel: '1.6公里', hint: '28天未联系', latitude: 36.658, longitude: 117.0 },
  { id: 'c5', name: '齐鲁优选商贸', level: 'B', tags: ['食品团购', '历下区'], distanceLabel: '2.3公里', hint: '60天未联系', latitude: 36.662, longitude: 117.09 },
]

export const mockNearbyRadiusOptions = ['1公里内', '3公里内', '5公里内', '10公里内']

export const mockMine: MineSummary = {
  name: '张经理',
  role: '销售员',
  weeklyVisitCount: 8,
  todoCount: 5,
  recordCount: 12,
  todos: mockTodayTasks.slice(0, 3),
  records: [
    { id: 'f1', customerId: 'c1', customerName: '山东华礼商贸有限公司', summary: '沟通了中秋礼盒需求，对方表示比较感兴趣，后续发…', timeLabel: '今天 09:23' },
    { id: 'f2', customerId: 'c2', customerName: '泉城礼品有限公司', summary: '上门拜访，介绍了新品方案，对方已申请样品试吃', timeLabel: '昨天 16:40' },
    { id: 'f3', customerId: 'c3', customerName: '鲁信福利商贸有限公司', summary: '电话沟通企业福利采购计划，约定下周进一步沟通', timeLabel: '4月16日 11:20' },
  ],
}
