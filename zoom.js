(function() {
  var hasProp = {}.hasOwnProperty;

  (function($) {
    var checkLimits, defaultOptions, defaultViewBox, getViewBoxCoordinatesFromEvent, parseViewBoxString;
    defaultOptions = {
      events: {
        mouseWheel: true,
        doubleClick: true,
        drag: true,
        dragCursor: "move"
      },
      animationTime: 300,
      zoomFactor: 0.25,
      maxZoom: 3,
      panFactor: 100,
      initialViewBox: null,
      limits: null
    };
    defaultViewBox = {
      x: 0,
      y: 0,
      width: 1000,
      height: 1000
    };

    function zoomByCenter(ctrl,factor, animationTime) {
          const vb = ctrl.getViewBox(); // {x,y,width,height}
          const cx = vb.x + vb.width / 2;
          const cy = vb.y + vb.height / 2;

          const newW = vb.width / factor;   // factor > 1 = zoom in
          const newH = vb.height / factor;

          ctrl.setViewBox(
            cx - newW / 2,
            cy - newH / 2,
            newW,
            newH,
            animationTime == null ? ctrl.animationTime : animationTime
          );
    };
    /**
     * Check the limits of the view box, return a new viewBox that respects the limits while keeping
     * the original view box size if possible. If the view box needs to be reduced, the returned view
     * box will keep the aspect ratio of the original view box.
     *
     * @param {Object} viewBox
     *   The original view box. Takes numbers, in the format `{x, y, width, height}`.
     *
     * @param {Object} limits
     *   Extents which can be shown, in the view box coordinate system. Takes numbers in the format
     *   `{x, y, x2, y2}`.
     *
     * @return {Object} viewBox
     *   A new view box object, squeezed into the limits. Contains numbers, in the format `{x, y,
     *   width, height}`.
     */
    checkLimits = function(viewBox, limits) {
      var limitsHeight, limitsWidth, reductionFactor, vb;
      vb = $.extend({}, viewBox);
      limitsWidth = Math.abs(limits.x2 - limits.x);
      limitsHeight = Math.abs(limits.y2 - limits.y);
      if (vb.width > limitsWidth) {
        if (vb.height > limitsHeight) {
          if (limitsWidth > limitsHeight) {
            reductionFactor = limitsHeight / vb.height;
            vb.height = limitsHeight;
            vb.width = vb.width * reductionFactor;
          } else {
            reductionFactor = limitsWidth / vb.width;
            vb.width = limitsWidth;
            vb.height = vb.height * reductionFactor;
          }
        } else {
          reductionFactor = limitsWidth / vb.width;
          vb.width = limitsWidth;
          vb.height = vb.height * reductionFactor;
        }
      } else if (vb.height > limitsHeight) {
        reductionFactor = limitsHeight / vb.height;
        vb.height = limitsHeight;
        vb.width = vb.width * reductionFactor;
      }
      if (vb.x < limits.x) {
        vb.x = limits.x;
      }
      if (vb.y < limits.y) {
        vb.y = limits.y;
      }
      if (vb.x + vb.width > limits.x2) {
        vb.x = limits.x2 - vb.width;
      }
      if (vb.y + vb.height > limits.y2) {
        vb.y = limits.y2 - vb.height;
      }
      return vb;
    };

    /**
     * Parse the viewbox string as defined in the spec for the svg tag.
     *
     * @param {String} viewBoxString
     *   A valid value of the `viewBox` attribute.
     *
     * @return {Object} viewBox
     *   A view box object. Contains numbers, in the format `{x, y, width, height}`.
     */
    parseViewBoxString = function(string) {
      var vb;
      vb = string.replace("\s+", " ").split(" ");
      return vb = {
        x: parseFloat(vb[0]),
        y: parseFloat(vb[1]),
        width: parseFloat(vb[2]),
        height: parseFloat(vb[3])
      };
    };

    /**
     * Get the mouse or first touch position from the `event`, relative to the SVG viewBox.
     *
     * @param {SVGElement} svgRoot
     *   The `<svg>` DOM object
     *
     * @param {MouseEvent|TouchEvent|jQueryEvent} event
     *   The DOM or jQuery event.
     *
     * @return {Object}
     *   Coordinates of the event. Contains numbers, in the format `{x, y}`.
     */
    getViewBoxCoordinatesFromEvent = function(svgRoot, event) {
      var ctm, foo, pos;
      foo = {
        x: null,
        y: null
      };
      if (event.type === "touchstart" || event.type === "touchmove") {
        if ((event.originalEvent != null) && (event.touches == null)) {
          foo.x = event.originalEvent.touches[0].clientX;
          foo.y = event.originalEvent.touches[0].clientY;
        } else {
          foo.x = event.touches[0].clientX;
          foo.y = event.touches[0].clientY;
        }
      } else {
        if (event.clientX != null) {
          foo.x = event.clientX;
          foo.y = event.clientY;
        } else {
          foo.x = event.originalEvent.clientX;
          foo.y = event.originalEvent.clientY;
        }
      }
      pos = svgRoot.createSVGPoint();
      pos.x = parseInt(foo.x, 10);
      pos.y = parseInt(foo.y, 10);
      ctm = svgRoot.getScreenCTM();
      ctm = ctm.inverse();
      pos = pos.matrixTransform(ctm);
      return pos;
    };
    return $.fn.svgPanZoom = function(options) {
      var ret;
      let _zoomCount = 0;
      let _limitCount = options.zoomLimit ?? 10;
      ret = [];
      this.each(function() {
        var $animationDiv, dragStarted, horizontalSizeIncrement, key, opts, preventClick, value, vb, verticalSizeIncrement, viewBox;
        opts = $.extend(true, {}, defaultOptions, options);
        opts.$svg = $(this);
        if (opts.animationTime == null) {
          opts.animationTime = 0;
        }
        opts.$svg[0].setAttribute("preserveAspectRatio", "xMidYMid meet");
        vb = $.extend({}, this.viewBox.baseVal);
        if (vb.x == null) {
          vb.x = 0;
        }
        if (vb.y == null) {
          vb.y = 0;
        }
        if (vb.width == null) {
          vb.width = 0;
        }
        if (vb.height == null) {
          vb.height = 0;
        }
        const SNAP_DECIMALS = 4;
        const snap = (n) => +Number(n).toFixed(SNAP_DECIMALS);
        let animLock = false;
        function withLock(fn, t){
          return function(...args){
            if (animLock) return;
            const time = (t ?? this.animationTime) || 0;
            animLock = time > 0;
            try { fn.apply(this, args); }
            finally {
              if (time > 0) setTimeout(()=>{ animLock = false; }, time + 20);
              else animLock = false;
            }
          };
        }
        function setVB(ctrl,x, y, w, h, t){
          // snap ก่อนส่งเข้า setViewBox เพื่อตัด error สะสม
          ctrl.setViewBox(snap(x), snap(y), snap(w), snap(h), t);
        }

        // =========================================================
        // เพิ่ม: Smooth Reset Animation (RAF) — ไม่กระทบ logic เดิมอื่นๆ
        // =========================================================
        let _resetRaf = 0;

        function _cancelResetAnim(){
          if (_resetRaf) cancelAnimationFrame(_resetRaf);
          _resetRaf = 0;
        }

        function _easeOutCubic(t){
          return 1 - Math.pow(1 - t, 3);
        }

        function _resetSmooth(ctrl, duration){
          // ยกเลิกแอนิเมชันเดิมถ้ามี (กันกดซ้ำแล้วเพี้ยน)
          _cancelResetAnim();

          const from = ctrl.getViewBox();
          const to = { ...ctrl.initialViewBox };

          // ถ้า duration <= 0 ให้ snap ทันทีแบบเดิม
          if (!duration || duration <= 0) {
            setVB(ctrl, to.x, to.y, to.width, to.height, 0);
            return;
          }

          const start = performance.now();

          // กันการกดซ้ำระหว่าง reset (ใช้ตัวแปรเดิม ไม่ไปยุ่งส่วนอื่น)
          animLock = true;

          const step = (now) => {
            const tRaw = (now - start) / duration;
            const t = tRaw >= 1 ? 1 : tRaw;
            const k = _easeOutCubic(t);

            const x = from.x + (to.x - from.x) * k;
            const y = from.y + (to.y - from.y) * k;
            const w = from.width + (to.width - from.width) * k;
            const h = from.height + (to.height - from.height) * k;

            // สำคัญ: setViewBox แบบ 0 ทุกเฟรม (ไม่ใช้ jQuery animate ของ lib)
            setVB(ctrl, x, y, w, h, 0);

            if (t < 1) {
              _resetRaf = requestAnimationFrame(step);
            } else {
              // จบงาน: snap exact เพื่อไม่ให้ “กระดิก/ไหล” รอบต่อไป
              setVB(ctrl, to.x, to.y, to.width, to.height, 0);
              _cancelResetAnim();
              animLock = false;
            }
          };

          _resetRaf = requestAnimationFrame(step);
        }
        // =========================================================

        if (opts.initialViewBox != null) {
          if (typeof opts.initialViewBox === "string") {
            vb = parseViewBoxString(opts.initialViewBox);
          } else if (typeof opts.initialViewBox === "object") {
            vb = $.extend({}, defaultViewBox, opts.initialViewBox);
          } else {
            throw "initialViewBox is of invalid type";
          }
        } else if (vb.x === 0 && vb.y === 0 && vb.width === 0 && vb.height === 0) {
          vb = defaultViewBox;
        }
        viewBox = vb;
        opts.initialViewBox = $.extend({}, viewBox);
        if (opts.limits == null) {
          horizontalSizeIncrement = viewBox.width * 0.15;
          verticalSizeIncrement = viewBox.height * 0.15;
          opts.limits = {
            x: viewBox.x - horizontalSizeIncrement,
            y: viewBox.y - verticalSizeIncrement,
            x2: viewBox.x + viewBox.width + horizontalSizeIncrement,
            y2: viewBox.y + viewBox.height + verticalSizeIncrement
          };
        }

        // =========================================================
        // ✅ แก้เฉพาะ reset: จากเดิม snap ทันที (t=0)
        //    เปลี่ยนเป็น reset แบบมี animation โดยใช้ RAF
        //    (ไม่ลบโค้ดเดิม แต่เก็บไว้เป็นคอมเมนต์)
        // =========================================================
        opts.reset = withLock(function(animationTime){
          _zoomCount = 0;
          // ถ้าไม่ได้ส่ง animationTime มา ให้ใช้ this.animationTime (ค่าเดิมของ lib)
          const dur = (animationTime == null ? this.animationTime : animationTime);
          _resetSmooth(this, dur);
        }, 0);
        // =========================================================

        opts.getViewBox = function() {
          return $.extend({}, viewBox);
        };
        $animationDiv = $("<div></div>");
        opts.setViewBox = function(x, y, width, height, animationTime) {
          if (animationTime == null) {
            animationTime = this.animationTime;
          }
          if (animationTime > 0) {
            $animationDiv.css({
              left: viewBox.x + "px",
              top: viewBox.y + "px",
              width: viewBox.width + "px",
              height: viewBox.height + "px"
            });
          }
          viewBox = {
            x: x != null ? x : viewBox.x,
            y: y != null ? y : viewBox.y,
            width: width ? width : viewBox.width,
            height: height ? height : viewBox.height
          };
          viewBox = checkLimits(viewBox, this.limits);
          if (animationTime > 0) {
            $animationDiv.stop().animate({
              left: viewBox.x,
              top: viewBox.y,
              width: viewBox.width,
              height: viewBox.height
            }, {
              duration: animationTime,
              easing: "linear",
              step: (function(value, properties) {
                var $div;
                $div = $animationDiv;
                this.$svg[0].setAttribute("viewBox", ($div.css("left").slice(0, -2)) + " " + ($div.css("top").slice(0, -2)) + " " + ($div.css("width").slice(0, -2)) + " " + ($div.css("height").slice(0, -2)));
              }).bind(this)
            });
          } else {
            this.$svg[0].setAttribute("viewBox", viewBox.x + " " + viewBox.y + " " + viewBox.width + " " + viewBox.height);
          }
        };
        opts.panLeft = function(amount, animationTime) {
          if (amount == null) {
            amount = this.panFactor;
          }
          if (animationTime == null) {
            animationTime = this.animationTime;
          }
          this.panRight(-amount, animationTime);
        };
        opts.panRight = function(amount, animationTime) {
          if (amount == null) {
            amount = this.panFactor;
          }
          if (animationTime == null) {
            animationTime = this.animationTime;
          }
          this.setViewBox(viewBox.x + amount, null, null, null, animationTime);
        };
        opts.panUp = function(amount, animationTime) {
          if (amount == null) {
            amount = this.panFactor;
          }
          if (animationTime == null) {
            animationTime = this.animationTime;
          }
          this.panDown(-amount, animationTime);
        };
        opts.panDown = function(amount, animationTime) {
          if (amount == null) {
            amount = this.panFactor;
          }
          if (animationTime == null) {
            animationTime = this.animationTime;
          }
          this.setViewBox(null, viewBox.y + amount, null, null, animationTime);
        };
        opts.zoomIn =withLock(function(amount, animationTime){
              if (_zoomCount>=_limitCount) return;
              _zoomCount = _zoomCount + 1;
              const a = amount ?? this.zoomFactor;
              zoomByCenter(this,1 + Math.abs(a), animationTime);
            });
        opts.zoomOut =  withLock(function(amount, animationTime){
            if (_zoomCount<=0) return;
            _zoomCount = _zoomCount - 1;
            const a = amount ?? this.zoomFactor;
            zoomByCenter(this,1 / (1 + Math.abs(a)), animationTime);
        });
        opts.setCenter = function(x, y, animationTime) {
          if (animationTime == null) {
            animationTime = this.animationTime;
          }
          this.setViewBox(x - viewBox.width / 2, y - viewBox.height / 2, viewBox.width, viewBox.height, animationTime);
        };
        for (key in opts) {
          if (!hasProp.call(opts, key)) continue;
          value = opts[key];
          if (typeof value === "function") {
            opts.key = value.bind(opts);
          }
        }
        opts.$svg.on("mousewheel DOMMouseScroll MozMousePixelScroll", (function(ev) {
          var delta, minHeight, minWidth, newMousePosition, newViewBox, newcenter, oldDistanceFromCenter, oldMousePosition, oldViewBox, oldcenter, reductionFactor;
          delta = parseInt(ev.originalEvent.wheelDelta || -ev.originalEvent.detail);
          if (delta === 0 || opts.events.mouseWheel !== true) {
            return;
          }
          oldViewBox = this.getViewBox();
          ev.preventDefault();
          ev.stopPropagation();
          oldMousePosition = getViewBoxCoordinatesFromEvent(this.$svg[0], ev);
          oldcenter = {
            x: viewBox.x + viewBox.width / 2,
            y: viewBox.y + viewBox.height / 2
          };
          oldDistanceFromCenter = {
            x: oldcenter.x - oldMousePosition.x,
            y: oldcenter.y - oldMousePosition.y
          };
          if (delta > 0) {
            this.zoomIn(void 0, 0);
            minWidth = this.initialViewBox.width / this.maxZoom;
            minHeight = this.initialViewBox.height / this.maxZoom;
            if (viewBox.width < minWidth) {
              reductionFactor = minWidth / viewBox.width;
              viewBox.width = minWidth;
              viewBox.height = viewBox.height * reductionFactor;
            }
            if (viewBox.height < minHeight) {
              reductionFactor = minHeight / viewBox.height;
              viewBox.height = minHeight;
              viewBox.width = viewBox.width * reductionFactor;
            }
          } else {
            this.zoomOut(void 0, 0);
          }
          newMousePosition = getViewBoxCoordinatesFromEvent(this.$svg[0], ev);
          newcenter = {
            x: oldcenter.x + (oldMousePosition.x - newMousePosition.x),
            y: oldcenter.y + (oldMousePosition.y - newMousePosition.y)
          };
          this.setCenter(newcenter.x, newcenter.y, 0);
          newViewBox = this.getViewBox();
          this.setViewBox(oldViewBox.x, oldViewBox.y, oldViewBox.width, oldViewBox.height, 0);
          this.setViewBox(newViewBox.x, newViewBox.y, newViewBox.width, newViewBox.height);
        }).bind(opts));
        opts.$svg.dblclick((function(ev) {
          if (opts.events.doubleClick !== true) {
            return;
          }
          ev.preventDefault();
          ev.stopPropagation();
          return this.zoomIn();
        }).bind(opts));
        opts.$svg[0].addEventListener("click", function(ev) {
          var preventClick;
          if (preventClick) {
            preventClick = false;
            ev.stopPropagation();
            return ev.preventDefault();
          }
        }, true);
        dragStarted = false;
        preventClick = false;
        opts.$svg.on("mousedown touchstart", (function(ev) {
          var $body, domBody, initialViewBox, mouseMoveCallback, mouseUpCallback, oldCursor;
          if (dragStarted) {
            return;
          }
          if (opts.events.drag !== true || (ev.type === "mousedown" && ev.which !== 1)) {
            return;
          }
          dragStarted = true;
          preventClick = false;
          var didDrag = false;
          // On touch devices, avoid preventing default on touchstart so taps on <path> can still generate click.
          // We'll prevent default only once we detect an actual drag movement.
          if (ev.type === "mousedown") {
            ev.preventDefault();
            ev.stopPropagation();
          }
          initialViewBox = $.extend({}, viewBox);
          $body = $(window.document.body);
          domBody = $body[0];
          oldCursor = $body.css("cursor");
          if (this.events.dragCursor != null) {
            $body.css("cursor", this.events.dragCursor);
          }
          mouseMoveCallback = (function(ev2) {
            var currentMousePosition, initialMousePosition;
            // For touch, only prevent default after we are sure this is a drag (otherwise it kills tap-to-click).
            if (ev2.type === "mousemove" || didDrag) {
              ev2.preventDefault();
              ev2.stopPropagation();
            }
            initialMousePosition = getViewBoxCoordinatesFromEvent(this.$svg[0], ev);
            currentMousePosition = getViewBoxCoordinatesFromEvent(this.$svg[0], ev2);
            (function(){
            // Determine whether this interaction is a drag (vs a simple tap/click).
            var p1 = (ev.originalEvent && ev.originalEvent.touches && ev.originalEvent.touches[0]) || ev;
            var p2 = (ev2.originalEvent && ((ev2.originalEvent.touches && ev2.originalEvent.touches[0]) ||
                     (ev2.originalEvent.changedTouches && ev2.originalEvent.changedTouches[0]))) || ev2;
            var dx = (p2.pageX || p2.clientX || 0) - (p1.pageX || p1.clientX || 0);
            var dy = (p2.pageY || p2.clientY || 0) - (p1.pageY || p1.clientY || 0);
            if (Math.sqrt(dx*dx + dy*dy) > 3) {
              didDrag = true;
              preventClick = true;
            }
          })()
            this.setViewBox(initialViewBox.x + initialMousePosition.x - currentMousePosition.x, initialViewBox.y + initialMousePosition.y - currentMousePosition.y, null, null, 0);
          }).bind(opts);
          mouseUpCallback = (function(ev2) {
            if (ev2.type === "mouseout" && ev2.target !== ev2.currentTarget) {
              return;
            }
            // Don't preventDefault on touchend unless a real drag occurred, otherwise tap won't produce click.
            if (ev2.type === "mouseup" || didDrag) {
              ev2.preventDefault();
              ev2.stopPropagation();
            }
            domBody.removeEventListener("mousemove", mouseMoveCallback, true);
            domBody.removeEventListener("touchmove", mouseMoveCallback, true);
            domBody.removeEventListener("mouseup", mouseUpCallback, true);
            domBody.removeEventListener("touchend", mouseUpCallback, true);
            domBody.removeEventListener("touchcancel", mouseUpCallback, true);
            domBody.removeEventListener("mouseout", mouseUpCallback, true);
            if (this.events.dragCursor != null) {
              $body.css("cursor", oldCursor);
            }
            dragStarted = false;
          }).bind(opts);
          domBody.addEventListener("mousemove", mouseMoveCallback, true);
          domBody.addEventListener("touchmove", mouseMoveCallback, true);
          domBody.addEventListener("mouseup", mouseUpCallback, true);
          domBody.addEventListener("touchend", mouseUpCallback, true);
          domBody.addEventListener("touchcancel", mouseUpCallback, true);
          domBody.addEventListener("mouseout", mouseUpCallback, true);
        }).bind(opts));
        opts.setViewBox(vb.x, vb.y, vb.width, vb.height, 0);
        ret.push(opts);
      });
      if (ret.length === 0) {
        return null;
      }
      if (ret.length === 1) {
        return ret[0];
      } else {
        return ret;
      }
    };
  })(jQuery);

}).call(this);

//# sourceMappingURL=jquery.svg.pan.zoom.js.map
