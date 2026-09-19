import { View, Text } from '@tarojs/components'
import './index.scss'

interface EmptyStateProps {
  message: string
  hint?: string
}

export default function EmptyState({ message, hint }: EmptyStateProps) {
  return (
    <View className='empty-state'>
      <Text className='empty-state__message'>{message}</Text>
      {hint && <Text className='empty-state__hint'>{hint}</Text>}
    </View>
  )
}
