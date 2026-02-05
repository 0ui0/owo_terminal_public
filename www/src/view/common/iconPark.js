
import {
  Check,
  Left,
  Right,
  Down,
  CloseSmall,
  Close,
  Minus,
  Terminal,
  RobotOne,
  Message,
  FullScreenOne,
  OffScreenOne,
  Undo,
  Return,
  Setting,
  PauseOne,
  Quote,
  Back,
  Pin,
  Browser,
  Help,
  SoapBubble,
  BrowserChrome,
  Planet,
  Lock,
  Unlock,
  InternalExpansion,
  ApplicationMenu,
  FolderOpen,
  Refresh,
  PreviewOpen,
  PreviewClose,
} from '@icon-park/svg';

let iconPark = {
  Check,
  Left,
  Right,
  Down,
  CloseSmall,
  Close,
  Minus,
  Terminal,
  RobotOne,
  Message,
  FullScreenOne,
  OffScreenOne,
  Undo,
  Return,
  Setting,
  PauseOne,
  Quote,
  Back,
  Pin,
  Browser,
  Help,
  SoapBubble,
  BrowserChrome,
  Planet,
  Lock,
  Unlock,
  InternalExpansion,
  ApplicationMenu,
  ApplicationMenu,
  FolderOpen,
  Refresh,
  PreviewOpen,
  PreviewClose,
};

export default {
  init: function () {
    window.iconPark = iconPark;
    return window.iconPark.getIcon = function (name, config) {
      if (!iconPark[name]) {
        console.warn(`Icon ${name} not found in iconPark.js`);
        name = "Help";
      }
      try {
        return iconPark[name]({
          theme: 'multi-color',
          size: '18px',
          strokeWidth: 4,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          fill: ["#594F4C", "#5f4905", "#5f4905", '#dd7263'],
          fill: "#222",
          theme: "outline",
          ...config
        });
      } catch (error) {
        let err = error;
        console.log(name);
        return console.log(err);
      }
    };
  }
};
