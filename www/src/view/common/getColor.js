import colorObj from "./colorObj"
import commonData from "./commonData"

export default function (colorStr) {
  const themeId = commonData.themeColor || 0

  if (themeId === 0) {
    return colorObj[colorStr] || colorObj.gray_4
  }

  if (themeId === 1) {
    const themeOverrides = {
      main: { back: "#ffdb66", front: "#333333" },    // 经典蔚蓝 (品牌色)
      pink_1: { back: "#FF6B6B", front: "#FFFFFF" },  // 活力珊瑚红 (发送按钮)
      pink_2: { back: "#FFCE54", front: "#333" },     // [raw] 标签 (正黄色)
      gray_1: { back: "#fff3dd", front: "#000000" },   // 全局背景 (浅蓝) / 文字调至纯黑补偿 + '55'
      gray_2: { back: "#BDC3C7", front: "#333" },
      gray_3: { back: "#f5f3dc", front: "#2C3E50" },   // 侧边栏 (海洋浅蓝)
      gray_4: { back: "#f5f2e1", front: "#2C3E50" },   // 容器背景 (浅蓝灰)
      gray_5: { back: "#6C99C6", front: "#FFFFFF" },   // 列表页眉
      gray_6: { back: "#333333", front: "#333333" },
      gray_8: { back: "#FFFFFF", front: "#000000" },   // 气泡主基调 (纯白) / 文本纯黑
      gray_9: { back: "#EAF1F7", front: "#2C3E50" },
      gray_12: { back: "#e6e6e6", front: "#333" },//导航栏背景
      brown_1: { back: "#f0f0ea", front: "#333333" },  // 用户气泡背景
      brown_2: { back: "#F0F4F8", front: "#2C3E50" },
      brown_3: { back: "#2C3E50", front: "#FFFFFF" },
      brown_4: { back: "#FFFFFF", front: "#333333" },  // 输入框背景
      brown_5: { back: "#f0efea", front: "#333333" },
      yellow_1: { back: "#FFB300", front: "#333333" },  // 琥珀黄 (回复/引用按钮)
      yellow_2: { back: "#F5C71A", front: "#333333" },    // 气泡侧边金边 (高饱和)
      blue_1: { back: "#e3e9ee", front: "#FFFFFF" },   // 天蓝色 (撤到本条/清除之前)
      blue_2: { back: "#1A4A8E", front: "#FFFFFF" },
      blue_3: { back: "#e5e8eeff", front: "#343c47ff" }, //思考中背景
      green_1: { back: "#4BC0C0", front: "#FFFFFF" },
      purple_1: { back: "#AC92EC", front: "#FFFFFF" },
      purple_2: { back: "#7D7D82", front: "#FFFFFF" }, // 撤销按钮 (低饱和灰紫)
      terminal_back: "#2C3E50",
      terminal_front: "#ECF0F1",
      工具组成功背景: "#f1f1f1",
      工具组成功边框: "#5bb15a",
      工具组失败背景: "#ece1e1",
      工具组文字颜色: "#555555",
      确认框背景: "#fffcffee",
      确认框文字: "#33333355",
      确认框标题: "#333",
      确认框标题边框: "#97598f",
      确认框内容背景: "#f0f0f066",
      确认框输入背景: "rgba(255,255,255,0.8)",
      确认框输入边框: "rgba(0,0,0,0.1)",
      确认框输入文字: "#333",
      确认框按钮执行背景: "#97598f",
      确认框按钮执行文字: "#fff",
      确认框按钮拒绝背景: "#eee",
      确认框按钮拒绝文字: "#333",
    }
    return themeOverrides[colorStr] || colorObj[colorStr] || colorObj.gray_4
  }

  if (themeId === 2) {
    const themeOverrides = {
      main: { back: "#53a6ff", front: "#FFFFFF" },    // 经典蔚蓝 (品牌色)
      pink_1: { back: "#FF6B6B", front: "#FFFFFF" },  // 活力珊瑚红 (发送按钮)
      pink_2: { back: "#FFCE54", front: "#333" },     // [raw] 标签 (正黄色)
      gray_1: { back: "#DDEEFF", front: "#000000" },   // 全局背景 (浅蓝) / 文字调至纯黑补偿 + '55'
      gray_2: { back: "#BDC3C7", front: "#333" },
      gray_3: { back: "#DCE9F5", front: "#2C3E50" },   // 侧边栏 (海洋浅蓝)
      gray_4: { back: "#ffffff", front: "#2C3E50" },   // 容器背景 (浅蓝灰)
      gray_5: { back: "#6C99C6", front: "#FFFFFF" },   // 列表页眉
      gray_6: { back: "#333333", front: "#333333" },
      gray_8: { back: "#FFFFFF", front: "#000000" },   // 气泡主基调 (纯白) / 文本纯黑
      gray_9: { back: "#EAF1F7", front: "#2C3E50" },
      gray_12: { back: "#e6e6e6", front: "#333" },//导航栏背景
      brown_1: { back: "#eaeff0", front: "#333333" },  // 用户气泡背景
      brown_2: { back: "#F0F4F8", front: "#2C3E50" },
      brown_3: { back: "#2C3E50", front: "#FFFFFF" },
      brown_4: { back: "#FFFFFF", front: "#333333" },  // 输入框背景
      brown_5: { back: "#f0efea", front: "#333333" },
      yellow_1: { back: "#FFB300", front: "#333333" },  // 琥珀黄 (回复/引用按钮)
      yellow_2: { back: "#F5C71A", front: "#333333" },    // 气泡侧边金边 (高饱和)
      blue_1: { back: "#42A5F5", front: "#FFFFFF" },   // 天蓝色 (撤到本条/清除之前)
      blue_2: { back: "#1A4A8E", front: "#FFFFFF" },
      blue_3: { back: "#e5e8eeff", front: "#343c47ff" }, //思考中背景

      green_1: { back: "#4BC0C0", front: "#FFFFFF" },
      purple_1: { back: "#AC92EC", front: "#FFFFFF" },
      purple_2: { back: "#7D7D82", front: "#FFFFFF" }, // 撤销按钮 (低饱和灰紫)
      terminal_back: "#2C3E50",
      terminal_front: "#ECF0F1",

      工具组成功背景: "#f1f1f1",
      工具组成功边框: "#5bb15a",
      工具组失败背景: "#ece1e1",
      工具组文字颜色: "#555555",
      确认框背景: "#fffcffee",
      确认框文字: "#33333355",
      确认框标题: "#333",
      确认框标题边框: "#97598f",
      确认框内容背景: "#f0f0f066",
      确认框输入背景: "rgba(255,255,255,0.8)",
      确认框输入边框: "rgba(0,0,0,0.1)",
      确认框输入文字: "#333",
      确认框按钮执行背景: "#97598f",
      确认框按钮执行文字: "#fff",
      确认框按钮拒绝背景: "#eee",
      确认框按钮拒绝文字: "#333",
    }
    return themeOverrides[colorStr] || colorObj[colorStr] || colorObj.gray_4
  }

  return colorObj[colorStr] || colorObj.gray_4
}
