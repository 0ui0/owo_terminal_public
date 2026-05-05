const typeMap = {
  string: '文本',
  number: '数字',
  boolean: '布尔',
  object: '对象',
  array: '数组',
}

const ruleMap = {
  min: '最小',
  max: '最大',
  integer: '整数',
  less: '小于',
  greater: '大于',
  uri: 'URI地址',
  email: '邮箱',
}

export default function joiToText(joiSchema, indent = "") {
  if (!joiSchema) return ""
  
  // 支持传入原始 Joi 对象或其 describe() 后的结果
  const desc = typeof joiSchema.describe === 'function' ? joiSchema.describe() : joiSchema
  
  // 获取单个节点的元数据描述 (类型, 必填性, 约束)
  const getNodeMeta = (val, parentObj = null, key = null) => {
    const rawType = val.type
    const translatedType = typeMap[rawType] || rawType
    
    let req = "选填"
    if (val.flags?.presence === 'required') {
      req = "必填"
    } else if (parentObj?.required && Array.isArray(parentObj.required) && parentObj.required.includes(key)) {
      req = "必填"
    }

    const meta = [translatedType, req]
    
    // 默认值
    const defaultValue = val.flags?.default !== undefined ? val.flags.default : val.default
    if (defaultValue !== undefined) {
      meta.push(`默认:${JSON.stringify(defaultValue)}`)
    }

    const rules = []
    if (val.rules) {
      for (const rule of val.rules) {
        let arg = rule.args !== undefined ? rule.args : rule.arg
        if (arg && typeof arg === 'object' && arg.limit !== undefined) arg = arg.limit
        
        let ruleName = ruleMap[rule.name] || rule.name
        let unit = ''

        if (rawType === 'string') {
          if (rule.name === 'min') ruleName = '最少'
          if (rule.name === 'max') ruleName = '最多'
          unit = '字'
        }
        if (rule.name === 'pattern' || rule.name === 'regex') {
          ruleName = '正则'
          arg = rule.args?.regex || rule.arg?.regex || arg
        }

        // 特殊处理 has 规则
        if (rule.name === 'has' && arg?.schema?.keys) {
          const hasDesc = []
          for (const [hk, hv] of Object.entries(arg.schema.keys)) {
            if (hv.allow && hv.allow.length > 0) {
              hasDesc.push(`${hk}:[${hv.allow.join('|')}]`)
            } else {
              hasDesc.push(`${hk}:${hv.type}`)
            }
          }
          rules.push(`强制包含元素需满足:{${hasDesc.join(', ')}}`)
          continue
        }

        // 避免直接暴露 options/args 等敏感词
        const cleanArg = (a) => {
          if (a && typeof a === 'object') {
            const res = {}
            for (const [k, v] of Object.entries(a)) {
              const safeK = k === 'options' || k === 'args' || k === 'arg' ? '参数' : k
              res[safeK] = v
            }
            return JSON.stringify(res)
          }
          return typeof a === 'string' ? a : JSON.stringify(a)
        }

        rules.push(`${ruleName}${arg !== undefined ? cleanArg(arg) + unit : ''}`)
      }
    }

    if (rules.length > 0) {
      meta.push(`填写范围:${rules.join(' ')}`)
    }
    
    if (val.minLength !== undefined) meta.push(`最短:${val.minLength}`)
    if (val.maxLength !== undefined) meta.push(`最长:${val.maxLength}`)
    if (val.minimum !== undefined) meta.push(`最小:${val.minimum}`)
    if (val.maximum !== undefined) meta.push(`最大:${val.maximum}`)
    if (val.enum && Array.isArray(val.enum)) {
      meta.push(`可选:[${val.enum.join('|')}]`)
    }

    if (val.allow && val.allow.length > 0) {
      const enums = val.allow.filter(v => v !== null && v !== "" && typeof v !== 'object')
      if (enums.length === 1) {
        meta.push(`固定值:${enums[0]}`)
      } else if (enums.length > 0) {
        meta.push(`可选:[${enums.join('|')}]`)
      }
    }
    
    // --- 暴力直通：收集未处理的陌生字段 ---
    const handledKeys = new Set(['type', 'flags', 'rules', 'items', 'keys', 'allow', 'properties', 'required', 'description', 'minLength', 'maxLength', 'minimum', 'maximum', 'enum', 'matches', 'invalid'])
    
    // 1. 处理未识别的 rules (逻辑已在上面循环中体现，此处仅作补丁说明)
    
    // 2. 处理未识别的 flags
    if (val.flags) {
      const handledFlags = new Set(['presence', 'description', 'default', 'label'])
      for (const [fk, fv] of Object.entries(val.flags)) {
        if (!handledFlags.has(fk) && fv !== undefined) {
          meta.push(`${fk}:${JSON.stringify(fv)}`)
        }
      }
    }

    // 3. 处理顶级未识别字段
    for (const [vk, vv] of Object.entries(val)) {
      if (!handledKeys.has(vk) && vv !== undefined && vv !== null && (typeof vv === 'string' || typeof vv === 'number' || typeof vv === 'boolean')) {
        meta.push(`${vk}:${JSON.stringify(vv)}`)
      }
    }

    return meta
  }

  const format = (obj, currentIndent) => {
    const lines = []
    
    // 如果是 alternatives (多选一)，特殊处理
    if (obj.type === 'alternatives' && obj.matches) {
      const altNames = obj.matches.map(m => typeMap[m.schema?.type] || m.schema?.type || '未知')
      return `${currentIndent}(多选一: ${altNames.join(' | ')})`
    }

    const keys = obj.keys || obj.properties
    if (keys) {
      for (const [key, val] of Object.entries(keys)) {
        const rawType = val.type
        const meta = getNodeMeta(val, obj, key)
        const cleanInfo = (val.flags?.description || val.description || "").replace(/\s+/g, " ").trim()
        
        lines.push(`${currentIndent}- ${key} (${meta.join(', ')}): ${cleanInfo}`)
        
        if (rawType === 'object') {
          const subObj = format(val, currentIndent + "  ")
          if (subObj) lines.push(subObj)
        } else if (rawType === 'array' && (val.items || val.items?.[0])) {
          const itemSchema = Array.isArray(val.items) ? val.items[0] : val.items
          const itemMeta = getNodeMeta(itemSchema)
          const itemInfo = (itemSchema.flags?.description || itemSchema.description || "").replace(/\s+/g, " ").trim()
          
          let line = `${currentIndent}  [数组项] (${itemMeta.join(', ')})`
          if (itemInfo) line += `: ${itemInfo}`
          lines.push(line)
          
          const subArr = format(itemSchema, currentIndent + "    ")
          if (subArr) lines.push(subArr)
        }
      }
    }
    return lines.join("\n")
  }
  
  return format(desc, indent)
}
