import DynamicData from "./DynamicData.js"
export default {
  data:null,
  async init(){
    this.data = new DynamicData({})
  },
}