export default defineAppConfig({
  pages: [
    'pages/login/index',
    'pages/workbench/index',
    'pages/customers/index',
    'pages/customer-detail/index',
    'pages/followup-edit/index',
    'pages/nearby/index',
    'pages/mine/index',
  ],
  window: {
    backgroundTextStyle: 'light',
    navigationBarBackgroundColor: '#f7f7f8',
    navigationBarTitleText: '好客齐鲁',
    navigationBarTextStyle: 'black',
    backgroundColor: '#f7f7f8',
  },
  tabBar: {
    color: '#71717a',
    selectedColor: '#2563eb',
    backgroundColor: '#ffffff',
    borderStyle: 'black',
    list: [
      { pagePath: 'pages/workbench/index', text: '工作台', iconPath: 'assets/tab-work.png', selectedIconPath: 'assets/tab-work-active.png' },
      { pagePath: 'pages/customers/index', text: '客户', iconPath: 'assets/tab-customers.png', selectedIconPath: 'assets/tab-customers-active.png' },
      { pagePath: 'pages/nearby/index', text: '附近', iconPath: 'assets/tab-nearby.png', selectedIconPath: 'assets/tab-nearby-active.png' },
      { pagePath: 'pages/mine/index', text: '我的', iconPath: 'assets/tab-mine.png', selectedIconPath: 'assets/tab-mine-active.png' },
    ],
  },
})
