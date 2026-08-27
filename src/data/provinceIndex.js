/**
 * 分省首字母索引（公开数据抽屉用）——省名 → 拼音首字母映射 + 分组助手。
 *
 * 用途：把分省参数组（利用小时/电价/峰谷价差）的字段按首字母分组渲染，
 * 配合抽屉右缘浮动索引条实现点击定位。字典序按 A→Z，未收录的省名归「#」组置尾
 * （新增省份时仅需补本映射，面板自动成组）。
 */

// 大陆 31 个省级单位（22 省 + 5 自治区 + 4 直辖市）的拼音首字母
const PROVINCE_INITIAL = {
  安徽: 'A',
  北京: 'B',
  重庆: 'C',
  福建: 'F',
  甘肃: 'G',
  广东: 'G',
  广西: 'G',
  贵州: 'G',
  海南: 'H',
  河北: 'H',
  河南: 'H',
  黑龙江: 'H',
  湖北: 'H',
  湖南: 'H',
  吉林: 'J',
  江苏: 'J',
  江西: 'J',
  辽宁: 'L',
  内蒙古: 'N',
  宁夏: 'N',
  青海: 'Q',
  山东: 'S',
  山西: 'S',
  陕西: 'S',
  上海: 'S',
  四川: 'S',
  天津: 'T',
  西藏: 'X',
  新疆: 'X',
  云南: 'Y',
  浙江: 'Z',
}

export const provinceInitial = (name) => PROVINCE_INITIAL[name] ?? '#'

/**
 * 按首字母分组并按字母序输出；同字母内保持传入顺序（即注册表的区域序）。
 * @param {Array<{label: string}>} fields 字段列表（label 为省名）
 * @returns {Array<{letter: string, fields: Array}>} A→Z，「#」置尾
 */
export const groupFieldsByInitial = (fields) => {
  const buckets = new Map()
  fields.forEach((field) => {
    const letter = provinceInitial(field.label)
    if (!buckets.has(letter)) buckets.set(letter, [])
    buckets.get(letter).push(field)
  })
  return [...buckets.entries()]
    .sort(([a], [b]) => (a === '#' ? 1 : b === '#' ? -1 : a.localeCompare(b)))
    .map(([letter, group]) => ({ letter, fields: group }))
}
