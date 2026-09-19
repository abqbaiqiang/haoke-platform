import { View, Text } from '@tarojs/components'
import './index.scss'

interface AvatarProps {
  name: string
  size?: 'sm' | 'md' | 'lg'
}

// 首字母默认头像（04 文档：系统无头像时用首字母默认头像）
export default function Avatar({ name, size = 'md' }: AvatarProps) {
  const initial = name.slice(0, 1) || '客'
  return (
    <View className={`avatar avatar--${size}`}>
      <Text className='avatar__char'>{initial}</Text>
    </View>
  )
}
