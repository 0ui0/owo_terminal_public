// 故意制造错误的后端
export default {
  async init(app, appManager) {
    console.log("准备触发一个故意构造的错误...")
    throw new Error("这是来自服务端的故意崩溃测试！如果你看到这个通知，说明错误捕获机制生效了。")
  }
}
