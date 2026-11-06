import { reactive } from 'vue'
import { rpc } from '../api/rpc'
import {
  ListAlertsReplySchema,
  ListAlertsRequestSchema,
  type GateAlertItem,
  type OfflineChildItem,
} from '../gen/quizgate_pb'
import { session } from './session'

/**
 * 顶部红条和告警页读的都是这一份快照。
 * 两处各发一次请求会出现"红条说失联、列表却说心跳正常"——同一个应答里的两份数据才保证同一时刻。
 */
export const alerts = reactive({
  /** 设备亲口报回来的动手记录：那一刻它还在运行，才说得出这句话。 */
  items: [] as GateAlertItem[],
  /** 服务端反推的失联：只能说到"多久没出现"，说不出为什么。 */
  offline: [] as OfflineChildItem[],
  loaded: false,
  error: '',

  get count(): number {
    return this.items.length + this.offline.length
  },

  /** 失联判定阈值跟着应答走，界面不自己抄一个数。 */
  get offlineAfterMs(): bigint {
    return this.offline.length > 0 ? this.offline[0].offlineAfterMs : 0n
  },
})

const POLL_MS = 60_000
let timer: ReturnType<typeof setInterval> | undefined

export async function refreshAlerts(): Promise<void> {
  if (session.parentToken === '') return
  try {
    const reply = await rpc(
      '/parent/list-alerts',
      ListAlertsRequestSchema,
      ListAlertsReplySchema,
      {},
      session.parentToken,
    )
    alerts.items = [...reply.alerts]
    alerts.offline = [...reply.offlineChildren]
    alerts.loaded = true
    alerts.error = ''
  } catch (e) {
    // 红条不能因为自己取不到就消失：那正是家长最该看到它的时候。
    alerts.error = e instanceof Error ? e.message : String(e)
  }
}

/**
 * 登录期间一直转：家长挂着这一页，孩子在那头关无障碍，
 * 不该要他手动刷新才知道。间隔和服务端心跳节流同量级。
 */
export function startPolling(): void {
  if (timer !== undefined) return
  void refreshAlerts()
  timer = setInterval(() => void refreshAlerts(), POLL_MS)
}

export function stopPolling(): void {
  if (timer === undefined) return
  clearInterval(timer)
  timer = undefined
  alerts.items = []
  alerts.offline = []
  alerts.loaded = false
  alerts.error = ''
}
