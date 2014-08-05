/* An XHRLoader class that can maintain multiple partially downloaded
   chunks, one for each XMLHttpRequest.  */

import "oevns";
import "compat";
import "cothread";
import "ajaxloaders";

/* Note that this chunk loader assumes all chunks are loaded from the
   same URL.  */

// maxCache: Maximum size of chunk cache in characters.

/* Note consider reqLen public for this function.  */

// Need to get total size of entire file.

var ChunkLoader = function(url, notifyFunc, maxCache) {
  this.url = url;
  this.notifyFunc = notifyFunc;
  this.httpRequest = null;
  this.byteRange = null;
  this.charRange = null;

  /* Each chunk is stored as follows:
     [ data (String), start, timestamp ] */
  this.chunks = [];
  this.nextTTag = 0; /* Next timestamp tag */
  this.maxCache = maxCache;
  this.cacheSize = 0;
  this.curCmpFunc = null;
};

OEV.ChunkLoader = ChunkLoader;
ChunkLoader.prototype = new XHRLoader(null, null);
ChunkLoader.prototype.constructor = ChunkLoader;

/* Compare chunks by their timestamp.  */
ChunkLoader.prototype.cmpTTag = function(a, b) {
  return a[2] - b[2];
};

/* Switch the sort mode to sort by timestamp.  */
ChunkLoader.prototype.sortTTag = function() {
  if (this.curCmpFunc != this.cmpTTag) {
    this.curCmpFunc = this.cmpTTag;
    this.chunks.sort(this.curCmpFunc);
  }
};

/* Compare chunks by their starting character.  */
ChunkLoader.prototype.cmpStart = function(a, b) {
  return a[1] - b[1];
};

/* Switch the sort mode to sort by starting character.  */
ChunkLoader.prototype.sortStart = function() {
  if (this.curCmpFunc != this.cmpStart) {
    this.curCmpFunc = this.cmpStart;
    this.chunks.sort(this.curCmpFunc);
  }
};

/* Disable inserting new chunks in sorted order.  */
ChunkLoader.prototype.disableSort = function() {
  this.curCmpFunc = null;
};

/* Insert a chunk into its correct position in the presorted chunk
   array, using the provided comparison function.  */
ChunkLoader.prototype.insertSorted = function(chunk, compare) {
  var chunks = this.chunks;
  var subPos = 0;
  var subLen = chunks.length;
  var median = subPos + (0|(subLen / 2));
  while (subLen > 0) {
    var cmpResult = compare(chunk, chunks[median]);
    if (cmpResult < 0) {
      subLen = median - subPos;
    } else if (cmpResult > 0) {
      subLen = subLen + subPos - (median + 1);
      subPos = median + 1;
    } else if (cmpResult == 0)
      break;
    median = subPos + (0|(subLen / 2));
  }
  chunks.splice(median, 0, chunk);
};

ChunkLoader.prototype.addChunk = function(responseText) {
  var charMin = 0;
  if (this.charRange && this.charRange[0])
    charMin = this.charRange[0];
  else if (this.byteRange && this.byteRange[0])
    charMin = this.byteRange[0];
  var chunk = [ responseText,
		charMin,
		this.nextTTag++ ];
  if (this.curCmpFunc)
    this.insertSorted(chunk, this.curCmpFunc);
  else this.chunks.push(chunk);
  this.cacheSize += responseText.length;
};

ChunkLoader.prototype.initCtx = function() {
  if (this.httpRequest) {
    this.httpRequest.abort();
    var httpRequest = this.httpRequest.responseText;
    if (httpRequest)
      this.addChunk(httpRequest);
    this.httpRequest = null;
  }
  return XHRLoader.prototype.initCtx.call(this);
};

/* Example data processing function.  You should override this with a
   more useful function in a derived class.  */
ChunkLoader.prototype.procData = function(httpRequest, responseText) {
  var doneProcData = false;
  var procError = false;

  // Program timed processing cothread loop here.
  doneProcData = true;

  if (procError) {
    httpRequest.abort();
    httpRequest.onreadystatechange = null;
    this.httpRequest = null;
    this.retVal = XHRLoader.PROC_ERROR;
    this.status.returnType = CothreadStatus.FINISHED;
    this.status.preemptCode = 0;
    return this.status;
  }

  if (httpRequest.readyState == 4 && doneProcData) {
    this.addChunk(responseText);

    /* Only manipulate the CothreadStatus object from within this
       function when processing is entirely finished.  */
    httpRequest.onreadystatechange = null;
    this.httpRequest = null;
    this.status.returnType = CothreadStatus.FINISHED;
    this.status.preemptCode = 0;
  }

  return this.status;
};

/* Evict chunks from the cache in LRU (or possibly FIFO) order until
   the cache does not exceed its maximum size.  */
ChunkLoader.prototype.evictOldChunks = function() {
  var chunks = this.chunks;
  var maxCache = this.maxCache;
  var cacheSize = this.cacheSize;
  this.sortTTag();

  var numEvChunks = 0;
  while (cacheSize > maxCache) {
    cacheSize -= chunks[0].length;
    numEvChunks++;
  }
  chunks.splice(0, numEvChunks);
  this.cacheSize = cacheSize;
};

/* Truncate overlapping requests and join together consecutive
   requests.  (Make the chunks "contiguous.")  */
ChunkLoader.prototype.contigChunks = function() {
  var chunks = this.chunks;
  this.sortStart();

  var joinChunks = [];
  for (var i = 1, chunks_len = chunks.length; i < chunks_len; i++) {
    var jcStart = i;

    while (i < chunks_len) {
      var lastChunkData = chunks[i-1][0];
      var lastChunkStart = chunks[i-1][1];
      var lastChunkEnd = lastChunkStart + lastChunkData.length;
      var chunkStart = chunks[i][1];

      if (lastChunkEnd > chunkStart) {
	var newLength = chunkStart - lastChunkStart;
	var newData = lastChunkData.substr(0, newLength);
	joinChunks.push(newData);
      } else if (lastChunkEnd == chunkStart)
	joinChunks.push(lastChunkData);
      else {
	if (joinChunks.length > 0)
	  joinChunks.push(lastChunkData);
	break;
      }

      i++;
    }

    if (joinChunks.length > 0) {
      chunks.splice(jcStart, i + 1 - jcStart, joinChunks.join(""));
      joinChunks.splice(0, joinChunks.length);
    }
  }
};

/* Join together consecutive requests.  Overlapping requests are left
   unchanged.  This may be useful if you are concerned that the string
   duplications in `contigChunks()` could have high overhead and you
   know that request chunks will never overlap.  */
ChunkLoader.prototype.joinChunks = function() {
  var chunks = this.chunks;
  this.sortStart();

  var joinChunks = [];
  for (var i = 1, chunks_len = chunks.length; i < chunks_len; i++) {
    var jcStart = i;

    while (i < chunks_len) {
      var lastChunkData = chunks[i-1][0];
      var lastChunkStart = chunks[i-1][1];
      var lastChunkEnd = lastChunkStart + lastChunkData.length;
      var chunkStart = chunks[i][1];

      if (lastChunkEnd == chunkStart)
	joinChunks.push(lastChunkData);
      else {
	if (joinChunks.length > 0)
	  joinChunks.push(lastChunkData);
	break;
      }

      i++;
    }

    if (joinChunks.length > 0) {
      chunks.splice(jcStart, i + 1 - jcStart, joinChunks.join(""));
      joinChunks.splice(0, joinChunks.length);
    }
  }
};
