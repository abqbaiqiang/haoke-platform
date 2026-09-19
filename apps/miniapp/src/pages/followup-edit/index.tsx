import { View, Text, Image, Input, Textarea } from '@tarojs/components'
import { useState } from 'react'
import Avatar from '../../components/Avatar'
import Tag from '../../components/Tag'
import { mockFollowupEdit } from '../../services/mock'
import './index.scss'

const INPUT_METHODS = [
  { key: 'voice', label: '语音记录', sub: '随时记录 · 自动转写', icon: 'mic-white' },
  { key: 'photo', label: '拍照上传', sub: '拍合同、展品、现场等', icon: 'camera' },
  { key: 'text', label: '手动输入', sub: '键入文字 · 快速记录', icon: 'pen' },
] as const

// 记录跟进 —— 03 文档页面四：客户上下文 → 联系人/方式/时间 → 三输入入口 → 转写 → AI 整理 → 附件 → 保存
// Phase 4 接移动跟进写入（底层复用 save_followup）；Phase 5/6 接媒体与转写
export default function FollowupEdit() {
  const { customer, contacts, interactionMethods, aiDraft, attachments } = mockFollowupEdit
  const [contactId, setContactId] = useState(contacts[0].id)
  const [method, setMethod] = useState(interactionMethods[0])
  const [occurredAt, setOccurredAt] = useState(mockFollowupEdit.occurredAtLabel)
  const [transcript, setTranscript] = useState(mockFollowupEdit.transcriptSample)

  return (
    <View className='followup-edit'>
      <View className='followup-edit__body'>
        <View className='followup-edit__context'>
          <Avatar name={customer.name} size='md' />
          <View className='followup-edit__context-info'>
            <Text className='followup-edit__context-name'>{customer.name}</Text>
            <View className='followup-edit__context-tags'>
              {customer.tags.map((t) => <Tag key={t}>{t}</Tag>)}
            </View>
            <Text className='followup-edit__context-contact'>{customer.primaryContact?.name} {customer.primaryContact?.mobileMasked}</Text>
          </View>
          <Text className='followup-edit__context-link'>查看客户 ›</Text>
        </View>

        <View className='followup-edit__form-card'>
          <View className='followup-edit__row'>
            <Text className='followup-edit__row-label'>联系人</Text>
            <View className='followup-edit__chips'>
              {contacts.map((c) => (
                <View
                  key={c.id}
                  className={`followup-edit__chip ${contactId === c.id ? 'followup-edit__chip--active' : ''}`}
                  onClick={() => setContactId(c.id)}
                >
                  <Text className={`followup-edit__chip-text ${contactId === c.id ? 'followup-edit__chip-text--active' : ''}`}>{c.name}</Text>
                </View>
              ))}
            </View>
          </View>
          <View className='followup-edit__row'>
            <Text className='followup-edit__row-label'>沟通方式</Text>
            <View className='followup-edit__chips'>
              {interactionMethods.map((m) => (
                <View
                  key={m}
                  className={`followup-edit__chip ${method === m ? 'followup-edit__chip--active' : ''}`}
                  onClick={() => setMethod(m)}
                >
                  <Text className={`followup-edit__chip-text ${method === m ? 'followup-edit__chip-text--active' : ''}`}>{m}</Text>
                </View>
              ))}
            </View>
          </View>
          <View className='followup-edit__row'>
            <Text className='followup-edit__row-label'>拜访时间</Text>
            <View className='followup-edit__time'>
              <Input className='followup-edit__time-input' value={occurredAt} onInput={(e) => setOccurredAt(e.detail.value)} />
              <Image className='followup-edit__time-icon' src={require('../../assets/icons/calendar.png')} />
            </View>
          </View>
        </View>

        <View className='followup-edit__methods'>
          {INPUT_METHODS.map((m) => (
            <View key={m.key} className={`followup-edit__method ${m.key === 'voice' ? 'followup-edit__method--primary' : ''}`}>
              <Image className='followup-edit__method-icon' src={require(`../../assets/icons/${m.icon}.png`)} />
              <Text className='followup-edit__method-label'>{m.label}</Text>
              <Text className='followup-edit__method-sub'>{m.sub}</Text>
            </View>
          ))}
        </View>

        <View className='followup-edit__card'>
          <View className='followup-edit__card-head'>
            <Text className='followup-edit__card-title'>转写文字（实时）</Text>
            <View className='followup-edit__card-extra'>
              <Image className='followup-edit__card-extra-icon' src={require('../../assets/icons/refresh.png')} />
              <Text className='followup-edit__card-extra-text'>重新识别</Text>
            </View>
          </View>
          <Textarea
            className='followup-edit__transcript'
            value={transcript}
            maxlength={2000}
            onInput={(e) => setTranscript(e.detail.value)}
          />
          <Text className='followup-edit__count'>{transcript.length}/2000</Text>
        </View>

        <View className='followup-edit__card'>
          <View className='followup-edit__card-head'>
            <Text className='followup-edit__card-title'>AI 智能整理</Text>
            <Text className='followup-edit__card-note'>AI帮你提炼重点，节省整理时间</Text>
            <View className='followup-edit__card-extra'>
              <Image className='followup-edit__card-extra-icon' src={require('../../assets/icons/refresh.png')} />
              <Text className='followup-edit__card-extra-text'>重新生成</Text>
            </View>
          </View>
          <View className='followup-edit__ai'>
            <View className='followup-edit__ai-row'>
              <Text className='followup-edit__ai-label'>沟通摘要</Text>
              <Text className='followup-edit__ai-value'>{aiDraft.communicationSummary}</Text>
            </View>
            <View className='followup-edit__ai-row'>
              <Text className='followup-edit__ai-label'>客户需求</Text>
              <Text className='followup-edit__ai-value'>{aiDraft.customerNeeds}</Text>
            </View>
            <View className='followup-edit__ai-row'>
              <Text className='followup-edit__ai-label'>下一步行动</Text>
              <Text className='followup-edit__ai-value'>{aiDraft.nextActions}</Text>
            </View>
            <View className='followup-edit__ai-row'>
              <Text className='followup-edit__ai-label'>下次联系日期</Text>
              <Text className='followup-edit__ai-value'>{aiDraft.suggestedNextFollowupAt}</Text>
            </View>
          </View>
        </View>

        <View className='followup-edit__card'>
          <View className='followup-edit__card-head'>
            <Text className='followup-edit__card-title'>附件（{attachments.length}）</Text>
            <Text className='followup-edit__card-extra-text'>添加附件 ›</Text>
          </View>
          <View className='followup-edit__attachments'>
            {attachments.map((a) => (
              <View className='followup-edit__attachment' key={a.id}>
                {a.kind === 'image' ? (
                  <View className='followup-edit__attachment-thumb' />
                ) : (
                  <View className='followup-edit__attachment-audio'>
                    <Image className='followup-edit__attachment-audio-icon' src={require('../../assets/icons/mic-white.png')} />
                    <Text className='followup-edit__attachment-audio-duration'>{a.durationSec}"</Text>
                  </View>
                )}
                <Text className='followup-edit__attachment-name'>{a.name}</Text>
              </View>
            ))}
          </View>
        </View>
      </View>

      <View className='followup-edit__footer'>
        <View className='followup-edit__save followup-edit__save--primary'>
          <Text className='followup-edit__save-text followup-edit__save-text--primary'>保存并生成待办</Text>
        </View>
        <View className='followup-edit__save'>
          <Text className='followup-edit__save-text'>仅保存记录</Text>
        </View>
      </View>
    </View>
  )
}
