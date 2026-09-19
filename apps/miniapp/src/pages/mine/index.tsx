import { View, Text, Image } from '@tarojs/components'
import Taro from '@tarojs/taro'
import BrandHeader from '../../components/BrandHeader'
import SectionCard from '../../components/SectionCard'
import TaskRow from '../../components/TaskRow'
import Avatar from '../../components/Avatar'
import { mockCurrentUser, mockMine } from '../../services/mock'
import './index.scss'

const QUICK_ACTIONS: { key: string; label: string; sub: string; icon: string; primary?: boolean }[] = [
  { key: 'voice', label: '语音记录', sub: '随时记录 · 自动转写', icon: 'mic-white', primary: true },
  { key: 'customers', label: '我的客户', sub: '客户管理 · 跟进查看', icon: 'contacts' },
  { key: 'route', label: '拜访路线', sub: '发现周边优质客户', icon: 'pin' },
  { key: 'photo', label: '拍照资料', sub: '现场拍照 · 上传保存', icon: 'camera' },
]

// 我的 —— 03 文档页面六：个人执行入口，只展示过程数量（拜访/待办/记录），禁止金额/排名
export default function Mine() {
  const openCustomer = (customerId: string) => {
    Taro.navigateTo({ url: `/pages/customer-detail/index?id=${customerId}` })
  }

  return (
    <View className='mine'>
      <BrandHeader title={`${mockCurrentUser.name}`} subtitle='用专业连接更多合作伙伴' />

      <View className='mine__body'>
        <View className='mine__profile'>
          <Avatar name={mockCurrentUser.name} size='lg' />
          <View className='mine__profile-info'>
            <Text className='mine__profile-name'>{mockMine.name}</Text>
            <Text className='mine__profile-role'>{mockMine.role}</Text>
          </View>
        </View>

        <View className='mine__stats'>
          <View className='mine__stat'>
            <Text className='mine__stat-value'>{mockMine.weeklyVisitCount}</Text>
            <Text className='mine__stat-label'>本周拜访</Text>
          </View>
          <View className='mine__stat'>
            <Text className='mine__stat-value'>{mockMine.todoCount}</Text>
            <Text className='mine__stat-label'>待办</Text>
          </View>
          <View className='mine__stat'>
            <Text className='mine__stat-value'>{mockMine.recordCount}</Text>
            <Text className='mine__stat-label'>记录</Text>
          </View>
        </View>

        <SectionCard title={`我的待办（${mockMine.todoCount}）`} icon={require('../../assets/icons/list.png')} extra='查看全部'>
          {mockMine.todos.map((task) => (
            <TaskRow key={task.id} task={task} onTap={(t) => openCustomer(t.customerId)} />
          ))}
        </SectionCard>

        <SectionCard title='我的跟进记录' icon={require('../../assets/icons/clock.png')} extra='查看更多'>
          {mockMine.records.map((r) => (
            <View className='mine__record' key={r.id} onClick={() => openCustomer(r.customerId)}>
              <Avatar name={r.customerName} size='sm' />
              <View className='mine__record-info'>
                <Text className='mine__record-name'>{r.customerName}</Text>
                <Text className='mine__record-summary'>{r.summary}</Text>
              </View>
              <Text className='mine__record-time'>{r.timeLabel}</Text>
            </View>
          ))}
        </SectionCard>

        <SectionCard title='常用功能' icon={require('../../assets/icons/list.png')}>
          <View className='mine__quick'>
            {QUICK_ACTIONS.map((a) => (
              <View
                key={a.key}
                className={`mine__quick-item ${a.primary ? 'mine__quick-item--primary' : ''}`}
                onClick={() => {
                  if (a.key === 'customers') Taro.switchTab({ url: '/pages/customers/index' })
                  if (a.key === 'route') Taro.switchTab({ url: '/pages/nearby/index' })
                  if (a.key === 'voice') Taro.navigateTo({ url: '/pages/followup-edit/index' })
                }}
              >
                <Image className='mine__quick-icon' src={require(`../../assets/icons/${a.icon}.png`)} />
                <Text className='mine__quick-label'>{a.label}</Text>
                <Text className='mine__quick-sub'>{a.sub}</Text>
              </View>
            ))}
          </View>
        </SectionCard>

        <SectionCard title='设置与帮助' icon={require('../../assets/icons/gear.png')}>
          <View className='mine__setting'>
            <Image className='mine__setting-icon' src={require('../../assets/icons/bell-gray.png')} />
            <Text className='mine__setting-label'>消息提醒</Text>
            <Text className='mine__setting-value'>已开启</Text>
          </View>
          <View className='mine__setting'>
            <Image className='mine__setting-icon' src={require('../../assets/icons/refresh-gray.png')} />
            <Text className='mine__setting-label'>同步状态</Text>
            <Text className='mine__setting-value'>上次同步：今天 09:10</Text>
          </View>
          <View className='mine__setting'>
            <Image className='mine__setting-icon' src={require('../../assets/icons/question-gray.png')} />
            <Text className='mine__setting-label'>使用说明</Text>
            <Text className='mine__setting-value'>查看操作指南</Text>
          </View>
        </SectionCard>

        <View className='mine__logout'>
          <Text className='mine__logout-text'>退出登录</Text>
        </View>
      </View>
    </View>
  )
}
