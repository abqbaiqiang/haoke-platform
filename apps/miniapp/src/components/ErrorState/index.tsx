import { View, Text } from '@tarojs/components'
import './index.scss'

interface ErrorStateProps {
  message: string
  onRetry?: () => void
}

// 错误状态 —— 03 文档第八节：不得出现接口报错 JSON 原文，只给可读中文与重试
export default function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <View className='error-state'>
      <Text className='error-state__message'>{message}</Text>
      {onRetry && <View className='error-state__retry' onClick={onRetry}><Text className='error-state__retry-text'>重试</Text></View>}
    </View>
  )
}
