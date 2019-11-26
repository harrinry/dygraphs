/**
 * @license
 * Copyright 2012 Dan Vanderkam (danvdk@gmail.com)
 * MIT-licensed (http://opensource.org/licenses/MIT)
 */

/*global Dygraph:false */

'use strict';

/*
Bits of jankiness:
- Direct layout access
- Direct area access
- Should include calculation of ticks, not just the drawing.

Options left to make axis-friendly.
  ('drawAxesAtZero')
  ('xAxisHeight')
*/

import * as utils from '../dygraph-utils';

/**
 * Draws the axes. This includes the labels on the x- and y-axes, as well
 * as the tick marks on the axes.
 * It does _not_ draw the grid lines which span the entire chart.
 */
var axes = function() {
  this.axisHeaders_ = [];
  this.xlabels_ = [];
  this.ylabels_ = [];
};

axes.prototype.toString = function() {
  return 'Axes Plugin';
};

axes.prototype.activate = function(g) {
  return {
    layout: this.layout,
    clearChart: this.clearChart,
    willDrawChart: this.willDrawChart
  };
};

axes.prototype.layout = function(e) {
  var g = e.dygraph;

  if (g.getOptionForAxis('drawAxis', 'y')) {
    var w = g.getOptionForAxis('axisLabelWidth', 'y') + 2 * g.getOptionForAxis('axisTickSize', 'y');
    e.reserveSpaceLeft(w);
  }

  if (g.getOptionForAxis('drawAxis', 'x')) {
    var h;
    // NOTE: I think this is probably broken now, since g.getOption() now
    // hits the dictionary. (That is, g.getOption('xAxisHeight') now always
    // has a value.)
    if (g.getOption('xAxisHeight')) {
      h = g.getOption('xAxisHeight');
    } else {
      h = g.getOptionForAxis('axisLabelFontSize', 'x') + 2 * g.getOptionForAxis('axisTickSize', 'x');
    }
    e.reserveSpaceBottom(h);
  }

  // if there is a y2
  if (g.numAxes() >= 2) {
    if (g.getOptionForAxis('drawAxis', 'y2')) {
      var w = g.getOptionForAxis('axisLabelWidth', 'y2') + 2 * g.getOptionForAxis('axisTickSize', 'y2');
      e.reserveSpaceRight(w);
    }
  }

  // if there is a y3
  if (g.numAxes() >= 3) {
    if (g.getOptionForAxis('drawAxis', 'y3')) {
      var w = g.getOptionForAxis('axisLabelWidth', 'y3') + 2 * g.getOptionForAxis('axisTickSize', 'y3');
      e.reserveSpaceLeft(w);
    }
  }

  // if there is a y3
  if (g.numAxes() >= 4) {
    if (g.getOptionForAxis('drawAxis', 'y4')) {
      var w = g.getOptionForAxis('axisLabelWidth', 'y4') + 2 * g.getOptionForAxis('axisTickSize', 'y4');
      e.reserveSpaceRight(w);
    }
  }

  if (g.numAxes() > 4) {
    g.error('Only four y-axes are supported at this time. (Trying to use ' + g.numAxes() + ')');
  }
};

axes.prototype.detachLabels = function() {
  function removeArray(ary) {
    for (var i = 0; i < ary.length; i++) {
      var el = ary[i];
      if (el.parentNode) el.parentNode.removeChild(el);
    }
  }

  removeArray(this.xlabels_);
  removeArray(this.ylabels_);
  removeArray(this.axisHeaders_);
  this.xlabels_ = [];
  this.ylabels_ = [];
  this.axisHeaders_ = [];
};

axes.prototype.clearChart = function(e) {
  this.detachLabels();
};

