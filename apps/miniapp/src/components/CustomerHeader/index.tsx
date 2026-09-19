import { View, Text, Image } from '@tarojs/components'
import type { CustomerListItem } from '../../types'
import Avatar from '../Avatar'
import Tag from '../Tag'
import './index.scss'

interface CustomerHeaderProps {
  customer: CustomerListItem
  address?: string
  contactCount?: number
  onCallTap?: () => void
  onNavigateTap?: () => void
  onContactsTap?: () => void
}

// 客户详情头部 —— 03 文档 3A/3B：身份区 + 三个快捷按钮
export default function CustomerHeader({
  customer,
  address,
  contactCount,
  onCallTap,
  onNavigateTap,
  onContactsTap,
}: CustomerHeaderProps) {
  const contact = customer.primaryContact
  return (
    <View className='customer-header'>
      <View className='customer-header__id'>
        <Avatar name={customer.name} size='lg' />
        <View className='customer-header__info'>
          <View className='customer-header__title-line'>
            <Text className='customer-header__name'>{customer.name}</Text>
            <Tag variant={customer.level === 'A' ? 'level-a' : 'level-b'}>
              {customer.level === 'A' ? 'A类客户' : `${customer.level}类客户`}
            </Tag>
          </View>
          <View className='customer-header__tags'>
            {customer.tags.map((t) => <Tag key={t}>{t}</Tag>)}
          </View>
          {contact && (
            <View className='customer-header__contact'>
              <Text className='customer-header__contact-text'>
                {contact.name}{contact.role ? ` · ${contact.role}` : ''}
              </Text>
              <Text className='customer-header__contact-mobile'>{contact.mobileMasked}</Text>
            </View>
          )}
        </View>
      </View>

      <View className='customer-header__actions'>
        <View className='customer-header__action' onClick={onCallTap}>
          <Image className='customer-header__action-icon' src={require('../../assets/icons/phone.png')} />
          <Text className='customer-header__action-text'>拨打电话</Text>
        </View>
        <View className='customer-header__action' onClick={onNavigateTap}>
          <Image className='customer-header__action-icon' src={require('../../assets/icons/navigate.png')} />
          <Text className='customer-header__action-text'>导航前往</Text>
          {address && <Text className='customer-header__action-sub'>{address}</Text>}
        </View>
        <View className='customer-header__action' onClick={onContactsTap}>
          <Image className='customer-header__action-icon' src={require('../../assets/icons/contacts.png')} />
          <Text className='customer-header__action-text'>全部联系人</Text>
          {contactCount != null && <Text className='customer-header__action-sub'>共 {contactCount} 位联系人</Text>}
        </View>
      </View>
    </View>
  )
}
