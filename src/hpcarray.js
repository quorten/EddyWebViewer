/* HPCArray -- High Performance Compatible Array -- An augmented
   JavaScript Array class that compensates for a wide variety of
   missing general and performance features from the native Array
   class.  This class is most notably useful for achieving accelerated
   performance on older or less feature-full browsers.  For newer
   browsers, the typed array extensions will cover 90% of what this
   class covers.  */

import "oevns";

var HPCArray = function(size) {
  if (size) this.length = size >>> 0;
};

OEV.HPCArray = HPCArray;
HPCArray.prototype = new Array();
HPCArray.prototype.constructor = HPCArray;

/* Push and pop implementations, in case the native implementation
   does not have them.  */

if (typeof(Array.prototype.push) != 'function')
  HPCArray.prototype.push = function() { 
    var i = 0, l = arguments.length;
    var len = this.length >>> 0;
    while (i < l) {
      this[len] = arguments[i++];
      len = len + 1 >>> 0;
    }
    return this.length;
  };

if (typeof(Array.prototype.pop) != 'function')
  HPCArray.prototype.pop = function() {
    var v, len = this.length >>> 0;
    if (len) {
      v = this[--len];
      delete this[len];
    }
    this.length = len;
    return v;
  };

/* `Array.prototype.join()' is not always the fastest way to join
   together array elements into a string.  The following functions
   provide a range of different methods to join array elements into a
   string:

   * iter -- Use '+=' concatenation.

   * chunk -- Use '+' combination to combine 1024 elements, then '+='
     concatenation to append the chunk to the result.

   * binary -- Use function-syntax recursion and '+' operators to join
     the elements.

   Each general method comes in two varieties:

   * concat -- join without a separator string

   * join -- join with a separator string, just like
     `Array.prototype.join()'

   Additionally, if feature detection is used at startup, then the
   generic functions may be used to automatically choose the fastest
   variant, including native `join()'.  */

HPCArray.prototype.iterConcat = function() {
  var result = "";
  for (var i = 0, length = this.length; i < length; i++)
    result += this[i];
  return result;
};

HPCArray.prototype.iterJoin = function(sep) {
  var result = "", length = this.length;
  if (length > 0) result += this[0];
  for (var i = 1; i < length; i++)
    result += sep + this[i];
  return result;
};

HPCArray.makeChunkKernels = function(size) {
  /* Make the Concat kernel.  */
  var kernel, i = 1, j = 1;
  var result = [ "kernel = function(a, i) {\n  return \"\" + a[i+0]" ];
  do {
    if (i + 6 < size) {
      for (; j < 6; j++)
	result.push(" + a[i+" + (i++) + "]");
      j = 0; result.push("\n   ");
    } else {
      while (i < size)
	result.push(" + a[i+" + (i++) + "]");
    }
  } while (i < size);
  result.push(";\n};");
  eval(result.join(""));
  kernel.size = size;
  HPCArray.prototype.chunkConcatKernel = kernel;

  /* Make the Join kernel.  */
  kernel = null, i = 1, j = 1;
  result = [ "kernel = function(a, i, sep) {\n  return sep + a[i+0]" ];
  do {
    if (i + 4 < size) {
      for (; j < 4; j++)
	result.push(" + sep + a[i+" + (i++) + "]");
      j = 0; result.push("\n   ");
    } else {
      while (i < size)
	result.push(" + sep + a[i+" + (i++) + "]");
    }
  } while (i < size);
  result.push(";\n};");
  eval(result.join(""));
  kernel.size = size;
  HPCArray.prototype.chunkJoinKernel = kernel;
};

HPCArray.makeChunkKernels(1024);

HPCArray.prototype.chunkConcat = function() {
  var a = this, length = this.length;
  var chunkKernel = this.chunkConcatKernel;
  var kernelSize = chunkKernel.size;
  var result = "";
  var i = 0;
  if (length >= kernelSize)
    for (; i < length; i += kernelSize)
      result += chunkKernel(a, i);
  if (i > length)
    i -= kernelSize;
  if (i < length) {
    var tailResult = "";
    while (i < length)
      tailResult += a[i++];
    result += tailResult;
  }
  return result;
};

