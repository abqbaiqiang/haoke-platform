import { View, Text } from '@tarojs/components'
import './index.scss'

interface BrandHeaderProps {
  title: string
  subtitle?: string
}

// 页头 —— 04 文档第五节：品牌装饰只能非常轻，不抢信息；不做巨大 Banner
export default function BrandHeader({ title, subtitle }: BrandHeaderProps) {
  return (
    <View className='brand-header'>
      <View className='brand-header__body'>
        <Text className='brand-header__title'>{title}</Text>
        {subtitle && <Text className='brand-header__subtitle'>{subtitle}</Text>}
      </View>
      <View className='brand-header__deco' />
    </View>
  )
}
