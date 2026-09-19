import { View, Text, Image } from '@tarojs/components'
import './index.scss'

interface BriefEntry {
  icon: string
  label: string
  value: string
  note?: string
}

interface VisitBriefProps {
  items: BriefEntry[]
}

// 拜访前速览 —— 03 文档 3C：上次联系 / 上次承诺 / 当前商机 / 近期订单，恢复上下文用
export default function VisitBrief({ items }: VisitBriefProps) {
  return (
    <View className='visit-brief'>
      {items.map((item) => (
        <View className='visit-brief__item' key={item.label}>
          <View className='visit-brief__label-line'>
            <Image className='visit-brief__icon' src={item.icon} />
            <Text className='visit-brief__label'>{item.label}</Text>
          </View>
          <Text className='visit-brief__value'>{item.value}</Text>
          {item.note && <Text className='visit-brief__note'>{item.note}</Text>}
        </View>
      ))}
    </View>
  )
}
