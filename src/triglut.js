/* A simple trigonometric lookup table implementation.

The MIT License

Copyright (C) 2011 Jackson Dunstan
Rewritten to JavaScript and modified by Andrew Makousky.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
*/

import "oevns";

/**
 *   Make the look up table
 *   @constructor
 *   @param {function} mathFunc - Math function to call to generate
 *   stored values. Must be valid on [0,range).
 *   @param {uint} numDigits - Number of digits places of precision
 *   @param {Number} range - Maximum unique value of function. Must be
 *   greater than zero. Typically set to (2 * Math.PI).
 *   @throws Error If mathFunc is null or invalid on [0,range)
 */
var TrigLUT = function(mathFunc, numDigits, range) {
  /** Table of trig function values */
  this.table = [];

  /** 10^decimals of precision */
  this.pow = Math.pow(10, numDigits);
  var pow = this.pow;

  /** Maximum unique value of function */
  this.range = range;

  var round = 1.0 / pow;
  var len = 1 + this.range * pow;
  var table = this.table = [];

  var theta = 0;
  for (var i = 0; i < len; ++i) {
    table.push(mathFunc(theta));
    theta += round;
  }
};

/** 2 * PI, the number of radians in a circle */
TrigLUT.TWO_PI = 2.0 * Math.PI;

/**
 *   Look up the value of the given number of radians
 *   @param {Number} radians - Radians to look up the value of
 *   @returns The value of the given number of radians
 */
TrigLUT.prototype.val = function(radians) {
  return radians >= 0 ?
    this.table[0|((radians % this.range) * this.pow)] :
    this.table[0|((this.range + radians % this.range) * this.pow)];
};

/**
 *   Look up the value of the given number of radians
 *   @param {Number} radians - Radians to look up the value of. Must
 *   be positive.
 *   @returns The value of the given number of radians
 *   @throws RangeError If radians is not positive
 */
TrigLUT.prototype.valPositive = function(radians) {
  return this.table[0|((radians % this.range) * this.pow)];
};

/**
 *   Look up the value of the given number of radians
 *   @param {Number} radians - Radians to look up the value of. Must
 *   be on (-2pi,2pi).
 *   @returns The value of the given number of radians
 *   @throws RangeError If radians is not on (-2pi,2pi)
 */
TrigLUT.prototype.valNormalized = function(radians) {
  return radians >= 0 ?
    this.table[0|(radians * this.pow)] :
    this.table[0|((this.range + radians) * this.pow)];
};

/**
 *   Look up the value of the given number of radians
 *   @param {Number} radians - Radians to look up the value of. Must
 *   be on [0,2pi).
 *   @returns The value of the given number of radians
 *   @throws RangeError If radians is not on [0,2pi)
 */
TrigLUT.prototype.valNormalizedPositive = function(radians) {
  return this.table[0|(radians * this.pow)];
};

OEV.TrigLUT = TrigLUT;
