# วิธีการใช้งาน Jquery Zoom Plugin
```js
//วิธีการสร้าง Object
const _limitZoom = 10; // กำหนด limit การ zoom
const ctrl = $(svg).svgPanZoom({
            events: {
              mouseWheel: false,
              doubleClick: false,
              drag:(isMobile ? false : true),
              dragCursor: "grab",
            },
            zoomFactor: 0.25,
            maxZoom: 6,
            animationTime: 120,
            zoomLimit:_limitZoom
            // limits เป็น option ที่รองรับจริง
            // limits: {
            //   x: box.x,
            //   y: box.y,
            //   x2: box.x + box.width,
            //   y2: box.y + box.height,
            // },
          });
```

```js
//Function การ Zoom
ZoomIn = ctrl.zoomIn();
ZoomOut = ctrl.zoomOut();
Reset = ctrl.reset();
```
![Ref Original]https://github.com/DanielHoffmann/jquery-svg-pan-zoom