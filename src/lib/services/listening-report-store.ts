import { listeningDB } from '../db/listening.ts'
import { initializeListening } from './listening-recorder.ts'
import { LISTENING_RETENTION_DAYS } from './listening-report.ts'

let compacted = false

export async function loadListeningReport() {
  await initializeListening()
  const data = await listeningDB.read()
  // 压缩是纯存储优化，失败静默（下次启动再试），不阻塞首屏。
  // 本次返回的是压缩前的行，聚合结果与压缩后完全一致。
  // 每次启动只跑一次：LISTENING_CHANGE 每 5 秒响一次，不守卫就是每 5 秒一次全表 readwrite 扫描
  if (!compacted) {
    compacted = true
    void listeningDB.compact(LISTENING_RETENTION_DAYS).catch(() => {})
  }
  return data
}
