import Box from "./box.js"
import NBox from "./noticeBox.js"

export default {
  data: {
    compArr: [],
    dataArr: [],
    page: 0,
    show: false,
    zIndex: 999999998
  },
  launch: function(obj) {
    if (obj.zIndex) {
      this.data.zIndex = obj.zIndex;
    }
    if (!this.data.dataArr.find((item) => {
      return item.sign && item.sign === obj.sign;
    })) {
      if (obj.sign == null) {
        obj.sign = Date.now();
      }
      this.data.dataArr.unshift(obj);
      this.data.page = 0;
      this.data.dataArr[0].win = {
        x: 0,
        y: 0
      };
      //this.data.show = obj.show ?? true;
    }
    this.data.show = obj.show ?? true;
    return m.redraw();
  },
  view: function() {
    var _this;
    _this = this;
    return m("", {
      ontouchstart: (e) => {
        return e.stopPropagation();
      },
      ontouchmove: (e) => {
        return e.stopPropagation();
      },
      style: {
        display:this.data.show ? "block" : "none",
        zIndex: this.data.zIndex,
        position: "fixed",
        minWidth: "max-content",
        ...(this.data.dataArr[this.data.page]?.showLayer ? {
          top: 0,
          bottom: 0,
          left: 0,
          right: 0,
          background: "rgba(0,0,0,0.5)"
        } : {
          top: "50%",
          left: "50%",
          transform: this.data.dataArr[this.data.page]?.win ?
            `translate(calc(-50% + ${this.data.dataArr[this.data.page].win.x}px),calc(-50% + ${this.data.dataArr[this.data.page].win.y}px))` :
            "translate(-50%, -50%)"
        }),
        maxHeight: "100vh",
        alignItems: "center",
        //boxShadow: "0.1rem 0.1rem 1rem rgba(0,0,0,0.5)",
        backdropFilter: "blur(5px)",
        "-webkit-backdrop-filter": "blur(5px)"
      }
    }, [
      m("",
      {
        style: {
          width: "100%",
          height: "100%",
          display: "flex",
          justifyContent: "center",
          alignItems: "center"
        }
      },
      [
        this.data.dataArr.length > 0 ? m(NBox,
        {
          upData: this.data,
          closeLayer: () => {
            if (this.data.dataArr.length === 0) {
              return this.data.show = false;
            }
          }
        }) : void 0
      ])
    ]);

  }
};