axes.prototype.willDrawChart = function(e) {
  var g = e.dygraph;

  if (!g.getOptionForAxis('drawAxis', 'x') &&
      !g.getOptionForAxis('drawAxis', 'y') &&
      !g.getOptionForAxis('drawAxis', 'y2')) {
    return;
  }

  // Round pixels to half-integer boundaries for crisper drawing.
  function halfUp(x)  { return Math.round(x) + 0.5; }
  function halfDown(y){ return Math.round(y) - 0.5; }

  var context = e.drawingContext;
  var containerDiv = e.canvas.parentNode;
  var canvasWidth = g.width_;  // e.canvas.width is affected by pixel ratio.
  var canvasHeight = g.height_;

  var label, x, y, tick, i;

  var makeLabelStyle = function(axis) {
    return {
      position: 'absolute',
      fontSize: g.getOptionForAxis('axisLabelFontSize', axis) + 'px',
      width: g.getOptionForAxis('axisLabelWidth', axis) + 'px',
    };
  };

  var labelStyles = {
    x: makeLabelStyle('x'),
    y: makeLabelStyle('y'),
    y2: makeLabelStyle('y2')
  };

  var makeDiv = function(txt, axis, prec_axis) {
    /*
     * This seems to be called with the following three sets of axis/prec_axis:
     * x: undefined
     * y: y1
     * y: y2
     */
    var div = document.createElement('div');
    var labelStyle = labelStyles[prec_axis == 'y2' ? 'y2' : axis];
    utils.update(div.style, labelStyle);
    // TODO: combine outer & inner divs
    var inner_div = document.createElement('div');
    inner_div.className = 'dygraph-axis-label' +
                          ' dygraph-axis-label-' + axis +
                          (prec_axis ? ' dygraph-axis-label-' + prec_axis : '');
    inner_div.innerHTML = txt;
    div.appendChild(inner_div);
    return div;
  };

  // axis lines
  context.save();

  var layout = g.layout_;
  var area = e.dygraph.plotter_.area;

  // Helper for repeated axis-option accesses.
  var makeOptionGetter = function(axis) {
    return function(option) {
      return g.getOptionForAxis(option, axis);
    };
  };

  // Helper for finding the foreground text color based on the background color
  function idealTextColor(bgColor) {
    function getRGBComponents(color) {

      var r = color.substring(1, 3);
      var g = color.substring(3, 5);
      var b = color.substring(5, 7);

      return {
        R: parseInt(r, 16),
        G: parseInt(g, 16),
        B: parseInt(b, 16)
      };
    }

    var nThreshold = 105;
    var components = getRGBComponents(bgColor);
    var bgDelta = (components.R * 0.299) + (components.G * 0.587) + (components.B * 0.114);

    return ((255 - bgDelta) < nThreshold) ? "#000000" : "#ffffff";
  }

  // draw axis header labels
  // todo : for loop
  for (let axisHeaderIndex = 0; axisHeaderIndex < g.numAxes(); axisHeaderIndex++) {
    let options = null;
    let left = 0;

    if (axisHeaderIndex === 0) {
      options = makeOptionGetter('y');
      left = area.x - options('axisLabelWidth') - options('axisTickSize');
    }
    else if (axisHeaderIndex === 1) {
      options = makeOptionGetter('y2');
      left = area.x + area.w + options('axisTickSize');
    }
    else if (axisHeaderIndex === 2) {
      options = makeOptionGetter('y3');

      // get the position of the y1 ticks
      let y1OptionsGetter = makeOptionGetter('y');
      let y1TickPosition = area.x - y1OptionsGetter('axisLabelWidth') - y1OptionsGetter('axisTickSize');

      left = y1OptionsGetter('drawAxis') ?
          // if y1 is visible
          y1TickPosition - options('axisLabelWidth') - options('axisTickSize')
          // if its not, draw where y1 tick would be
          : y1TickPosition;
    }
    else if (axisHeaderIndex === 3) {
      options = makeOptionGetter('y4');

      // get the position of the y2 ticks
      let y2OptionsGetter = makeOptionGetter('y2');
      let y2TickPosition = area.x + area.w + y2OptionsGetter('axisTickSize');

      left = y2OptionsGetter('drawAxis') ?
          // if y2 is visible
          y2TickPosition + options('axisLabelWidth') + options('axisTickSize')
          // if its not, draw where y2 tick would be
          : y2TickPosition;
    }
    else return;

    let text = options('axisLabelHeader');

    // if the label header is not specified, don't draw
    if (( ! text) || (! options('drawAxis')) ) continue;

    // create the div
    let headerLabel = document.createElement('div');

    // insert the text
    headerLabel.innerHTML = text;

    headerLabel.style.left = left + 'px';
    headerLabel.style.width = options('axisLabelWidth') + 'px';
    headerLabel.style.fontSize = options('axisLabelFontSize') + 'px';
    headerLabel.style.borderColor = options('tickTextColor');
    headerLabel.style.color = options('tickTextColor');
    headerLabel.classList.add('dygraph-axis-header');

    containerDiv.appendChild(headerLabel);
    this.axisHeaders_.push(headerLabel);
  }

  if (layout.yticks && layout.yticks.length > 0) {
    var num_axes = g.numAxes();
    layout.yticks.forEach(tick => {
      if (tick.label === undefined) return;  // this tick only has a grid line.

      var prec_axis = null;
      var getAxisOption = null;

      // for y (y1) axis
      if (tick.axis === 0) {
        x = area.x;
        prec_axis = 'y1';
        getAxisOption = makeOptionGetter('y');
      }
      // for y2 axis
      else if (tick.axis === 1) {
        x = area.x + area.w;
        prec_axis = 'y2';
        getAxisOption = makeOptionGetter('y2');
      }
      // for y3 axis
      else if (tick.axis === 2) {
        x = area.x;
        prec_axis = 'y3';
        getAxisOption = makeOptionGetter('y3');
      }
      // for y4 axis
      else if (tick.axis === 3) {
        x = area.x + area.w;
        prec_axis = 'y4';
        getAxisOption = makeOptionGetter('y4');
      }
      // otherwise, throw error
      else {
        throw new Error("attempting to draw tick on unknown axis " + tick.axis);
      }

      // dont draw the tick if this axis is not being drawn
      if (! getAxisOption('drawAxis')) return;

      var fontSize = getAxisOption('axisLabelFontSize');
      y = area.y + tick.pos * area.h;

      /* Tick marks are currently clipped, so don't bother drawing them.
      context.beginPath();
      context.moveTo(halfUp(x), halfDown(y));
      context.lineTo(halfUp(x - sgn * this.attr_('axisTickSize')), halfDown(y));
      context.closePath();
      context.stroke();
      */

      label = makeDiv(tick.label, 'y', num_axes == 2 ? prec_axis : null);
      var top = (y - fontSize / 2);
      if (top < 0) top = 0;

      if (top + fontSize + 3 > canvasHeight) {
        label.style.bottom = '0';
      } else {
        label.style.top = top + 'px';
      }
      // TODO: replace these with css classes?
      if (tick.axis === 0) { // y1
        label.style.left = (area.x - getAxisOption('axisLabelWidth') - getAxisOption('axisTickSize')) + 'px';
      } else if (tick.axis === 1 ) { // y2
        label.style.left = (area.x + area.w + getAxisOption('axisTickSize')) + 'px';
      } else if (tick.axis === 2 ) { // y3
        // get the position of the y ticks
        let y1OptionsGetter = makeOptionGetter('y');
        let y1TickPosition = area.x - y1OptionsGetter('axisLabelWidth') - y1OptionsGetter('axisTickSize');

        label.style.left = y1OptionsGetter('drawAxis') ?
                           // if y1 is visible
                           (y1TickPosition - getAxisOption('axisLabelWidth') - getAxisOption('axisTickSize')) + 'px'
                           // if its not, draw where y1 tick would be
                           : y1TickPosition + 'px';
      } else if (tick.axis === 3 ) { // y4
        // get the position of the y2 ticks
        let y2OptionsGetter = makeOptionGetter('y2');
        let y2TickPosition = area.x + area.w + y2OptionsGetter('axisTickSize');

        label.style.left = y2OptionsGetter('drawAxis') ?
                          // if y2 is visible
                          (y2TickPosition + getAxisOption('axisLabelWidth') + getAxisOption('axisTickSize')) + 'px'
                          // if its not, draw where y2 tick would be
                          : y2TickPosition + 'px';
      }

      var backgroundColor = getAxisOption('tickTextColor');

      label.style.backgroundColor = backgroundColor;
      label.style.borderRadius = '2px';
      label.style.color = idealTextColor(backgroundColor);
      label.style.textAlign = 'center';
      label.style.width = getAxisOption('axisLabelWidth') + 'px';

      containerDiv.appendChild(label);
      this.ylabels_.push(label);
    });

    // The lowest tick on the y-axis often overlaps with the leftmost
    // tick on the x-axis. Shift the bottom tick up a little bit to
    // compensate if necessary.
    var bottomTick = this.ylabels_[0];
    // Interested in the y2 axis also?
    var fontSize = g.getOptionForAxis('axisLabelFontSize', 'y');
    var bottom = parseInt(bottomTick.style.top, 10) + fontSize;
    if (bottom > canvasHeight - fontSize) {
      bottomTick.style.top = (parseInt(bottomTick.style.top, 10) -
          fontSize / 2) + 'px';
    }

    // draw a vertical line on the left to separate the chart from the labels.
    var axisX;
    if (g.getOption('drawAxesAtZero')) {
      var r = g.toPercentXCoord(0);
      if (r > 1 || r < 0 || isNaN(r)) r = 0;
      axisX = halfUp(area.x + r * area.w);
    } else {
      axisX = halfUp(area.x);
    }

    context.strokeStyle = g.getOptionForAxis('axisLineColor', 'y');
    context.lineWidth = g.getOptionForAxis('axisLineWidth', 'y');

    context.beginPath();
    context.moveTo(axisX, halfDown(area.y));
    context.lineTo(axisX, halfDown(area.y + area.h));
    context.closePath();
    context.stroke();

    // if there's a secondary y-axis, draw a vertical line for that, too.
    if (g.numAxes() == 2) {
      context.strokeStyle = g.getOptionForAxis('axisLineColor', 'y2');
      context.lineWidth = g.getOptionForAxis('axisLineWidth', 'y2');
      context.beginPath();
      context.moveTo(halfDown(area.x + area.w), halfDown(area.y));
      context.lineTo(halfDown(area.x + area.w), halfDown(area.y + area.h));
      context.closePath();
      context.stroke();
    }
  }

  if (g.getOptionForAxis('drawAxis', 'x')) {
    if (layout.xticks) {
      var getAxisOption = makeOptionGetter('x');
      layout.xticks.forEach(tick => {
        if (tick.label === undefined) return;  // this tick only has a grid line.
        x = area.x + tick.pos * area.w;
        y = area.y + area.h;

        /* Tick marks are currently clipped, so don't bother drawing them.
        context.beginPath();
        context.moveTo(halfUp(x), halfDown(y));
        context.lineTo(halfUp(x), halfDown(y + this.attr_('axisTickSize')));
        context.closePath();
        context.stroke();
        */

        label = makeDiv(tick.label, 'x');
        label.style.textAlign = 'center';
        label.style.top = (y + getAxisOption('axisTickSize')) + 'px';

        var left = (x - getAxisOption('axisLabelWidth')/2);
        if (left + getAxisOption('axisLabelWidth') > canvasWidth) {
          left = canvasWidth - getAxisOption('axisLabelWidth');
          label.style.textAlign = 'right';
        }
        if (left < 0) {
          left = 0;
          label.style.textAlign = 'left';
        }

        label.style.left = left + 'px';
        label.style.width = getAxisOption('axisLabelWidth') + 'px';
        containerDiv.appendChild(label);
        this.xlabels_.push(label);
      });
    }

    context.strokeStyle = g.getOptionForAxis('axisLineColor', 'x');
    context.lineWidth = g.getOptionForAxis('axisLineWidth', 'x');
    context.beginPath();
    var axisY;
    if (g.getOption('drawAxesAtZero')) {
      var r = g.toPercentYCoord(0, 0);
      if (r > 1 || r < 0) r = 1;
      axisY = halfDown(area.y + r * area.h);
    } else {
      axisY = halfDown(area.y + area.h);
    }
    context.moveTo(halfUp(area.x), axisY);
    context.lineTo(halfUp(area.x + area.w), axisY);
    context.closePath();
    context.stroke();
  }

  context.restore();
};

export default axes;
