// 返回 T | Promise<T>：{#await} 对已缓存的模块直接按值解析
export function lazyModule<T>(loader: () => Promise<T>): () => Promise<T> | T {
  let module: T | undefined
  let promise: Promise<T> | undefined
  return () => module ?? (promise ??= loader().then((loaded) => { module = loaded; return loaded }))
}
