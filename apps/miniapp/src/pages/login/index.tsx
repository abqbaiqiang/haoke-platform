import { View, Text, Input, Button } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useState } from 'react'
import './index.scss'

// 登录页 —— 技术必需页：用户名+密码，无注册/忘记密码（03 文档第七节）
// Phase 2 接 /api/mobile/auth/login；当前仅静态骨架
export default function Login() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')

  const handleLogin = () => {
    Taro.switchTab({ url: '/pages/workbench/index' })
  }

  return (
    <View className='login'>
      <View className='login__head'>
        <Text className='login__brand'>好客齐鲁经营管理平台</Text>
        <Text className='login__slogan'>销售移动工作台</Text>
      </View>
      <View className='login__form'>
        <View className='login__field'>
          <Text className='login__label'>用户名</Text>
          <Input
            className='login__input'
            placeholder='请输入用户名'
            value={username}
            onInput={(e) => setUsername(e.detail.value)}
          />
        </View>
        <View className='login__field'>
          <Text className='login__label'>密码</Text>
          <Input
            className='login__input'
            password
            placeholder='请输入密码'
            value={password}
            onInput={(e) => setPassword(e.detail.value)}
          />
        </View>
        <Button className='login__submit' onClick={handleLogin}>
          登 录
        </Button>
        <Text className='login__hint'>账号由管理员统一分配，如有问题请联系管理员</Text>
      </View>
    </View>
  )
}
