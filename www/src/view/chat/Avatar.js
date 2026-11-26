import comData from '../../comData/comData.js'
import getColor from "../common/getColor.js"
import getSize from "../common/getSize.js"

export default () => {
  return {
    view({ attrs }) {
      const { chat } = attrs;
      const petFace = chat.ask?.content?.placeFace || "smile";


      return m("div", {
        style: {
          width: window.Mob ? `${getSize(8)}rem` : `${getSize(15)}rem`,
          height: window.Mob ? `${getSize(8)}rem` : `${getSize(15)}rem`,
          borderRadius: "50%",
          backgroundImage: chat.group == "user" 
            ? "url(./statics/avatar.svg)"
            : chat.group == "agent" || chat.group == "system" || true
              ? `url('./statics/petPkgs/${comData.data.get()?.defaultPet || "default"}/pet/${petFace}.png')`
              : null
          ,
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
          backgroundColor: `${chat.group === "user" ? getColor('我方气泡背景色') : getColor('对方气泡背景色')}33`,
          border: `${getSize(0.25)}rem solid ${chat.group === "user" ? getColor('我方气泡高亮边框色') : getColor('对方气泡高亮边框色')}`,
          boxShadow: `0 ${getSize(0.25)}rem ${getSize(1)}rem rgba(0,0,0,0.2)`,
          margin: chat.group === "user" ? `${getSize(2)}rem ${getSize(2)}rem ${getSize(2)}rem 0` : `${getSize(2)}rem 0 ${getSize(2)}rem ${getSize(2)}rem`,
          flexShrink: 0,
          boxSizing: "border-box",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
        }
      }, [
        /*         chat.group === "user"
                  ? m("", {
                    style: {
                      fontSize: "1.5rem",
                      fontWeight: "bolder",
                      color: getColor("grey").front
                    }
                  }, "你")
                  : null */
      ]);

    }
  };
};
