import { View, Text, Map } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useState } from 'react'
import NearbyCustomerRow from '../../components/NearbyCustomerRow'
import { mockNearby, mockNearbyRadiusOptions } from '../../services/mock'
import './index.scss'

const CENTER = { latitude: 36.666, longitude: 117.04 }

// 附近客户 —— 03 文档页面五：地图（仅权限内客户 Marker）→ 半径选择 → 按距离列表 → openLocation 导航
// Phase 1 骨架用 mock 坐标；Phase 7 接 /api/mobile/nearby（scope first + bounding box + haversine）。
// 顺路推荐按 DEV_LOG 风险⑥降级为纯提示（PRD：V1 不做路线优化，无"查看路线"入口）。
export default function Nearby() {
  const [radiusIdx, setRadiusIdx] = useState(1)

  const markers = mockNearby.map((c, i) => ({
    id: i,
    latitude: c.latitude,
    longitude: c.longitude,
    title: c.name,
    iconPath: require('../../assets/icons/pin.png'),
    width: 30,
    height: 30,
    callout: {
      content: c.name.slice(0, 8),
      color: '#18181b',
      bgColor: '#ffffff',
      borderColor: '#e4e4e7',
      borderWidth: 1,
      borderRadius: 4,
      padding: 4,
      fontSize: 10,
      anchorX: 0,
      anchorY: 0,
      textAlign: 'center' as const,
      display: 'ALWAYS' as const,
    },
  }))

  const openCustomer = (id: string) => {
    Taro.navigateTo({ url: `/pages/customer-detail/index?id=${id}` })
  }

  const navigate = (c: { latitude: number; longitude: number; name: string }) => {
    // 微信内置地图导航，不自研路线算法（docs/miniapp/03 第五节 E）
    Taro.openLocation({ latitude: c.latitude, longitude: c.longitude, name: c.name, scale: 16 })
  }

  return (
    <View className='nearby'>
      <View className='nearby__map-wrap'>
        <Map
          className='nearby__map'
          latitude={CENTER.latitude}
          longitude={CENTER.longitude}
          scale={13}
          markers={markers}
          showLocation
          onError={() => { /* 地图组件异常时列表仍可用（Phase 7 统一处理） */ }}
        />
        <View className='nearby__radius'>
          {mockNearbyRadiusOptions.map((r, i) => (
            <View
              key={r}
              className={`nearby__radius-item ${radiusIdx === i ? 'nearby__radius-item--active' : ''}`}
              onClick={() => setRadiusIdx(i)}
            >
              <Text className={`nearby__radius-text ${radiusIdx === i ? 'nearby__radius-text--active' : ''}`}>{r}</Text>
            </View>
          ))}
        </View>
      </View>

      <View className='nearby__sheet'>
        <View className='nearby__sheet-head'>
          <Text className='nearby__sheet-title'>附近客户</Text>
          <Text className='nearby__sheet-sub'>基于您当前的位置，发现周边已有客户</Text>
        </View>
        <View className='nearby__hint'>
          <Text className='nearby__hint-text'>附近有 2 个 A 类客户可拜访</Text>
        </View>
        <View className='nearby__list'>
          {mockNearby.map((c) => (
            <NearbyCustomerRow
              key={c.id}
              customer={c}
              onViewTap={(item) => openCustomer(item.id)}
              onNavigateTap={(item) => navigate(item)}
            />
          ))}
        </View>
      </View>
    </View>
  )
}
