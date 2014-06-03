/*
The MIT License
 
Copyright (C) 2011 Jackson Dunstan
Rewritten to JavaScript by Andrew Makousky.
 
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

/**
 *   Make the look up table
 *   @param numDigits Number of digits places of precision
 *   @param mathFunc Math function to call to generate stored values.
 *                   Must be valid on [0,2pi).
 *   @throws Error If mathFunc is null or invalid on [0,2pi)
 */
var TrigLUT = function(numDigits, mathFunc) {
  /** The static TWO_PI cached as a non-static field*/
  this.TWO_PI = 2.0 * Math.PI;

  /** Table of trig function values*/
  this.table = [];

  /** 10^decimals of precision*/
  var pow = this.pow = Math.pow(10, numDigits);

  this.val = TrigLUT.val;
  this.valPositive = TrigLUT.valPositive;
  this.valNormalized = TrigLUT.valNormalized;
  this.valNormalizedPositive = TrigLUT.valNormalizedPositive;


  var round = 1.0 / pow;
  var len = 1 + this.TWO_PI * pow;
  var table = this.table = [];

  var theta = 0;
  for (var i = 0; i < len; ++i) {
    table.push(mathFunc(theta));
    theta += round;
  }
};

/** 2 * PI, the number of radians in a circle*/
TrigLUT.TWO_PI = 2.0 * Math.PI;

/**
 *   Look up the value of the given number of radians
 *   @param radians Radians to look up the value of
 *   @return The value of the given number of radians
 */
TrigLUT.val = function(radians) {
  return radians >= 0 ?
    this.table[~~((radians % this.TWO_PI) * this.pow)] :
    this.table[~~((this.TWO_PI + radians % this.TWO_PI) * this.pow)];
};

/**
 *   Look up the value of the given number of radians
 *   @param radians Radians to look up the value of. Must be positive.
 *   @return The sine of the given number of radians
 *   @throws RangeError If radians is not positive
 */
TrigLUT.valPositive = function(radians) {
  return this.table[~~((radians % this.TWO_PI) * this.pow)];
};

/**
 *   Look up the value of the given number of radians
 *   @param radians Radians to look up the value of. Must be on (-2pi,2pi).
 *   @return The value of the given number of radians
 *   @throws RangeError If radians is not on (-2pi,2pi)
 */
TrigLUT.valNormalized = function(radians) {
  return radians >= 0 ?
    this.table[~~(radians * this.pow)] :
    this.table[~~((this.TWO_PI + radians) * this.pow)];
};

/**
 *   Look up the value of the given number of radians
 *   @param radians Radians to look up the value of. Must be on [0,2pi).
 *   @return The value of the given number of radians
 *   @throws RangeError If radians is not on [0,2pi)
 */
TrigLUT.valNormalizedPositive = function(radians) {
  return this.table[~~(radians * this.pow)];
};
