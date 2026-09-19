import { View, Text, Image } from '@tarojs/components'
import Taro, { useRouter } from '@tarojs/taro'
import { useState } from 'react'
import CustomerHeader from '../../components/CustomerHeader'
import SectionCard from '../../components/SectionCard'
import VisitBrief from '../../components/VisitBrief'
import TimelineItem from '../../components/TimelineItem'
import { mockCustomerDetail, mockTimeline } from '../../services/mock'
import type { TimelineItemType } from '../../types'
import './index.scss'

const TIMELINE_FILTERS: { key: 'all' | TimelineItemType; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'followup', label: '拜访' },
  { key: 'followup', label: '沟通' },
  { key: 'order', label: '订单' },
  { key: 'material', label: '资料' },
]

// 客户详情 —— 03 文档页面三：头部 → 快捷操作 → 拜访前速览 → 客户动态时间线 → 记录跟进 FAB
export default function CustomerDetail() {
  const router = useRouter()
  const [filter, setFilter] = useState(0)
  // Phase 1 骨架：mock 单客户；Phase 3 按 router.params.id 调 /customers/{id}/brief 与 /timeline
  void router.params.id

  const items = mockTimeline

  return (
    <View className='customer-detail'>
      <View className='customer-detail__body'>
        <CustomerHeader
          customer={mockCustomerDetail.customer}
          address={mockCustomerDetail.address}
          contactCount={mockCustomerDetail.contactCount}
          onCallTap={() => Taro.makePhoneCall({ phoneNumber: '13800008888' })}
          onNavigateTap={() => { /* Phase 7：有坐标走 openLocation；无坐标提示地址未定位 */ }}
          onContactsTap={() => { /* Phase 3：联系人 Bottom Sheet */ }}
        />

        <SectionCard title='拜访前速览' icon={require('../../assets/icons/list.png')} extra='查看详情'>
          <VisitBrief
            items={[
              { icon: require('../../assets/icons/clock.png'), label: '上次联系', value: mockCustomerDetail.visitBrief.lastContact.value, note: mockCustomerDetail.visitBrief.lastContact.note },
              { icon: require('../../assets/icons/doc.png'), label: '上次承诺', value: mockCustomerDetail.visitBrief.lastPromise.value, note: mockCustomerDetail.visitBrief.lastPromise.note },
              { icon: require('../../assets/icons/flag.png'), label: '当前商机', value: mockCustomerDetail.visitBrief.currentOpportunity.value, note: mockCustomerDetail.visitBrief.currentOpportunity.note },
              { icon: require('../../assets/icons/coin.png'), label: '近期订单', value: mockCustomerDetail.visitBrief.recentOrder.value, note: mockCustomerDetail.visitBrief.recentOrder.note },
            ]}
          />
        </SectionCard>

        <SectionCard title='客户动态' icon={require('../../assets/icons/bubble.png')}>
          <View className='customer-detail__filters'>
            {TIMELINE_FILTERS.map((f, i) => (
              <View
                key={`${f.key}-${i}`}
                className={`customer-detail__filter ${filter === i ? 'customer-detail__filter--active' : ''}`}
                onClick={() => setFilter(i)}
              >
                <Text className={`customer-detail__filter-text ${filter === i ? 'customer-detail__filter-text--active' : ''}`}>{f.label}</Text>
              </View>
            ))}
          </View>
          <View className='customer-detail__timeline'>
            {items.map((item, i) => (
              <TimelineItem key={item.id} item={item} isLast={i === items.length - 1} />
            ))}
          </View>
        </SectionCard>
      </View>

      <View
        className='customer-detail__fab'
        onClick={() => Taro.navigateTo({ url: `/pages/followup-edit/index?id=${mockCustomerDetail.customer.id}` })}
      >
        <Text className='customer-detail__fab-plus'>+</Text>
        <Text className='customer-detail__fab-text'>记录跟进</Text>
      </View>
    </View>
  )
}
