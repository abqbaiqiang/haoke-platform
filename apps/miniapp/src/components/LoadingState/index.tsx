import { View, Text } from '@tarojs/components'
import './index.scss'

export default function LoadingState({ text = '加载中…' }: { text?: string }) {
  return (
    <View className='loading-state'>
      <View className='loading-state__spinner' />
      <Text className='loading-state__text'>{text}</Text>
    </View>
  )
}
