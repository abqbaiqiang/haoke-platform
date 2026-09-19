import { View, Text } from '@tarojs/components'
import type { TimelineItem } from '../../types'
import './index.scss'

interface AISummaryCardProps {
  ai: NonNullable<TimelineItem['ai']>
}

// AI 整理区 —— 04 文档第十一节：brand-soft 淡蓝底、小"AI整理"角标、要点列表、不做科技大屏
export default function AISummaryCard({ ai }: AISummaryCardProps) {
  const bullets = [
    ...(ai.customerNeeds ?? []),
    ...(ai.nextActions ?? []),
  ]
  if (!bullets.length && !ai.communicationSummary) return null
  return (
    <View className='ai-summary'>
      <Text className='ai-summary__badge'>✦ AI整理</Text>
      {ai.communicationSummary && <Text className='ai-summary__line'>{ai.communicationSummary}</Text>}
      {bullets.map((b, i) => (
        <View className='ai-summary__item' key={i}>
          <Text className='ai-summary__dot'>·</Text>
          <Text className='ai-summary__text'>{b}</Text>
        </View>
      ))}
    </View>
  )
}
