import { defineConfig, type UserConfigExport } from '@tarojs/cli'

import devConfig from './dev'
import prodConfig from './prod'

// docs/miniapp/02 第五节：designWidth 750，统一 rpx 换算，不在页面混用尺度
export default defineConfig(async (merge, { command, mode }) => {
  const config: UserConfigExport = {
    projectName: 'haoke-miniapp',
    date: '2026-9-19',
    designWidth: 750,
    deviceRatio: {
      375: 2,
      640: 2.34 / 2,
      750: 1,
      828: 1.81 / 2,
    },
    sourceRoot: 'src',
    outputRoot: 'dist',
    plugins: [],
    defineConstants: {},
    copy: {
      patterns: [],
      options: {},
    },
    framework: 'react',
    compiler: 'webpack5',
    mini: {
      postcss: {
        pxtransform: {
          enable: true,
          config: {},
        },
        cssModules: {
          enable: false,
        },
      },
    },
    h5: {},
  }

  if (process.env.NODE_ENV === 'development') {
    return merge(config, await devConfig)
  }
  return merge(config, await prodConfig)
})
