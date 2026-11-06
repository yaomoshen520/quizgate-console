/** 时间只在这里格式化一次，报表页和概览页共用同一套读法。 */
export function absolute(ms: bigint): string {
  return new Date(Number(ms)).toLocaleString('zh-CN', { hour12: false })
}

/**
 * 相对时间按"家长能一眼判断设备还活着吗"来分档：分钟级给到分，天级不再给分钟。
 * 服务端时间戳可能来自未来（时钟漂移），负数一律当"刚刚"，不显示"3 分钟后"。
 */
export function relative(ms: bigint, now: number = Date.now()): string {
  if (ms === 0n) return '从未上报'
  const delta = now - Number(ms)
  if (delta < 0) return '刚刚'
  const minutes = Math.floor(delta / 60000)
  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes} 分钟前`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} 小时前`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days} 天前`
  return absolute(ms).slice(0, 10)
}
