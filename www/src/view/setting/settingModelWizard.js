import m from "mithril"
import Box from "../common/box.js"
import Tag from "../common/tag.js"
import getColor from "../common/getColor.js"
import Notice from "../common/notice.js"
import FormItem from "../common/FormItem.js"
import AutoForm from "../common/autoForm.js"
import { trs } from "../common/i18n.js"
import settingData from "./settingData.js"
import { AI_PROVIDERS } from "./settingAiProviders.js"

export const ModelWizardModal = (vnode) => {
  const defaultProvider = AI_PROVIDERS[0]
  const formData = {
    providerId: defaultProvider.id,
    providerName: defaultProvider.name,
    url: defaultProvider.url,
    model: defaultProvider.defaultModel,
    name: defaultProvider.name,
    apiKey: "",
    prompt: "",
    preTokens: 1000000
  }

  let submitting = false
  let stepIndex = 0

  // 向导步骤定义（顺序即向导流程）
  const steps = [
    { title: trs("设置/向导/步骤/厂商", { cn: "厂商", en: "Provider" }) },
    { title: trs("设置/向导/步骤/模型", { cn: "模型", en: "Model" }) },
    { title: trs("设置/向导/步骤/地址", { cn: "地址", en: "URL" }) },
    { title: trs("设置/向导/步骤/别名", { cn: "别名", en: "Alias" }) },
    { title: trs("设置/向导/步骤/密钥", { cn: "密钥", en: "Key" }) }
  ]
  const totalSteps = steps.length

  // select 下拉框统一样式
  const selectStyle = {
    width: "100%",
    borderRadius: "0.8rem",
    border: "0.15rem solid " + getColor("gray_1").front + "22",
    background: getColor("gray_3").back,
    color: getColor("gray_1").front,
    outline: "none",
    padding: "0.6rem 1rem",
    cursor: "pointer",
    marginTop: "0.6rem"
  }

  const getActiveProvider = () => {
    return AI_PROVIDERS.find(p => p.id === formData.providerId) || AI_PROVIDERS.find(p => p.id === "custom")
  }

  const close = () => {
    Notice.closeTab(vnode.attrs.noticeConfig)
  }

  const submit = async () => {
    const nameStr = String(formData.name ?? "").trim()
    const modelStr = String(formData.model ?? "").trim()
    const urlStr = String(formData.url ?? "").trim()
    const apiKeyStr = String(formData.apiKey ?? "").trim()

    if (!nameStr) {
      Notice.launch({ msg: trs("设置/向导/请输入模型别名", { cn: "请填写模型别名", en: "Please enter model alias" }), color: "yellow" })
      return
    }
    if (!modelStr) {
      Notice.launch({ msg: trs("设置/向导/请输入模型ID", { cn: "请填写或选择模型 ID", en: "Please enter or select Model ID" }), color: "yellow" })
      return
    }
    if (!urlStr) {
      Notice.launch({ msg: trs("设置/向导/请输入接口地址", { cn: "请填写接口地址 (Base URL)", en: "Please enter Base URL" }), color: "yellow" })
      return
    }

    submitting = true
    m.redraw()

    try {
      const newModelObj = {
        name: nameStr,
        model: modelStr,
        apiKey: apiKeyStr,
        url: urlStr,
        prompt: String(formData.prompt ?? "").trim(),
        price: 0,
        tokenRate: 0,
        system: 0,
        switch: 1,
        preTokens: Number(formData.preTokens) || 1000000
      }

      // 统一拉取最新配置数据
      await settingData.options.pull()
      let optItem = settingData.options.data?.find(opt => opt.key === "ai_aiList")
      let aiList = optItem?.value
      if (!Array.isArray(aiList)) {
        aiList = []
      }
      aiList.push(newModelObj)
      if (optItem) {
        optItem.value = aiList
      }

      const rawOptions = JSON.parse(JSON.stringify(settingData.options.data, (k, v) => {
        if (!k.startsWith("_")) return v
      }))
      const saveRes = await settingData.fnCall("cmdOptions", [rawOptions])
      if (saveRes && saveRes.ok) {
        if (vnode.attrs.onSuccess) {
          await vnode.attrs.onSuccess(newModelObj, aiList)
        }
        close()
        Notice.launch({ msg: saveRes.msg || trs("设置/向导/模型添加成功", { cn: "模型添加成功", en: "Model added successfully" }), color: "green" })
      } else {
        Notice.launch({ msg: saveRes?.msg || trs("系统/消息/保存失败", { cn: "保存失败", en: "Save failed" }), color: "pink" })
      }
    } catch (e) {
      console.error("[ModelWizard] 保存模型失败:", e)
      Notice.launch({ msg: trs("系统/消息/保存失败", { cn: "保存失败: ", en: "Save failed: " }) + e.message, color: "pink" })
    } finally {
      submitting = false
      m.redraw()
    }
  }

  // 校验当前步骤的必填项，通过返回 true，失败弹提示并返回 false
  const validateStep = (idx) => {
    if (idx === 1) {
      if (!String(formData.model ?? "").trim()) {
        Notice.launch({ msg: trs("设置/向导/请输入模型ID", { cn: "请填写或选择模型 ID", en: "Please enter or select Model ID" }), color: "yellow" })
        return false
      }
      return true
    }
    if (idx === 2) {
      if (!String(formData.url ?? "").trim()) {
        Notice.launch({ msg: trs("设置/向导/请输入接口地址", { cn: "请填写接口地址 (Base URL)", en: "Please enter Base URL" }), color: "yellow" })
        return false
      }
      return true
    }
    if (idx === 3) {
      if (!String(formData.name ?? "").trim()) {
        Notice.launch({ msg: trs("设置/向导/请输入模型别名", { cn: "请填写模型别名", en: "Please enter model alias" }), color: "yellow" })
        return false
      }
      return true
    }
    return true
  }

  const goNext = () => {
    if (!validateStep(stepIndex)) {
      return
    }
    if (stepIndex < totalSteps - 1) {
      stepIndex++
      m.redraw()
    }
  }

  const goPrev = () => {
    if (stepIndex > 0) {
      stepIndex--
      m.redraw()
    }
  }

  // 顶部步骤指示器（圆点 + 连线，已完成可点击回退）
  const stepIndicator = () => {
    return m("div",
      {
        style: {
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "center",
          margin: "1rem 0.5rem 1.5rem 0.5rem"
        }
      },
      steps.map((s, i) => {
        const isDone = i < stepIndex
        const isActive = i === stepIndex
        const dotColor = isActive ? "main" : (isDone ? "green_1" : "gray_4")
        return m.fragment(
          { key: i },
          [
            m("div",
              {
                style: {
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "0.5rem",
                  cursor: isDone ? "pointer" : "default"
                },
                onclick: isDone ? () => { stepIndex = i; m.redraw() } : null
              },
              [
                m("div",
                  {
                    style: {
                      width: isActive ? "3rem" : "2.6rem",
                      height: isActive ? "3rem" : "2.6rem",
                      borderRadius: "50%",
                      background: getColor(dotColor).back,
                      color: getColor(dotColor).front,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "1.3rem",
                      fontWeight: "bold",
                      boxShadow: isActive ? "0 0 0 0.3rem " + getColor("main").back + "33" : "none",
                      transition: "all 0.3s ease"
                    }
                  },
                  isDone ? "✓" : String(i + 1)
                ),
                m("div",
                  {
                    style: {
                      fontSize: "1.1rem",
                      color: isActive ? getColor("gray_1").front : getColor("gray_4").front,
                      whiteSpace: "nowrap"
                    }
                  },
                  s.title
                )
              ]
            ),
            i < totalSteps - 1 ? m("div",
              {
                style: {
                  flex: "1 1 auto",
                  minWidth: "0.5rem",
                  height: "0.25rem",
                  borderRadius: "1rem",
                  background: isDone ? getColor("green_1").back : getColor("gray_4").back,
                  marginTop: "1.2rem"
                }
              }
            ) : null
          ]
        )
      })
    )
  }

  // 步骤 1：选择厂商
  const providerStep = () => {
    return m(FormItem,
      {
        label: trs("设置/向导/选择厂商", { cn: "选择 API 厂商", en: "Select Provider" }),
        description: trs("设置/向导/厂商说明", { cn: "选择厂商后将自动填充接口地址与推荐模型", en: "Selecting a provider auto-fills the Base URL and recommended models" })
      },
      [
        m("select",
          {
            value: formData.providerId,
            style: selectStyle,
            onchange: (e) => {
              const pid = e.target.value
              formData.providerId = pid
              const p = AI_PROVIDERS.find(item => item.id === pid)
              if (p) {
                formData.providerName = p.name
                if (p.url) formData.url = p.url
                if (p.defaultModel) {
                  formData.model = p.defaultModel
                  formData.name = p.name
                }
              }
              m.redraw()
            }
          },
          AI_PROVIDERS.map(p =>
            m("option",
              {
                value: p.id,
                key: p.id
              },
              p.name
            )
          )
        )
      ]
    )
  }

  // 步骤 2：选择/输入模型 ID
  const modelStep = (availableModels) => {
    return m(FormItem,
      {
        label: trs("设置/向导/模型ID", { cn: "选择或输入模型 ID", en: "Select or Enter Model ID" }),
        description: trs("设置/向导/模型说明", { cn: "可直接输入，或从推荐模型列表中点选", en: "Type directly or pick from recommended models" })
      },
      [
        m(AutoForm,
          {
            dataObj: formData,
            dataName: "model",
            extEditMode: false
          }
        ),
        availableModels.length > 0 ?
          m("select",
            {
              value: formData.model,
              style: selectStyle,
              onchange: (e) => {
                const mId = e.target.value
                if (mId) {
                  formData.model = mId
                  formData.name = `${formData.providerName} (${mId})`
                  m.redraw()
                }
              }
            },
            [
              m("option", { value: "" }, trs("设置/向导/从主流列表中选择", { cn: "--- 从推荐模型列表中点选 ---", en: "--- Select from recommended models ---" })),
              availableModels.map(mId =>
                m("option",
                  {
                    value: mId,
                    key: mId
                  },
                  mId
                )
              )
            ]
          ) : null
      ]
    )
  }

  // 步骤 3：接口地址
  const urlStep = () => {
    return m(FormItem,
      {
        label: trs("设置/向导/接口地址", { cn: "接口地址 (Base URL)", en: "Base URL" }),
        description: trs("设置/向导/接口地址说明", { cn: "兼容 OpenAI 标准接口协议格式", en: "Compatible with OpenAI API format" })
      },
      [
        m(AutoForm,
          {
            dataObj: formData,
            dataName: "url",
            extEditMode: false
          }
        )
      ]
    )
  }

  // 步骤 4：模型别名
  const nameStep = () => {
    return m(FormItem,
      {
        label: trs("设置/向导/模型别名", { cn: "模型别名 (用于前端展示)", en: "Model Alias (shown in UI)" })
      },
      [
        m(AutoForm,
          {
            dataObj: formData,
            dataName: "name",
            extEditMode: false
          }
        )
      ]
    )
  }

  // 步骤 5：API Key（可选）
  const apiKeyStep = (keyUrl) => {
    return m(FormItem,
      {
        label: trs("设置/向导/APIKey", { cn: "API Key (可选)", en: "API Key (optional)" }),
        description: keyUrl ? m("span",
          [
            trs("设置/向导/获取Key提示", { cn: "可在官方平台获取：", en: "Get API key from: " }),
            m("a",
              {
                href: keyUrl,
                target: "_blank",
                style: {
                  color: getColor("main").back,
                  textDecoration: "underline",
                  cursor: "pointer"
                },
                onclick: (e) => {
                  e.preventDefault()
                  if (window.require) {
                    const { shell } = window.require("electron")
                    shell?.openExternal(keyUrl)
                  } else {
                    window.open(keyUrl, "_blank")
                  }
                }
              },
              keyUrl
            )
          ]
        ) : null
      },
      [
        m(AutoForm,
          {
            dataObj: formData,
            dataName: "apiKey",
            extEditMode: false
          }
        )
      ]
    )
  }

  return {
    view() {
      const activeProvider = getActiveProvider()
      const availableModels = activeProvider?.models || []
      const keyUrl = activeProvider?.keyUrl

      return m("",
        {
          style: {
            display: "flex",
            flexDirection: "column",
            minWidth: "20rem",
            maxWidth: "46rem",
            padding: "0.5rem 1rem 1rem 1rem",
            color: getColor("gray_1").front
          }
        },
        [
          stepIndicator(),

          stepIndex === 0 ? providerStep() : null,
          stepIndex === 1 ? modelStep(availableModels) : null,
          stepIndex === 2 ? urlStep() : null,
          stepIndex === 3 ? nameStep() : null,
          stepIndex === 4 ? apiKeyStep(keyUrl) : null,

          // 底部控制按钮组
          m("",
            {
              style: {
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: "1rem",
                marginTop: "1.5rem"
              }
            },
            [
              m(Box,
                {
                  isBtn: true,
                  color: "gray_4",
                  style: { flex: "0 0 auto" },
                  onclick: close
                },
                trs("通用/取消", { cn: "取消", en: "Cancel" })
              ),

              m("",
                {
                  style: {
                    display: "flex",
                    gap: "1rem"
                  }
                },
                [
                  stepIndex > 0 ? m(Box,
                    {
                      isBtn: true,
                      color: "gray_3",
                      onclick: goPrev
                    },
                    trs("设置/向导/上一步", { cn: "上一步", en: "Back" })
                  ) : null,

                  stepIndex < totalSteps - 1 ? m(Box,
                    {
                      isBtn: true,
                      color: "main",
                      onclick: goNext
                    },
                    trs("设置/向导/下一步", { cn: "下一步", en: "Next" })
                  ) : m(Box,
                    {
                      isBtn: true,
                      color: "green_1",
                      onclick: submit
                    },
                    submitting ? trs("系统/状态/保存中", { cn: "保存中...", en: "Saving..." }) : trs("设置/向导/完成添加", { cn: "完成添加", en: "Done & Add" })
                  )
                ]
              )
            ]
          )
        ]
      )
    }
  }
}

export const launchModelWizard = (options = {}) => {
  Notice.launch({
    sign: "setting_model_wizard",
    tip: trs("设置/向导/标题", { cn: "添加 AI 模型向导", en: "Add AI Model Wizard" }),
    content: ModelWizardModal,
    contentAttrs: {
      onSuccess: options.onSuccess
    }
  })
}
