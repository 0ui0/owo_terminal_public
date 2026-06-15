export default function getDefaultComData() {
  return {
    currentModel: "",
    sendMode: "agent",
    call: null,
    inputText: "",
    chatLists: [
      {
        id: 0,
        linkid: 0,
        replying: false,
        streamChunks: "",
        streamDisplayContent: "",
        streamReasoningChunks: "",
        confirmCmds: [
          /* {
            id: "uuid",
            type: "tip",
            title: "标题",
            content: "内容",
            confirm: "pending", // yes, no
            comment: "", // 用户备注回传
            listId: 0
          } */
        ],
        stop: false,
        tasks: [],
        notes: [],
        graph: { nodes: {}, links: [] }
      }
    ],
    quotes: [],
    darkMode: true,
    faceAction: "smile",
    playFaces: {
      current: "",
      //list: ["待机状态", "腾空", "上下漂浮", "降落", "待机状态", "待机状态", "待机状态", "左右行走"],
      list: ["待机状态"],
      index: 0
    },
    currentTid: "",
    toolsMode: 5, //1提示词模式 2标准工具模式 3 miao模式 4 嫁接模式 5编程模式
    targetChatListId: 0, //默认用户锁定的聊天列表id
    enableThinking: false, //深度思考
    thinkControl: false, //思考控制
    thinkStrength: "medium",
    defaultPet: "zCatBlue",
    customCwd: "",
    snapshots: [],
    tokenCompressSwitch: true
  }
}
