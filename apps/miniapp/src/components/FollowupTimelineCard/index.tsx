import { View, Text, Image } from '@tarojs/components'
import type { TimelineItem } from '../../types'
import AISummaryCard from '../AISummaryCard'
import './index.scss'

interface FollowupTimelineCardProps {
  item: TimelineItem
  onNextActionTap?: (item: TimelineItem) => void
}

// 跟进动态卡 —— 03 文档 3E：方式+内容+AI 摘要+图片/音频+下一步
export default function FollowupTimelineCard({ item, onNextActionTap }: FollowupTimelineCardProps) {
  const images = (item.media ?? []).filter((m) => m.kind === 'image')
  const audio = (item.media ?? []).find((m) => m.kind === 'audio')
  return (
    <View className='followup-card'>
      <View className='followup-card__head'>
        <Text className='followup-card__title'>{item.title}</Text>
        {(item.actorName || item.contactName) && (
          <Text className='followup-card__who'>{item.actorName ?? item.contactName}</Text>
        )}
        {item.locationLabel && (
          <View className='followup-card__location'>
            <Image className='followup-card__location-icon' src={require('../../assets/icons/pin-gray.png')} />
            <Text className='followup-card__location-text'>{item.locationLabel}</Text>
          </View>
        )}
      </View>

      {item.summary && <Text className='followup-card__summary'>{item.summary}</Text>}

      {item.ai && <AISummaryCard ai={item.ai} />}

      {images.length > 0 && (
        <View className='followup-card__media'>
          {images.map((m) => (
            <View className='followup-card__thumb' key={m.id} />
          ))}
        </View>
      )}

      {audio && (
        <View className='followup-card__audio'>
          <Image className='followup-card__audio-icon' src={require('../../assets/icons/mic.png')} />
          <View className='followup-card__wave'>
            {[10, 18, 26, 14, 30, 20, 12, 24, 16].map((h, i) => (
              <View className='followup-card__bar' key={i} style={{ height: `${h * 2}rpx` }} />
            ))}
          </View>
          <Text className='followup-card__audio-duration'>{audio.durationSec}"</Text>
        </View>
      )}

      {item.nextAction && (
        <View className='followup-card__next'>
          <Image className='followup-card__next-icon' src={require('../../assets/icons/calendar.png')} />
          <Text className='followup-card__next-label'>下次行动：</Text>
          <Text className='followup-card__next-text'>{item.nextAction}</Text>
          {onNextActionTap && (
            <View className='followup-card__next-btn' onClick={() => onNextActionTap(item)}>
              <Text className='followup-card__next-btn-text'>+ 设为待办</Text>
            </View>
          )}
        </View>
      )}
    </View>
  )
}
