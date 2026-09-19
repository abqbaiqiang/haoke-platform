import { View, Text, Image } from '@tarojs/components'
import type { CustomerListItem } from '../../types'
import Avatar from '../Avatar'
import Tag from '../Tag'
import './index.scss'

interface CustomerRowProps {
  customer: CustomerListItem
  onTap?: (customer: CustomerListItem) => void
}

// 客户卡片行 —— 03 文档第七节字段，列表手机号脱敏
export default function CustomerRow({ customer, onTap }: CustomerRowProps) {
  return (
    <View className='customer-row' onClick={() => onTap?.(customer)}>
      <View className='customer-row__main'>
        <Avatar name={customer.name} size='md' />
        <View className='customer-row__info'>
          <View className='customer-row__title-line'>
            <Text className='customer-row__name'>{customer.name}</Text>
            <Tag variant={customer.level === 'A' ? 'level-a' : 'level-b'}>
              {customer.level === 'A' ? 'A类客户' : `${customer.level}类客户`}
            </Tag>
          </View>
          <View className='customer-row__tags'>
            {customer.tags.map((t) => <Tag key={t}>{t}</Tag>)}
          </View>
          {customer.primaryContact && (
            <View className='customer-row__contact'>
              <Image className='customer-row__contact-icon' src={require('../../assets/icons/person-gray.png')} />
              <Text className='customer-row__contact-name'>{customer.primaryContact.name}</Text>
              <Text className='customer-row__contact-mobile'>{customer.primaryContact.mobileMasked}</Text>
            </View>
          )}
        </View>
      </View>
      <View className='customer-row__footer'>
        <Text className='customer-row__footer-item'>上次联系：{customer.lastFollowupAt}</Text>
        <Text className='customer-row__footer-item'>跟进状态：{customer.followupStatus}</Text>
        {customer.nextFollowupAt && (
          <Text className='customer-row__footer-item customer-row__footer-item--urgent'>
            下次：{customer.nextFollowupAt}
          </Text>
        )}
      </View>
    </View>
  )
}
