// DTO 类型 —— 对齐 docs/miniapp/03 第七节 / 05 文档 Mobile DTO 定义。
// Phase 3 接真实 API 后，这些类型即移动端接口契约。

export type CustomerLevel = 'A' | 'B' | 'C' | 'D'

export interface PrimaryContact {
  id: string
  name: string
  role?: string
  mobileMasked?: string
  mobileFull?: string
}

export interface CustomerListItem {
  id: string
  name: string
  level: CustomerLevel
  tags: string[]
  primaryContact?: PrimaryContact
  lastFollowupAt?: string
  lastFollowupSummary?: string
  followupStatus?: string
  nextAction?: string
  nextFollowupAt?: string
  hasActiveOpportunity?: boolean
}

export interface TaskRowItem {
  id: string
  customerId: string
  customerName: string
  content: string
  dueLabel: string
  isToday: boolean
  isOverdue: boolean
}

export interface RecentCustomer {
  id: string
  name: string
  tags: string[]
  viewedAtLabel: string
  note: string
}

export interface ItinerarySuggestion {
  id: string
  timeLabel: string
  customerName: string
  address: string
  distanceLabel: string
  etaLabel: string
}

export type TimelineItemType = 'followup' | 'order' | 'opportunity' | 'material'

export interface MediaItem {
  id: string
  kind: 'image' | 'audio' | 'file'
  name?: string
  durationSec?: number
  sizeLabel?: string
}

export interface TimelineItem {
  id: string
  type: TimelineItemType
  occurredAtLabel: string
  dateLabel: string
  title: string
  actorName?: string
  contactName?: string
  summary?: string
  interactionMethod?: string
  locationLabel?: string
  ai?: {
    communicationSummary?: string
    customerNeeds?: string[]
    nextActions?: string[]
  }
  media?: MediaItem[]
  nextAction?: string
  nextFollowupAtLabel?: string
  orderAmountLabel?: string
  orderStatusLabel?: string
}

export interface NearbyCustomer {
  id: string
  name: string
  level: CustomerLevel
  tags: string[]
  distanceLabel: string
  hint: string
  latitude: number
  longitude: number
}

export interface MineSummary {
  name: string
  role: string
  weeklyVisitCount: number
  todoCount: number
  recordCount: number
  todos: TaskRowItem[]
  records: { id: string; customerId: string; customerName: string; summary: string; timeLabel: string }[]
}

export type FilterKey = 'all' | 'a' | 'pending' | 'dormant' | 'opportunity'
