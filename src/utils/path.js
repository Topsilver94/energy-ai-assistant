/**
 * 轻量路径读写工具：专家参数面板用 'pv.capexPerWatt' 这类 path 字符串
 * 绑定嵌套配置对象，避免为每个字段手写 onChange。
 * 不可变写：setByPath 沿路径浅拷贝，原对象不被修改。
 */

export const getByPath = (obj, path) =>
  path.split('.').reduce((acc, key) => (acc == null ? acc : acc[key]), obj)

export const setByPath = (obj, path, value) => {
  const keys = path.split('.')
  const next = { ...obj }
  let cursor = next
  for (let i = 0; i < keys.length - 1; i += 1) {
    cursor[keys[i]] = { ...cursor[keys[i]] }
    cursor = cursor[keys[i]]
  }
  cursor[keys[keys.length - 1]] = value
  return next
}
