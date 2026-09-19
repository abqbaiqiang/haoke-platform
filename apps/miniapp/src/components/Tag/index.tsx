import { View, Text } from '@tarojs/components'
import type { ReactNode } from 'react'
import './index.scss'

export type TagVariant = 'neutral' | 'level-a' | 'level-b' | 'warn' | 'brand' | 'danger'

interface TagProps {
  variant?: TagVariant
  children: ReactNode
}

// 标签 —— 04 文档第八节：辅助信息，低饱和，高 44~48rpx，字 22~24rpx
export default function Tag({ variant = 'neutral', children }: TagProps) {
  return (
    <View className={`tag tag--${variant}`}>
      <Text className='tag__text'>{children}</Text>
    </View>
  )
}
