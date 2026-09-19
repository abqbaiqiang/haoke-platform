import { View, Text } from '@tarojs/components'
import type { TaskRowItem } from '../../types'
import './index.scss'

interface TaskRowProps {
  task: TaskRowItem
  onTap?: (task: TaskRowItem) => void
  onToggle?: (task: TaskRowItem) => void
}

// 待办行 —— 03 文档：点击整行进客户详情；点击复选走完成确认（Phase 4 接真实规则）
export default function TaskRow({ task, onTap, onToggle }: TaskRowProps) {
  return (
    <View className='task-row' onClick={() => onTap?.(task)}>
      <View
        className='task-row__checkbox'
        onClick={(e) => { e.stopPropagation(); onToggle?.(task) }}
      />
      <View className='task-row__body'>
        <Text className='task-row__customer'>{task.customerName}</Text>
        <Text className='task-row__content'>{task.content}</Text>
      </View>
      <View className='task-row__side'>
        <Text className={`task-row__due ${task.isToday || task.isOverdue ? 'task-row__due--urgent' : ''}`}>
          {task.dueLabel}
        </Text>
        <Text className='task-row__chevron'>›</Text>
      </View>
    </View>
  )
}
