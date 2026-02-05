import comData from "../../../comData/comData.js"
export default {
  //chats:[],
  async add(chat, listId = 0) {
    //this.chats.push(chat)
    await comData.data.edit((data) => {

      const targetList = data.chatLists.find(l => l.id == listId);
      if (targetList) {
        targetList.data.push(chat);
      } else {
        // Fallback: 如果连 ID 0 都没有，初始化一个
        data.chatLists.push({ id: 0, linkid: 0, data: [chat] });
      }

    })
  },
  find(uuid) {
    const data = comData.data.get();
    for (const list of data.chatLists) {
      const found = list.data.find(chat => chat.uuid == uuid);
      if (found) return found;
    }
    return undefined;

  },
  findByTid(tid) {
    const data = comData.data.get();
    for (const list of data.chatLists) {
      const found = list.data.find(chat => chat.tid == tid);
      if (found) return found;
    }
    return undefined;

  },


}