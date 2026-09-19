import { View, Text, Image } from '@tarojs/components'
import type { TimelineItem as TimelineItemData, TimelineItemType } from '../../types'
import FollowupTimelineCard from '../FollowupTimelineCard'
import OrderTimelineCard from '../OrderTimelineCard'
import './index.scss'

const TYPE_ICONS: Record<TimelineItemType, { icon: string; className: string }> = {
  followup: { icon: require('../../assets/icons/person-white.png'), className: 'timeline-item__dot--followup' },
  order: { icon: require('../../assets/icons/doc-white.png'), className: 'timeline-item__dot--order' },
  opportunity: { icon: require('../../assets/icons/flag-white.png'), className: 'timeline-item__dot--opportunity' },
  material: { icon: require('../../assets/icons/picture-white.png'), className: 'timeline-item__dot--material' },
}

interface TimelineItemProps {
  item: TimelineItemData
  isLast?: boolean
  onNextActionTap?: (item: TimelineItemData) => void
}

// 统一时间线项 —— 04 文档第十一节：左侧日期时间 + 节点圆点 + 右侧动态卡片
export default function TimelineItem({ item, isLast, onNextActionTap }: TimelineItemProps) {
  const meta = TYPE_ICONS[item.type]
  return (
    <View className='timeline-item'>
      <View className='timeline-item__meta'>
        <Text className='timeline-item__date'>{item.dateLabel}</Text>
        <Text className='timeline-item__time'>{item.occurredAtLabel}</Text>
      </View>
      <View className='timeline-item__axis'>
        <View className={`timeline-item__dot ${meta.className}`}>
          <Image className='timeline-item__dot-icon' src={meta.icon} />
        </View>
        {!isLast && <View className='timeline-item__line' />}
      </View>
      <View className='timeline-item__card'>
        {item.type === 'followup' && <FollowupTimelineCard item={item} onNextActionTap={onNextActionTap} />}
        {item.type === 'order' && <OrderTimelineCard item={item} />}
        {item.type === 'material' && (
          <View className='timeline-item__material'>
            <Text className='timeline-item__material-title'>{item.title}</Text>
            {item.summary && <Text className='timeline-item__material-summary'>{item.summary}</Text>}
            <View className='timeline-item__files'>
              {(item.media ?? []).map((m) => (
                <View className='timeline-item__file' key={m.id}>
                  <Image className='timeline-item__file-icon' src={require('../../assets/icons/doc.png')} />
                  <View className='timeline-item__file-info'>
                    <Text className='timeline-item__file-name'>{m.name}</Text>
                    {m.sizeLabel && <Text className='timeline-item__file-size'>{m.sizeLabel}</Text>}
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}
        {item.type === 'opportunity' && <OrderTimelineCard item={item} />}
      </View>
    </View>
  )
}
