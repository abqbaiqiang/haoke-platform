import { View, Text, Image } from '@tarojs/components'
import type { ReactNode } from 'react'
import './index.scss'

interface SectionCardProps {
  title?: string
  icon?: string
  extra?: string
  onExtraTap?: () => void
  children: ReactNode
}

// 标准卡片 + 区块标题（SectionHeader 内置：图标 + 标题 + 右侧链接）
export default function SectionCard({ title, icon, extra, onExtraTap, children }: SectionCardProps) {
  return (
    <View className='section-card'>
      {(title || extra) && (
        <View className='section-card__header'>
          {icon && <Image className='section-card__icon' src={icon} />}
          {title && <Text className='section-card__title'>{title}</Text>}
          {extra && (
            <View className='section-card__extra' onClick={onExtraTap}>
              <Text className='section-card__extra-text'>{extra}</Text>
              <Text className='section-card__arrow'>›</Text>
            </View>
          )}
        </View>
      )}
      {children}
    </View>
  )
}