HPCArray.prototype.chunkJoin = function(sep) {
  var a = this, length = this.length;
  var chunkKernel = this.chunkJoinKernel;
  var kernelSize = chunkKernel.size;
  var result = "";
  if (length > 0) result += a[0];
  var i = 1;
  if (length >= kernelSize + 1)
    for (; i < length; i += kernelSize)
      result += chunkKernel(a, i, sep);
  if (i > length)
    i -= kernelSize;
  if (i < length) {
    var tailResult = "";
    while (i < length)
      tailResult += sep + a[i++];
    result += tailResult;
  }
  return result;
};

HPCArray.prototype.bcIntern = function(start, length) {
  switch (length) {
  case 0:
    return "";
  case 1:
    return "" + this[start];
  default:
    var leftStart = start, leftLen = (0|(length / 2));
    var rightStart = leftStart + leftLen, rightLen = length - leftLen;
    return this.bcIntern(leftStart, leftLen) +
      this.bcIntern(rightStart, rightLen);
  }
};

HPCArray.prototype.binaryConcat = function() {
  /* NOTE: For performance reasons, we avoid using a nested function
     definition here.  */
  return this.bcIntern(this, 0, this.length);
};

HPCArray.prototype.bjIntern = function(sep, start, length) {
  switch (length) {
  case 0:
    return "";
  case 1:
    return "" + this[start];
  default:
    var leftStart = start, leftLen = (0|(length / 2));
    var rightStart = leftStart + leftLen, rightLen = length - leftLen;
    return this.bjIntern(sep, leftStart, leftLen) + sep +
      this.bjIntern(sep, rightStart, rightLen);
  }
};

HPCArray.prototype.binaryJoin = function(sep) {
  return this.bjIntern(sep, 0, this.length);
};

/* Chunking.  Native JavaScript array implementations are not very
   efficient when it comes to an array with a very large number of
   elements.  A practical workaround for this problem is to use nested
   arrays where the internal arrays are no more than 1024 elements in
   size.  This implementation entirely takes care of chunking for the
   programmer, and the programmer only needs to use this high-level
   interface.  */

HPCArray.prototype.chunkedInit = function(chunkSize, autoStringify) {
  this.chunkSize = chunkSize;
  this.autoStringify = autoStringify;
  this[0] = [];
  this.chunkedLength = 0;
};

HPCArray.prototype.chunkedPush(elmt) {
  var chunkSize = this.chunkSize;
  var lastIdx = this.length - 1;
  var lastChunk = this[lastIdx];
  if (lastChunk.length >= chunkSize) {
    /* Create a new chunk.  */
    var newChunk = [ elmt ];
    if (autoStringify)
      this[lastIdx] = lastChunk.toString();
    this.push(newChunk);
  } else {
    /* Append to the existing chunk.  */
    lastChunk.push(elmt);
  }
  return ++this.chunkedLength;
};

HPCArray.prototype.chunkedPop() {
  if (this.length == 0)
    return; /* undefined */
  this.chunkedLength--;
  var lastIdx = this.length - 1;
  var lastChunk = this[lastIdx];
  if (lastChunk.length > 0)
    return lastChunk.pop();
  else {
    this.pop();
    return this[lastIdx-1].pop();
  }
};

/* Get the element at the given logical index of a chunked array.  */
HPCArray.prototype.chunkedAt(index) {
  var chunkSize = this.chunkSize;
  var chunkIdx = 0|(index / chunkSize), chunkOffset = index % chunkSize;
  if (chunkIdx < this.length)
    return this[chunkIdx][chunkOffset];
  /* return undefined */
}

/* Get the element at the given logical index of a chunked array.  No
   assumptions are made that chunks earlier in the array are of the
   expected length.  */
HPCArray.prototype.disorgChunkedAt(index) {
  var length = this.length, chunkSize = this.chunkSize;
  var curChunk = 0;
  var i = 0;
  while (curChunk < length && i < index) {
    var curChunk_len = this[curChunk].length;
    if (i + curChunk_len < index)
      { i += curChunk_len; churChunk++; }
    else {
      var chunkOffset = index - i;
      if (chunkOffset < curChunk_len)
	return this[curChunk][chunkOffset];
    }
  }
  /* return undefined */
}

/* Replace the element at the given index with the new element.  */

/* Chunking, with 8/16-bit integers packed as Unicode characters.
   JavaScript implementations are more efficient when dealing with
   large strings that don't change very much than is the case for
   large arrays of small data elements.  However, modifying large
   strings is expensive.  */

/* Wrappers.  If typed array extensions are available, use them.
   Otherwise, resort to the most efficient fallback.  */
