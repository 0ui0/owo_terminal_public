import DynamicData from "./DynamicData.js"
import defaultComData from "../tools/defaultComData.js"
export default {
  data:null,
  async init(){
    this.data = new DynamicData(defaultComData())
  },
  getChatList(listId) {
    const list = this.data.get().chatLists?.find(l => l.id === listId);
    if (!list) {
      throw new Error(`找不到 listId 为 ${listId} 的配置`);
    }
    return list;
  },
  async editChatList(listId, callback) {
    await this.data.edit((data) => {
      const list = data.chatLists?.find(l => l.id === listId);
      if (list) {
        callback(list, data);
      }
    });
  }
}