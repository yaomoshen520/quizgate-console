import { reactive } from 'vue'
import type { ChildSummary } from '../gen/quizgate_pb'

const TOKEN_KEY = 'quizgate.parentToken'
const ROLE_KEY = 'quizgate.role'

/**
 * 令牌只放 sessionStorage：关掉标签页就没了，不落 localStorage。
 * 这是后台账号，机器可能是共用的。
 */
export const session = reactive({
  parentToken: sessionStorage.getItem(TOKEN_KEY) ?? '',
  /**
   * 登录回复里的角色，只决定这个标签页挂哪些路由。
   * 服务端每个请求都重新读库里的 role，所以在这里改成 ADMIN 不会放开任何接口——
   * 家长的令牌打到 /api/admin/** 照样 403，这条有 GateFlowTest 的反证用例。
   */
  role: sessionStorage.getItem(ROLE_KEY) ?? '',
  children: [] as ChildSummary[],

  get isAdmin(): boolean {
    return this.role === 'ADMIN'
  },

  get signedIn(): boolean {
    // role 缺失按未登录处理：否则守卫会因为"哪个角色都不匹配"把 /login 和 / 之间弹来弹去。
    return this.parentToken !== '' && this.role !== ''
  },

  signIn(token: string, children: ChildSummary[], role: string) {
    this.parentToken = token
    this.children = children
    this.role = role
    sessionStorage.setItem(TOKEN_KEY, token)
    sessionStorage.setItem(ROLE_KEY, role)
  },

  /** 改口令会作废旧令牌并换发新的，会话里的令牌必须跟着换，不然下一次请求就 401。 */
  setToken(token: string) {
    this.parentToken = token
    sessionStorage.setItem(TOKEN_KEY, token)
  },

  signOut() {
    this.parentToken = ''
    this.children = []
    this.role = ''
    sessionStorage.removeItem(TOKEN_KEY)
    sessionStorage.removeItem(ROLE_KEY)
  },
})
