// quickOpen 搜索参数配置弹窗组件
// 严格遵循 App开发指南、Notice说明 与 样式设计指南规范

export default ({ m, Notice, Box, getColor, trs, appId, searchConfig, onConfigApplied }) => {
  const RegexSwitch = new Box()
  const CaseSwitch = new Box()
  const WordSwitch = new Box()
  const ExcludeInput = new Box()

  RegexSwitch.data.value = searchConfig.useRegex
  CaseSwitch.data.value = searchConfig.caseSensitive
  WordSwitch.data.value = searchConfig.wholeWord
  ExcludeInput.data.value = searchConfig.excludePatterns

  Notice.launch({
    sign: "quickopen_search_config_" + appId,
    appType: "quickOpen",
    useMinus: false,
    tip: trs("快速打开/搜索配置/标题",
      {
        cn: "搜索参数配置",
        en: "Search Configuration"
      }
    ),
    // 💡 遵循 Notice说明.md：点击标题栏确认 Check 按钮时保存配置并触发回调
    confirm: (box, closeTabFn) => {
      searchConfig.useRegex = RegexSwitch.data.value
      searchConfig.caseSensitive = CaseSwitch.data.value
      searchConfig.wholeWord = WordSwitch.data.value
      searchConfig.excludePatterns = ExcludeInput.data.value

      if (typeof onConfigApplied === "function") {
        onConfigApplied()
      }
      // 返回 undefined 自动平滑关闭弹窗
    },
    content: {
      view: (v) => {
        return m("",
          {
            style: {
              padding: "1.5rem",
              minWidth: "26rem",
              display: "flex",
              flexDirection: "column",
              gap: "1.2rem"
            }
          },
          [
            // 正则开关
            m("",
              {
                style: {
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between"
                }
              },
              [
                m("span",
                  trs("快速打开/搜索配置/正则",
                    {
                      cn: "启用正则表达式 (Regex)",
                      en: "Enable Regular Expression (Regex)"
                    }
                  )
                ),
                m(RegexSwitch,
                  {
                    isSwitch: true,
                    color: "main"
                  }
                )
              ]
            ),

            // 大小写开关
            m("",
              {
                style: {
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between"
                }
              },
              [
                m("span",
                  trs("快速打开/搜索配置/大小写",
                    {
                      cn: "区分大小写 (Case Sensitive)",
                      en: "Case Sensitive"
                    }
                  )
                ),
                m(CaseSwitch,
                  {
                    isSwitch: true,
                    color: "main"
                  }
                )
              ]
            ),

            // 全字匹配开关
            m("",
              {
                style: {
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between"
                }
              },
              [
                m("span",
                  trs("快速打开/搜索配置/全字",
                    {
                      cn: "全字匹配 (Whole Word)",
                      en: "Whole Word"
                    }
                  )
                ),
                m(WordSwitch,
                  {
                    isSwitch: true,
                    color: "main"
                  }
                )
              ]
            ),

            // 排除名单 (纯净 Box，除外边距零覆盖)
            m("",
              {
                style: {
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.6rem"
                }
              },
              [
                m("span",
                  {
                    style: {
                      opacity: 0.8
                    }
                  },
                  trs("快速打开/搜索配置/排除名单",
                    {
                      cn: "排除名单 (Glob 模式，逗号分隔):",
                      en: "Exclude Patterns (Glob patterns, comma separated):"
                    }
                  )
                ),
                m(ExcludeInput,
                  {
                    tagName: "input",
                    color: "main",
                    isBlock: true,
                    style: {
                      margin: "0.4rem 0"
                    }
                  }
                )
              ]
            )
          ]
        )
      }
    }
  })
}
