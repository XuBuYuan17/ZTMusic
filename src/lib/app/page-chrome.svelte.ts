/**
 * 页面 → 外壳的「页面操作」契约。
 *
 * 页面声明自己的标题、返回行为和当前可用操作；外壳决定把这些操作中的哪些
 * 放到顶部栏，页面自己负责把 `content` 类操作放进内容区。两边调用的是同一份
 * 函数引用，不再靠「查 DOM + 派发自定义事件」串起来。
 *
 * 生效规则：后注册者优先；页面离开（`active` 变 false）时注销，外壳立刻回到
 * 读不到任何操作的状态，因此不会残留上一个资源（例如歌单 A）的操作。
 * 外壳自身只有一个实例，host 跟着外壳组件创建，不进全局。
 */
import { getContext, setContext } from 'svelte'

/** 外壳可以放在顶部栏；页面自己放在内容区 */
export type PageActionPlacement = 'top' | 'content'

export interface PageAction {
  id: string
  label: string
  icon: string
  placement: PageActionPlacement
  disabled?: boolean
  run: () => void
}

export interface PageChrome {
  title: string
  back: () => void
  actions: PageAction[]
}

export interface PageChromeHost {
  /** 页面声明自己那套；返回注销函数（页面销毁或离开时调用） */
  register(chrome: () => PageChrome): () => void
  /** 当前生效的一套；没有页面注册时为 null */
  readonly current: PageChrome | null
}

export function createPageChromeHost(): PageChromeHost {
  let entries = $state<Array<() => PageChrome>>([])
  return {
    register(chrome) {
      entries = [...entries, chrome]
      // 只移除自己这一条：注销顺序与注册顺序不一致时不会误删别人的
      return () => { entries = entries.filter(entry => entry !== chrome) }
    },
    get current() {
      const factory = entries[entries.length - 1]
      return factory ? factory() : null
    },
  }
}

const KEY = Symbol('page-chrome')

export function setPageChromeHost(host: PageChromeHost): void {
  setContext(KEY, host)
}

export function getPageChromeHost(): PageChromeHost | null {
  return getContext<PageChromeHost | null>(KEY) ?? null
}
