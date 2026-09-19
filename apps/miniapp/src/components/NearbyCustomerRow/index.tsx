import { View, Text, Image } from '@tarojs/components'
import type { NearbyCustomer } from '../../types'
import Avatar from '../Avatar'
import Tag from '../Tag'
import './index.scss'

interface NearbyCustomerRowProps {
  customer: NearbyCustomer
  onViewTap?: (customer: NearbyCustomer) => void
  onNavigateTap?: (customer: NearbyCustomer) => void
}

// 附近客户行 —— 03 文档 5D：名称/等级/标签/距离/未联系提示 + 查看/导航
export default function NearbyCustomerRow({ customer, onViewTap, onNavigateTap }: NearbyCustomerRowProps) {
  return (
    <View className='nearby-row'>
      <Avatar name={customer.name} size='md' />
      <View className='nearby-row__info'>
        <View className='nearby-row__title-line'>
          <Text className='nearby-row__name'>{customer.name}</Text>
        </View>
        <View className='nearby-row__tags'>
          <Tag variant={customer.level === 'A' ? 'level-a' : 'level-b'}>
            {customer.level === 'A' ? 'A类客户' : `${customer.level}类客户`}
          </Tag>
          {customer.tags.map((t) => <Tag key={t}>{t}</Tag>)}
        </View>
        <View className='nearby-row__meta'>
          <Image className='nearby-row__pin' src={require('../../assets/icons/pin-gray.png')} />
          <Text className='nearby-row__distance'>{customer.distanceLabel}</Text>
          <Text className='nearby-row__divider'>|</Text>
          <Text className='nearby-row__hint'>{customer.hint}</Text>
        </View>
      </View>
      <View className='nearby-row__actions'>
        <View className='nearby-row__btn nearby-row__btn--view' onClick={() => onViewTap?.(customer)}>
          <Text className='nearby-row__btn-text nearby-row__btn-text--view'>查看</Text>
        </View>
        <View className='nearby-row__btn nearby-row__btn--nav' onClick={() => onNavigateTap?.(customer)}>
          <Image className='nearby-row__btn-icon' src={require('../../assets/icons/navigate-white.png')} />
          <Text className='nearby-row__btn-text nearby-row__btn-text--nav'>导航</Text>
        </View>
      </View>
    </View>
  )
}
