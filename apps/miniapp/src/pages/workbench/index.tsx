import { View, Text, Image } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useState } from 'react'
import BrandHeader from '../../components/BrandHeader'
import SectionCard from '../../components/SectionCard'
import TaskRow from '../../components/TaskRow'
import Avatar from '../../components/Avatar'
import {
  mockCurrentUser,
  mockItinerary,
  mockRecentCustomers,
  mockTodayTasks,
} from '../../services/mock'
import './index.scss'

// 工作台 —— 03 文档页面一：今日待办 → 快速操作 → 最近查看客户 → 今日行程建议
export default function Workbench() {
  const [tasks] = useState(mockTodayTasks)

  const openCustomer = (customerId: string) => {
    Taro.navigateTo({ url: `/pages/customer-detail/index?id=${customerId}` })
  }

  return (
    <View className='workbench'>
      <BrandHeader
        title={`${mockCurrentUser.greeting}，${mockCurrentUser.name}`}
        subtitle={mockCurrentUser.dateLabel}
      />

      <View className='workbench__sections'>
        <SectionCard title={`今日待办（${tasks.length}）`} icon={require('../../assets/icons/list.png')} extra='查看全部'>
          {tasks.map((task) => (
            <TaskRow key={task.id} task={task} onTap={(t) => openCustomer(t.customerId)} />
          ))}
        </SectionCard>

        <View className='workbench__quick'>
          <View
            className='workbench__quick-item workbench__quick-item--primary'
            onClick={() => Taro.navigateTo({ url: '/pages/followup-edit/index' })}
          >
            <Image className='workbench__quick-icon' src={require('../../assets/icons/mic-white.png')} />
            <Text className='workbench__quick-title'>语音记录</Text>
            <Text className='workbench__quick-sub'>随时记录 · 自动转写</Text>
          </View>
          <View className='workbench__quick-item' onClick={() => Taro.switchTab({ url: '/pages/customers/index' })}>
            <Image className='workbench__quick-icon' src={require('../../assets/icons/search.png')} />
            <Text className='workbench__quick-title'>搜索客户</Text>
            <Text className='workbench__quick-sub'>快速查找 · 精准触达</Text>
          </View>
          <View className='workbench__quick-item' onClick={() => Taro.switchTab({ url: '/pages/nearby/index' })}>
            <Image className='workbench__quick-icon' src={require('../../assets/icons/pin.png')} />
            <Text className='workbench__quick-title'>附近客户</Text>
            <Text className='workbench__quick-sub'>发现周边 · 拓展商机</Text>
          </View>
        </View>

        <SectionCard title='最近查看客户' icon={require('../../assets/icons/clock.png')} extra='查看更多'>
          {mockRecentCustomers.map((c) => (
            <View className='workbench__recent' key={c.id} onClick={() => openCustomer(c.id)}>
              <Avatar name={c.name} size='sm' />
              <View className='workbench__recent-info'>
                <Text className='workbench__recent-name'>{c.name}</Text>
                <Text className='workbench__recent-note'>{c.note}</Text>
              </View>
              <Text className='workbench__recent-time'>{c.viewedAtLabel}</Text>
            </View>
          ))}
        </SectionCard>

        <SectionCard title='今日行程建议' icon={require('../../assets/icons/pin.png')} extra='查看地图'>
          {mockItinerary.map((r) => (
            <View className='workbench__itinerary' key={r.id}>
              <View className='workbench__itinerary-time'>
                <Text className='workbench__itinerary-clock'>{r.timeLabel}</Text>
                <Text className='workbench__itinerary-distance'>{r.distanceLabel}</Text>
              </View>
              <View className='workbench__itinerary-info'>
                <Text className='workbench__itinerary-name'>{r.customerName}</Text>
                <Text className='workbench__itinerary-addr'>{r.address} · {r.etaLabel}</Text>
              </View>
              <View className='workbench__itinerary-go' onClick={() => openCustomer(r.id)}>
                <Text className='workbench__itinerary-go-text'>去这里</Text>
              </View>
            </View>
          ))}
        </SectionCard>
      </View>
    </View>
  )
}
