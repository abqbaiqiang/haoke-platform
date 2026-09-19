import { View, Text } from '@tarojs/components'
import type { TimelineItem } from '../../types'
import './index.scss'

interface OrderTimelineCardProps {
  item: TimelineItem
}

// 订单动态卡 —— 03 文档：只展示主题/日期/金额/状态，不塞完整订单明细
export default function OrderTimelineCard({ item }: OrderTimelineCardProps) {
  return (
    <View className='order-card'>
      <View className='order-card__head'>
        <Text className='order-card__title'>{item.title}</Text>
        {item.orderStatusLabel && <Text className='order-card__status'>{item.orderStatusLabel}</Text>}
        {item.orderAmountLabel && <Text className='order-card__amount'>{item.orderAmountLabel}</Text>}
      </View>
      {item.summary && <Text className='order-card__summary'>{item.summary}</Text>}
    </View>
  )
}
