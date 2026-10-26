import colorObj from "./colorObj.js"
import commonData from "./commonData.js"

export default function (colorStr) {
  const themeId = commonData.themeColor || 0

  if (themeId === 0) {
    return colorObj[colorStr] || colorObj.gray_4
  }

  if (themeId === 1) {
    const themeOverrides = {
      main: { back: "#ffdb66", front: "#5f4905" },    // 品牌黄 (喵宅苑原版标准配深焦糖褐)
      pink_1: { back: "#ff7675", front: "#ffffff" },  // 活力珊瑚红 (发送按钮)
      pink_2: { back: "#fab1a0", front: "#5f4905" },  // [raw] 标签 (柔杏粉)
      gray_1: { back: "#FCF8ED", front: "#000000" },  // 全局背景 (喵宅苑温润奶白大底)
      gray_2: { back: "#E8DFC8", front: "#594F4C" },  // 辅助功能按钮 (设置/暂停/反馈/应用)
      gray_3: { back: "#F7F0DD", front: "#5f4905" },  // 侧边栏 (轻柔米白)
      gray_4: { back: "#ffffff", front: "#594F4C" },  // 容器背景 (纯白)
      gray_5: { back: "#ffc83c", front: "#5f4905" },  // 列表页眉
      gray_6: { back: "#594F4C", front: "#594F4C" },
      gray_8: { back: "#FFFFFF", front: "#594F4C" },  // 气泡主基调 (纯白卡片，温润褐字)
      gray_9: { back: "#FBF6E9", front: "#594F4C" },
      gray_12: { back: "#F5ECD5", front: "#5f4905" }, // 导航栏背景 (轻米金)
      brown_1: { back: "#ffffff", front: "#594F4C" }, // 用户气泡背景 (纯白卡片)
      brown_2: { back: "#FDFBF5", front: "#594F4C" },
      brown_3: { back: "#594F4C", front: "#FFFFFF" },
      brown_4: { back: "#FFFFFF", front: "#594F4C" }, // 输入框背景 (纯白)
      brown_5: { back: "#ffffff", front: "#594F4C" }, // 对方气泡背景 (纯白卡片)
      yellow_1: { back: "#ffc83c", front: "#5f4905" }, // 喵宅苑标准金橙 (深焦糖褐字，绝不白字黄底)
      yellow_2: { back: "#ffdb66", front: "#5f4905" }, // 气泡侧边金边
      blue_1: { back: "#74b9ff", front: "#ffffff" },  // 晴空天蓝 (白字蓝底，清晰自然)
      blue_2: { back: "#0984e3", front: "#FFFFFF" },
      blue_3: { back: "#ffffff", front: "#594F4C" },  // 思考中背景 (纯白卡片)
      green_1: { back: "#2ed573", front: "#FFFFFF" },  // 薄荷葱绿 (时光机指示灯)
      purple_1: { back: "#A55EEA", front: "#FFFFFF" },
      purple_2: { back: "#a29bfe", front: "#2d3436" }, // 柔和薰衣草紫 (清晰对比)
      terminal_back: "#2C2519",
      terminal_front: "#FBF3DC",
      工具组成功背景: "#ffffff",
      工具组成功边框: "#ffdb66",
      工具组失败背景: "#ffffff",
      工具组文字颜色: "#594F4C",
      右上角按钮背景: "#ffdb66",
      右上角按钮文字: "#5f4905",
      确认框背景: "#fffcffee",
      确认框文字: "#594F4C",
      确认框标题: "#5f4905",
      确认框标题边框: "#ffdb66",
      确认框内容背景: "#f0f0f066",
      确认框输入背景: "rgba(255,255,255,0.8)",
      确认框输入边框: "rgba(0,0,0,0.1)",
      确认框输入文字: "#594F4C",
      确认框按钮执行背景: "#ffdb66",
      确认框按钮执行文字: "#5f4905",
      确认框按钮拒绝背景: "#eee",
      确认框按钮拒绝文字: "#594F4C",
      我方气泡背景色: "#ffffff",
      我方气泡高亮边框色: "#ffc83c",
      对方气泡背景色: "#ffffff",
      对方气泡高亮边框色: "#ffdb66",
      思考中气泡背景色: "#ffffff",
      思考中气泡高亮边框色: "#ffc83c",
      消息列表背景: "#FBF6E9"
    }
    return themeOverrides[colorStr] || colorObj[colorStr] || themeOverrides.gray_4
  }

  if (themeId === 2) {
    const themeOverrides = {
      main: { back: "#53a6ff", front: "#FFFFFF" },    // 经典蔚蓝 (品牌色)
      pink_1: { back: "#ff8585", front: "#FFFFFF" },  // 活力珊瑚红 (发送按钮)
      pink_2: { back: "#FFCE54", front: "#333333" },     // [raw] 标签 (正黄色)
      gray_1: { back: "#DDEEFF", front: "#000000" },   // 全局背景 (浅蓝) / 文字调至纯黑补偿 + '55'
      gray_2: { back: "#CAD5E2", front: "#333333" },
      gray_3: { back: "#DCE9F5", front: "#2C3E50" },   // 侧边栏 (海洋浅蓝)
      gray_4: { back: "#ffffff", front: "#2C3E50" },   // 容器背景 (浅蓝灰)
      gray_5: { back: "#6C99C6", front: "#FFFFFF" },   // 列表页眉
      gray_6: { back: "#333333", front: "#333333" },
      gray_8: { back: "#FFFFFF", front: "#000000" },   // 气泡主基调 (纯白) / 文本纯黑
      gray_9: { back: "#EAF1F7", front: "#2C3E50" },
      gray_12: { back: "#e6e6e6", front: "#333333" },//导航栏背景
      brown_1: { back: "#eaeff0", front: "#333333" },  // 用户气泡背景
      brown_2: { back: "#F0F4F8", front: "#2C3E50" },
      brown_3: { back: "#2C3E50", front: "#FFFFFF" },
      brown_4: { back: "#FFFFFF", front: "#333333" },  // 输入框背景
      brown_5: { back: "#f0efea", front: "#333333" },
      yellow_1: { back: "#FFB300", front: "#333333" },  // 琥珀黄 (回复/引用按钮)
      yellow_2: { back: "#F5C71A", front: "#333333" },    // 气泡侧边金边 (高饱和)
      blue_1: { back: "#42A5F5", front: "#FFFFFF" },   // 天蓝色 (撤到本条/清除之前)
      blue_2: { back: "#1A4A8E", front: "#FFFFFF" },
      blue_3: { back: "#e5e8ee", front: "#343c47" }, //思考中背景

      green_1: { back: "#4BC0C0", front: "#FFFFFF" },
      purple_1: { back: "#AC92EC", front: "#FFFFFF" },
      purple_2: { back: "#7D7D82", front: "#FFFFFF" }, // 撤销按钮 (低饱和灰紫)
      terminal_back: "#2C3E50",
      terminal_front: "#ECF0F1",

      工具组成功背景: "#ffffff",
      工具组成功边框: "#ea9d9d",
      工具组失败背景: "#ffffff",
      工具组文字颜色: "#555555",
      右上角按钮背景: "#cde3fc",
      右上角按钮文字: "#1d5791",
      确认框背景: "#fffcffee",
      确认框文字: "#2C3E50",
      确认框标题: "#2C3E50",
      确认框标题边框: "#53a6ff",
      确认框内容背景: "#f0f0f066",
      确认框输入背景: "rgba(255,255,255,0.8)",
      确认框输入边框: "rgba(0,0,0,0.1)",
      确认框输入文字: "#2C3E50",
      确认框按钮执行背景: "#97598f",
      确认框按钮执行文字: "#fff",
      确认框按钮拒绝背景: "#eee",
      确认框按钮拒绝文字: "#333",
      我方气泡背景色: "#ffffff",
      我方气泡高亮边框色: "#dcc1a2",
      对方气泡背景色: "#ffffff",
      对方气泡高亮边框色: "#80adff",
      思考中气泡背景色: "#ffffff",
      思考中气泡高亮边框色: "#d59bd6",
      消息列表背景: "#e4e9f0"
    }
    return themeOverrides[colorStr] || colorObj[colorStr] || themeOverrides.gray_4
  }

  return colorObj[colorStr] || colorObj.gray_4
}
