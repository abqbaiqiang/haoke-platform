import { View, Text, Input, Image } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useMemo, useState } from 'react'
import CustomerRow from '../../components/CustomerRow'
import {
  mockCustomerAttention,
  mockCustomerFilters,
  mockCustomers,
} from '../../services/mock'
import type { FilterKey } from '../../types'
import './index.scss'

// 客户列表 —— 03 文档页面二：搜索 → Filter Chips → 重点提醒（3 个数字）→ 客户卡片
// 无"新增客户"入口（03 文档：客户先在现有系统/精斗云流程中建立）
export default function Customers() {
  const [keyword, setKeyword] = useState('')
  const [activeFilter, setActiveFilter] = useState<FilterKey>('all')

  const list = useMemo(() => {
    const kw = keyword.trim()
    if (!kw) return mockCustomers
    return mockCustomers.filter(
      (c) =>
        c.name.includes(kw) ||
        c.tags.some((t) => t.includes(kw)) ||
        (c.primaryContact?.name ?? '').includes(kw) ||
        (c.primaryContact?.mobileMasked ?? '').includes(kw),
    )
  }, [keyword])

  return (
    <View className='customers'>
      <View className='customers__search'>
        <Image className='customers__search-icon' src={require('../../assets/icons/search-gray.png')} />
        <Input
          className='customers__search-input'
          placeholder='搜索客户 / 联系人 / 电话'
          value={keyword}
          onInput={(e) => setKeyword(e.detail.value)}
        />
        <View className='customers__search-btn'>
          <Text className='customers__search-btn-text'>搜索</Text>
        </View>
      </View>

      <View className='customers__chips'>
        {mockCustomerFilters.map((f) => (
          <View
            key={f.key}
            className={`customers__chip ${activeFilter === f.key ? 'customers__chip--active' : ''}`}
            onClick={() => setActiveFilter(f.key)}
          >
            <Text className={`customers__chip-text ${activeFilter === f.key ? 'customers__chip-text--active' : ''}`}>
              {f.label}（{f.count}）
            </Text>
          </View>
        ))}
      </View>

      <View className='customers__attention'>
        <View className='customers__attention-head'>
          <Image className='customers__attention-bell' src={require('../../assets/icons/bell.png')} />
          <Text className='customers__attention-title'>重点客户提醒</Text>
        </View>
        <View className='customers__attention-nums'>
          <View className='customers__attention-num'>
            <Text className='customers__attention-num-value customers__attention-num-value--danger'>{mockCustomerAttention.todayPending}</Text>
            <Text className='customers__attention-num-label'>今日待跟进</Text>
          </View>
          <View className='customers__attention-num'>
            <Text className='customers__attention-num-value customers__attention-num-value--warning'>{mockCustomerAttention.dormant30}</Text>
            <Text className='customers__attention-num-label'>30天未联系</Text>
          </View>
          <View className='customers__attention-num'>
            <Text className='customers__attention-num-value customers__attention-num-value--brand'>{mockCustomerAttention.withOpportunity}</Text>
            <Text className='customers__attention-num-label'>有商机</Text>
          </View>
        </View>
      </View>

      <View className='customers__list'>
        {list.map((c) => (
          <CustomerRow
            key={c.id}
            customer={c}
            onTap={(item) => Taro.navigateTo({ url: `/pages/customer-detail/index?id=${item.id}` })}
          />
        ))}
        {list.length === 0 && (
          <View className='customers__empty'>
            <Text className='customers__empty-text'>未找到已有客户，请检查客户名称或联系人</Text>
            <Text className='customers__empty-hint'>客户请先在现有系统/精斗云流程中建立</Text>
          </View>
        )}
      </View>
    </View>
  )
}
